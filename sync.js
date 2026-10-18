// שמירה משותפת דרך מאגר GitHub פרטי.
// הנתונים נשמרים כקובצי JSON: meta.json (פרופילים) ו-days/YYYY-MM.json (ימים לפי חודש).
// כל מכשיר מושך שינויים כל חצי דקה ודוחף את מה שהשתנה אצלו.
const API = 'https://api.github.com';
const CONF_KEY = 'wellness-sync';
const POLL_MS = 30000;
const W = window.wellness;

let conf = loadConf();      // { repo: 'owner/name', token }
let status = conf ? 'loading' : 'off';
let errorMsg = '';
let lastSync = null;
let shas = {};              // נתיב קובץ → sha אחרון שידוע לנו
let synced = {};            // 'meta' / 'p1/2026-10-17' → JSON של מה שנמצא בענן
let busy = false;
let again = false;
let timer = null;

const $ = (s) => document.querySelector(s);
const clean = (o) => JSON.parse(JSON.stringify(o));
// JSON עם מפתחות ממוינים, כדי שההשוואה לא תלויה בסדר השדות
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const metaOf = (s) => clean({ profiles: s.profiles, customFoods: s.customFoods || [], foodOverrides: s.foodOverrides || {} });

function loadConf() {
  try { return JSON.parse(localStorage.getItem(CONF_KEY)); } catch (e) { return null; }
}
function saveConf(c) {
  try { c ? localStorage.setItem(CONF_KEY, JSON.stringify(c)) : localStorage.removeItem(CONF_KEY); } catch (e) { /* ignore */ }
}

/* ---------------- GitHub API ---------------- */
async function gh(url, opts = {}) {
  const res = await fetch(`${API}${url}`, {
    cache: 'no-store',
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${conf.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 404 && !opts.body) return null;
  if (!res.ok) { const e = new Error(`GitHub ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}
const contents = (path, opts) => gh(`/repos/${conf.repo}/contents${path ? '/' + path : ''}`, opts);

const toB64 = (str) => {
  let bin = '';
  new TextEncoder().encode(str).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function readFile(path) {
  const f = await contents(path);
  if (!f) { delete shas[path]; return null; }
  shas[path] = f.sha;
  return JSON.parse(fromB64(f.content));
}
async function writeFile(path, data) {
  const body = { message: `Update ${path}`, content: toB64(JSON.stringify(data, null, 1)) };
  if (shas[path]) body.sha = shas[path];
  const r = await contents(path, { method: 'PUT', body: JSON.stringify(body) });
  shas[path] = r.content.sha;
}

/* ---------------- Sync ---------------- */
const dayKey = (pid, date) => `${pid}/${date}`;
function isDirty(key, local) {
  if (local === undefined) return false;
  return stable(local) !== synced[key];
}

// מושכים מהענן כל קובץ שה-sha שלו השתנה; לא דורסים שינויים מקומיים שעוד לא נשמרו
async function pull() {
  const root = (await contents('')) || [];
  const metaEntry = root.find((e) => e.path === 'meta.json');
  if (metaEntry && metaEntry.sha !== shas['meta.json']) {
    const meta = await readFile('meta.json');
    const local = metaOf(W.getState());
    // בפעם הראשונה הענן קובע את הפרופילים, אחר כך רק אם לא שינינו מקומית
    if (meta && (synced.meta === undefined || !isDirty('meta', local))) {
      synced.meta = stable(meta);
      W.applyRemote((s) => {
        s.profiles = meta.profiles;
        s.customFoods = meta.customFoods || [];
        s.foodOverrides = meta.foodOverrides || {};
      });
    }
  }
  if (!root.some((e) => e.path === 'days')) return;
  const files = (await contents('days')) || [];
  for (const f of files) {
    if (f.sha !== shas[f.path]) applyMonth(await readFile(f.path));
  }
}

function applyMonth(month) {
  if (!month) return;
  W.applyRemote((s) => {
    Object.entries(month).forEach(([pid, days]) => {
      Object.entries(days).forEach(([date, day]) => {
        const k = dayKey(pid, date);
        const local = s.days[pid] && s.days[pid][date];
        // שינוי מקומי שעוד לא עלה לענן גובר; הוא יידחף מיד אחרי המשיכה
        if (isDirty(k, local) && stable(local) !== stable(day)) return;
        (s.days[pid] || (s.days[pid] = {}))[date] = day;
        synced[k] = stable(day);
      });
    });
  });
}

async function pushChanges() {
  const s = W.getState();
  const meta = metaOf(s);
  if (stable(meta) !== synced.meta) await withRetry('meta.json', async () => {
    await writeFile('meta.json', meta);
    synced.meta = stable(meta);
  });

  const months = new Set();
  Object.entries(s.days || {}).forEach(([pid, days]) => Object.entries(days).forEach(([date, day]) => {
    if (isDirty(dayKey(pid, date), day)) months.add(date.slice(0, 7));
  }));
  for (const m of months) {
    const path = `days/${m}.json`;
    await withRetry(path, async () => {
      const content = {};
      Object.entries(W.getState().days).forEach(([pid, days]) => Object.entries(days).forEach(([date, day]) => {
        if (date.startsWith(m)) (content[pid] || (content[pid] = {}))[date] = clean(day);
      }));
      await writeFile(path, content);
      Object.entries(content).forEach(([pid, days]) => Object.entries(days).forEach(([date, day]) => {
        synced[dayKey(pid, date)] = stable(day);
      }));
    });
  }
}

// אם המכשיר השני שמר באמצע – מושכים את הגרסה שלו, ממזגים ומנסים שוב
async function withRetry(path, write) {
  for (let i = 0; ; i++) {
    try { return await write(); } catch (e) {
      if (i >= 3 || (e.status !== 409 && e.status !== 422)) throw e;
      const remote = await readFile(path);
      if (path !== 'meta.json') applyMonth(remote);
    }
  }
}

async function sync() {
  if (!conf) return;
  if (busy) { again = true; return; }
  busy = true;
  if (status !== 'synced') setStatus('loading');
  try {
    await pull();
    await pushChanges();
    lastSync = new Date();
    setStatus('synced');
  } catch (e) {
    fail(e);
  } finally {
    busy = false;
    if (again) { again = false; sync(); }
  }
}

function push() {
  if (!conf) return;
  clearTimeout(timer);
  timer = setTimeout(sync, 2000);
}

async function connect(repo, token) {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  token = token.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) { W.toast('מלאו שם מאגר (owner/name) וטוקן'); return; }
  conf = { repo, token };
  shas = {}; synced = {};
  setStatus('loading');
  try {
    const info = await gh(`/repos/${repo}`);
    if (!info) throw Object.assign(new Error('not found'), { status: 404 });
    if (!info.private) {
      conf = null;
      errorMsg = 'המאגר ציבורי! הנתונים יהיו גלויים לכולם. הפכו אותו לפרטי (Settings → Danger Zone) ונסו שוב.';
      setStatus('error');
      return;
    }
    if (info.permissions && !info.permissions.push) throw Object.assign(new Error('read only'), { status: 403 });
    saveConf(conf);
    await sync();
    if (status === 'synced') W.toast('השמירה המשותפת פעילה ✓');
  } catch (e) {
    conf = null;
    fail(e);
  }
}

function disconnect() {
  if (!confirm('לנתק את השמירה המשותפת במכשיר הזה? הנתונים יישארו במכשיר.')) return;
  conf = null; shas = {}; synced = {};
  saveConf(null);
  setStatus('off');
}

function shareLink() {
  const link = `${location.origin}${location.pathname}#connect=${encodeURIComponent(toB64(JSON.stringify(conf)))}`;
  const text = 'קישור לחיבור ליומן הבריאות המשותף שלנו (לפתוח בטלפון שלך פעם אחת):';
  if (navigator.share) navigator.share({ title: 'Wellness', text, url: link }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => W.toast('הקישור הועתק – שלחו אותו לטלפון השני'));
  else prompt('העתיקו את הקישור:', link);
}

// קישור חיבור מהטלפון השני: #connect=...
function readConnectLink() {
  const m = location.hash.match(/^#connect=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const c = JSON.parse(fromB64(decodeURIComponent(m[1])));
    if (c.repo && c.token) { connect(c.repo, c.token); return true; }
  } catch (e) { W.toast('קישור החיבור לא תקין'); }
}

function fail(e) {
  console.error(e);
  errorMsg = e.status === 401 ? 'הטוקן לא תקין או שפג תוקפו – צרו טוקן חדש.'
    : e.status === 403 || e.status === 404 ? 'אין גישה למאגר – בדקו את שם המאגר ושלטוקן יש הרשאת Contents: Read and write.'
    : !navigator.onLine ? 'אין חיבור לאינטרנט – השינויים יישמרו כשהחיבור יחזור.'
    : 'שגיאת סנכרון – ננסה שוב בקרוב.';
  setStatus('error');
}

/* ---------------- UI ---------------- */
function setStatus(s) { status = s; renderPill(); renderPanel(); }

const PILL = { loading: ['⏳', 'מסנכרן…'], synced: ['✓', 'מסונכרן'], error: ['⚠', 'שגיאת סנכרון'] };
function renderPill() {
  const pill = $('#syncPill');
  if (!pill) return;
  pill.classList.toggle('hidden', status === 'off');
  const [icon, text] = PILL[status] || ['☁', ''];
  pill.dataset.status = status;
  pill.innerHTML = `<span>${icon}</span><span class="sync-text">${text}</span>`;
}

function renderPanel() {
  const el = $('#syncPanel');
  if (!el) return;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  let body;
  if (status === 'off' || (status === 'error' && !conf)) {
    body = `${status === 'error' ? `<p class="hint sync-error">⚠ ${esc(errorMsg)}</p>` : ''}
      <p class="hint">כדי ששניכם תראו את אותם נתונים, חברו מאגר GitHub פרטי (ההוראות ב-README).
      בטלפון השני אין צורך בזה – פשוט פותחים את קישור החיבור שתשלחו.</p>
      <div class="sync-form">
        <input id="syncRepo" dir="ltr" placeholder="henmess/wellness-data" aria-label="שם המאגר" value="henmess/wellness-data">
        <input id="syncToken" dir="ltr" type="password" placeholder="github_pat_…" aria-label="טוקן" autocomplete="off">
        <button type="button" class="btn primary" data-act="connect">חיבור</button>
      </div>`;
  } else if (status === 'loading' && !lastSync) {
    body = '<p class="hint">⏳ מתחבר ומסנכרן…</p>';
  } else {
    const when = lastSync ? lastSync.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '–';
    body = `${status === 'error' ? `<p class="hint sync-error">⚠ ${esc(errorMsg)}</p>` : `<p class="hint">✓ מחובר ל-<b dir="ltr">${esc(conf.repo)}</b> · סנכרון אחרון ${when}</p>`}
      <div class="sync-row">
        <button type="button" class="btn primary" data-act="share">📲 שליחת קישור לטלפון השני</button>
        <button type="button" class="btn" data-act="sync">סנכרון עכשיו</button>
        <button type="button" class="btn" data-act="disconnect">ניתוק</button>
      </div>
      <p class="hint">הקישור מכיל את הגישה למאגר – שלחו אותו רק לבן/בת הזוג.</p>`;
  }
  el.innerHTML = `<h3>☁ שמירה משותפת</h3>${body}`;
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => ({
      connect: () => connect($('#syncRepo').value, $('#syncToken').value),
      share: shareLink, sync, disconnect,
    })[b.dataset.act]();
  });
  el.querySelectorAll('input').forEach((inp) => {
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); connect($('#syncRepo').value, $('#syncToken').value); } };
  });
}

window.wellnessSync = { push };
renderPill();
renderPanel();
if (!readConnectLink() && conf) sync();
setInterval(() => { if (conf && document.visibilityState === 'visible') sync(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (conf && document.visibilityState === 'visible') sync(); });
window.addEventListener('online', () => conf && sync());
window.addEventListener('hashchange', readConnectLink);
