// שמירה משותפת: התחברות עם Google וסנכרון ל-Firestore בזמן אמת.
// app.js נשאר המקור לממשק; כאן רק מעבירים את הנתונים בין המכשיר לענן.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const W = window.wellness;
const cfg = window.FIREBASE_CONFIG;

let fb = null;          // { auth, db, ...functions }
let user = null;
let hid = null;         // מזהה היומן המשותף
let members = [];
let unsubs = [];
let ready = { meta: false, days: false };
let synced = {};        // מה שידוע שנמצא בענן, לפי מזהה מסמך
let timer = null;
let status = cfg ? 'loading' : 'unconfigured';
let errorMsg = '';

const $ = (s) => document.querySelector(s);
const email = () => ((user && user.email) || '').toLowerCase();
const clean = (o) => JSON.parse(JSON.stringify(o));
// JSON עם מפתחות ממוינים, כדי שההשוואה לא תלויה בסדר השדות
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const metaOf = (s) => ({ profiles: s.profiles, customFoods: s.customFoods || [] });

/* ---------------- Firebase ---------------- */
async function init() {
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(cfg);
    fb = { ...authMod, ...fsMod, auth: authMod.getAuth(app), db: fsMod.getFirestore(app) };
    if (cfg.emulator) {
      fb.connectAuthEmulator(fb.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fb.connectFirestoreEmulator(fb.db, '127.0.0.1', 8080);
    }
    fb.onAuthStateChanged(fb.auth, (u) => {
      detach();
      user = u;
      if (u) findHousehold();
      else setStatus('signedout');
    });
  } catch (e) { fail(e); }
}

async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(fb.auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') await fb.signInWithRedirect(fb.auth, provider);
    else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') fail(e);
  }
}

async function findHousehold() {
  setStatus('syncing');
  try {
    const q = fb.query(fb.collection(fb.db, 'households'), fb.where('members', 'array-contains', email()));
    const snap = await fb.getDocs(q);
    if (snap.empty) setStatus('nohousehold');
    else attach(snap.docs[0].id);
  } catch (e) { fail(e); }
}

async function createHousehold() {
  setStatus('syncing');
  try {
    const ref = fb.doc(fb.collection(fb.db, 'households'));
    const s = W.getState();
    synced = { meta: stable(clean(metaOf(s))) };
    await fb.setDoc(ref, { members: [email()], ...clean(metaOf(s)), createdAt: fb.serverTimestamp() });
    attach(ref.id);
    W.toast('היומן המשותף נוצר ✓');
  } catch (e) { fail(e); }
}

function attach(id) {
  hid = id;
  ready = { meta: false, days: false };
  const hRef = fb.doc(fb.db, 'households', id);

  unsubs.push(fb.onSnapshot(hRef, (snap) => {
    if (!snap.exists()) { detach(); setStatus('nohousehold'); return; }
    const d = snap.data();
    members = d.members || [];
    if (!members.includes(email())) { detach(); setStatus('nohousehold'); return; }
    if (!snap.metadata.hasPendingWrites && d.profiles) {
      const meta = clean({ profiles: d.profiles, customFoods: d.customFoods || [] });
      synced.meta = stable(meta);
      W.applyRemote((s) => { s.profiles = meta.profiles; s.customFoods = meta.customFoods; });
    }
    ready.meta = true;
    onReady();
    renderPanel();
  }, fail));

  unsubs.push(fb.onSnapshot(fb.collection(hRef, 'days'), (snap) => {
    const changes = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites);
    if (changes.length) {
      W.applyRemote((s) => changes.forEach((c) => {
        const { pid, date, ...dayData } = c.doc.data();
        (s.days[pid] || (s.days[pid] = {}))[date] = dayData;
        synced[c.doc.id] = stable(dayData);
      }));
    }
    ready.days = true;
    onReady();
  }, fail));
}

function detach() {
  unsubs.forEach((u) => u());
  unsubs = [];
  hid = null;
  members = [];
  synced = {};
  ready = { meta: false, days: false };
}

// אחרי הטעינה הראשונה מהענן – מעלים מה שקיים רק במכשיר הזה
function onReady() {
  if (ready.meta && ready.days && status !== 'synced' && status !== 'saving') {
    setStatus('synced');
    flush();
  }
}

function push() {
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}

async function flush() {
  if (!hid || !ready.meta || !ready.days) return;
  const s = W.getState();
  const hRef = fb.doc(fb.db, 'households', hid);
  const ops = [];
  const meta = clean(metaOf(s));
  if (stable(meta) !== synced.meta) {
    synced.meta = stable(meta);
    ops.push((b) => b.update(hRef, meta));
  }
  Object.entries(s.days || {}).forEach(([pid, days]) => {
    Object.entries(days).forEach(([date, day]) => {
      const id = `${pid}_${date}`;
      const data = clean(day);
      const j = stable(data);
      if (j === synced[id]) return;
      synced[id] = j;
      ops.push((b) => b.set(fb.doc(hRef, 'days', id), { ...data, pid, date }));
    });
  });
  if (!ops.length) return;
  setStatus('saving');
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = fb.writeBatch(fb.db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
    setStatus('synced');
  } catch (e) { fail(e); }
}

async function invite(addr) {
  addr = addr.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { W.toast('כתובת המייל לא תקינה'); return; }
  try {
    await fb.updateDoc(fb.doc(fb.db, 'households', hid), { members: fb.arrayUnion(addr) });
    W.toast(`${addr} נוסף/ה ליומן ✓`);
  } catch (e) { fail(e); }
}

async function removeMember(addr) {
  if (!confirm(`להסיר את ${addr} מהיומן המשותף?`)) return;
  try { await fb.updateDoc(fb.doc(fb.db, 'households', hid), { members: fb.arrayRemove(addr) }); } catch (e) { fail(e); }
}

function fail(e) {
  console.error(e);
  errorMsg = e && e.code === 'permission-denied' ? 'אין הרשאה – ודאו שהמייל שלכם נוסף ליומן' : (e && (e.code || e.message)) || 'שגיאה';
  setStatus('error');
}

/* ---------------- UI ---------------- */
function setStatus(s) { status = s; renderPill(); renderPanel(); }

const PILL = {
  loading: ['⏳', 'מתחבר…'], signedout: ['☁', 'לא מחובר'], nohousehold: ['☁', 'אין יומן משותף'],
  syncing: ['⏳', 'טוען…'], saving: ['⏳', 'שומר…'], synced: ['✓', 'מסונכרן'], error: ['⚠', 'שגיאת סנכרון'],
};
function renderPill() {
  const pill = $('#syncPill');
  if (!pill) return;
  pill.classList.toggle('hidden', status === 'unconfigured');
  const [icon, text] = PILL[status] || ['☁', ''];
  pill.dataset.status = status;
  pill.innerHTML = `<span>${icon}</span><span class="sync-text">${text}</span>`;
}

function renderPanel() {
  const el = $('#syncPanel');
  if (!el) return;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const who = user ? `<p class="hint">מחובר/ת כ-<b dir="ltr">${esc(user.email)}</b> · <button type="button" class="link-btn" data-act="signout">התנתקות</button></p>` : '';
  let body = '';
  if (status === 'unconfigured') {
    body = '<p class="hint">השמירה המשותפת עוד לא הוגדרה באתר. עד אז הנתונים נשמרים רק במכשיר הזה.</p>';
  } else if (status === 'loading') {
    body = '<p class="hint">מתחבר…</p>';
  } else if (status === 'signedout') {
    body = `<p class="hint">התחברו עם חשבון Google כדי ששניכם תראו ותעדכנו את אותם נתונים מכל טלפון.</p>
      <button type="button" class="btn primary" data-act="signin">התחברות עם Google</button>`;
  } else if (status === 'nohousehold') {
    body = `${who}<p class="hint">עדיין אין יומן משותף עבור המייל הזה.<br>
      אם בן/בת הזוג כבר יצר/ה יומן – בקשו שיוסיפו את המייל שלכם בהגדרות, ואז לחצו "בדיקה שוב".</p>
      <div class="sync-row"><button type="button" class="btn primary" data-act="create">יצירת יומן משותף</button>
      <button type="button" class="btn" data-act="retry">בדיקה שוב</button></div>`;
  } else if (status === 'error') {
    body = `${who}<p class="hint sync-error">⚠ ${esc(errorMsg)}</p>
      <button type="button" class="btn" data-act="${user ? 'retry' : 'signin'}">נסו שוב</button>`;
  } else {
    body = `${who}
      <p class="hint">✓ הנתונים של שניכם נשמרים בענן ומתעדכנים בכל המכשירים.</p>
      <ul class="members">${members.map((m) => `<li><span dir="ltr">${esc(m)}</span>${m === email()
        ? '<small>(את/ה)</small>' : `<button type="button" class="del" data-remove="${esc(m)}" title="הסרה">✕</button>`}</li>`).join('')}</ul>
      <div class="sync-row">
        <input type="email" id="inviteEmail" dir="ltr" placeholder="partner@gmail.com" aria-label="מייל להזמנה">
        <button type="button" class="btn" data-act="invite">הזמנה</button>
      </div>`;
  }
  el.innerHTML = `<h3>☁ שמירה משותפת</h3>${body}`;
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => ({
      signin: signIn, create: createHousehold, retry: findHousehold,
      signout: () => fb.signOut(fb.auth),
      invite: () => invite($('#inviteEmail').value),
    })[b.dataset.act]();
  });
  el.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = () => removeMember(b.dataset.remove); });
  const inp = $('#inviteEmail');
  if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); invite(inp.value); } };
}

window.wellnessSync = { push, render: renderPanel };
renderPill();
renderPanel();
if (cfg) init();
