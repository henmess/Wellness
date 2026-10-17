// צעדים מהשעון: קורא את Health Connect דרך השרת המקומי של האפליקציה HC Webhook באותו טלפון.
// Garmin Connect / Samsung Health כותבים ל-Health Connect, HC Webhook חושף אותו ב-127.0.0.1.
// ההגדרה נשמרת לכל מכשיר בנפרד (כל טלפון שייך לאדם אחד).
(() => {
  const KEY = 'wellness-watch';
  const AUTO_MS = 5 * 60 * 1000;
  let conf = load();          // { on, pid, port, token }
  let lastPull = null;
  let lastError = '';
  let pulling = false;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function store() {
    try { localStorage.setItem(KEY, JSON.stringify(conf)); } catch (e) { /* ignore */ }
  }
  const enabled = () => !!(conf && conf.on);

  async function pull(manual) {
    if (!enabled() || pulling) return;
    pulling = true;
    lastError = '';
    render();
    try {
      const res = await fetch(`http://127.0.0.1:${conf.port || 8787}/?days=7`, {
        cache: 'no-store',
        headers: conf.token ? { Authorization: `Bearer ${conf.token}` } : {},
      });
      if (res.status === 401) throw new Error('auth');
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();
      // סכום הצעדים לכל יום לפי שעון הטלפון
      const totals = {};
      (data.steps || []).forEach((r) => {
        const k = keyOf(new Date(r.start_time));
        totals[k] = (totals[k] || 0) + (Number(r.count) || 0);
      });
      let changed = 0;
      Object.entries(totals).forEach(([date, steps]) => {
        if (steps <= 0 || date > todayKey()) return;
        const d = day(conf.pid, date, true);
        if (d.steps !== steps) { d.steps = steps; d.stepsSource = 'watch'; changed++; }
      });
      lastPull = new Date();
      if (changed) { save(); renderAll(); }
      if (manual) toast(changed ? `⌚ עודכנו צעדים ל-${changed} ימים` : '⌚ הצעדים כבר מעודכנים');
    } catch (e) {
      lastError = e.message === 'auth'
        ? 'הטוקן של HC Webhook שגוי.'
        : 'אין חיבור ל-HC Webhook. ודאו שהשרת המקומי פעיל באפליקציה ושהאתר פתוח ב-Chrome באותו טלפון.';
      if (manual) toast('⌚ ' + lastError);
    } finally {
      pulling = false;
      render();
    }
  }

  /* ---------- UI ---------- */
  function render() {
    renderStepsLine();
    renderPanel();
  }

  function renderStepsLine() {
    const el = $('#watchLine');
    if (!el) return;
    const mine = enabled() && conf.pid === state.active;
    el.classList.toggle('hidden', !mine);
    if (!mine) return;
    const when = lastPull ? lastPull.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : null;
    el.innerHTML = `<span>${pulling ? '⏳ מושך מהשעון…' : lastError ? `⚠ ${lastError}` : when ? `⌚ מהשעון · עודכן ${when}` : '⌚ מחובר לשעון'}</span>
      <button type="button" class="chip" id="watchPullBtn" ${pulling ? 'disabled' : ''}>משיכה עכשיו</button>`;
    $('#watchPullBtn').onclick = () => pull(true);
  }

  function renderPanel() {
    const el = $('#watchPanel');
    if (!el) return;
    // לא בונים מחדש בזמן הקלדה בשדה
    if (el.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), select')) return;
    const c = conf || { on: false, pid: state.active, port: 8787, token: '' };
    const opts = Object.entries(state.profiles).map(([id, p]) =>
      `<option value="${id}" ${id === c.pid ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    el.innerHTML = `<h3>⌚ צעדים מהשעון</h3>
      <label class="switch-row"><input type="checkbox" id="watchOn" ${c.on ? 'checked' : ''}>
        <span>למשוך צעדים אוטומטית מ-Health Connect בטלפון הזה</span></label>
      <div class="watch-grid ${c.on ? '' : 'hidden'}">
        <div class="field"><label for="watchPid">הטלפון הזה של</label><select id="watchPid">${opts}</select></div>
        <div class="field"><label for="watchPort">פורט</label><input id="watchPort" type="number" min="1024" max="65535" value="${c.port || 8787}" dir="ltr"></div>
        <div class="field"><label for="watchToken">טוקן (אם הוגדר)</label><input id="watchToken" type="password" value="${escapeHtml(c.token || '')}" dir="ltr" autocomplete="off"></div>
        <button type="button" class="btn" id="watchTest">בדיקה</button>
      </div>
      ${lastError && c.on ? `<p class="hint sync-error">⚠ ${lastError}</p>` : ''}
      <p class="hint">דורש את האפליקציה HC Webhook עם "Local HTTP server" פעיל (ההוראות ב-README).</p>`;
    const update = () => {
      conf = {
        on: $('#watchOn').checked,
        pid: $('#watchPid') ? $('#watchPid').value : c.pid,
        port: parseInt($('#watchPort') ? $('#watchPort').value : c.port, 10) || 8787,
        token: $('#watchToken') ? $('#watchToken').value.trim() : c.token,
      };
      store();
      renderStepsLine();
    };
    $('#watchOn').onchange = () => { update(); renderPanel(); if (conf.on) pull(true); };
    ['#watchPid', '#watchPort', '#watchToken'].forEach((s) => { $(s).onchange = update; });
    $('#watchTest').onclick = () => { update(); pull(true); };
    el.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); update(); } });
    });
  }

  window.wellnessWatch = { render };
  render();
  pull(false);
  setInterval(() => { if (document.visibilityState === 'visible') pull(false); }, AUTO_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(false); });
})();
