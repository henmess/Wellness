// הערכת קלוריות עם Claude למאכלים שלא נמצאו ברשימה.
// המפתח (Anthropic API key) נשמר רק בדפדפן הזה, והבקשה יוצאת ישירות מהדפדפן ל-Anthropic.
(() => {
  const KEY = 'wellness-claude-key';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
  const MODEL = 'claude-opus-5-5';

  const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const setKey = (k) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  let sdk = null;
  async function client() {
    if (!sdk) sdk = await import(SDK_URL);
    // המפתח של המשתמש עצמו, בדפדפן שלו – לכן מאפשרים שימוש מהדפדפן
    return { Anthropic: sdk.default, api: new sdk.default({ apiKey: getKey(), dangerouslyAllowBrowser: true }) };
  }

  const SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'שם המאכל בעברית, קצר' },
            portion: { type: 'string', description: 'יחידת המנה שנאכלה, למשל "מנה", "כוס", "יחידה", "צלחת"' },
            qty: { type: 'number', description: 'כמה יחידות נאכלו לפי הטקסט (ברירת מחדל 1)' },
            kcal_per_portion: { type: 'integer', description: 'הערכת קלוריות ליחידה אחת' },
            note: { type: 'string', description: 'הנחה קצרה על גודל המנה או ההרכב, בעברית' },
          },
          required: ['name', 'portion', 'qty', 'kcal_per_portion', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };

  const SYSTEM = `You estimate calories for food and drinks eaten in Israel, for a personal food diary.
For each phrase you get, return the food item(s) it describes with a realistic typical Israeli portion and calories per portion.
If a phrase lists separate components, return one item per component; a single dish stays one item.
Use the quantity stated in the text when there is one. Names, portions and notes are in Hebrew.
Phrases that are not food or drink (e.g. "מוזר", "היום") are ignored.`;

  // phrases: מה שלא זוהה; context: כל הטקסט, כדי להבין כמויות והקשר
  async function estimate(phrases, context) {
    const { Anthropic, api } = await client();
    try {
      const response = await api.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: `הטקסט המלא: "${context}"\nלא נמצאו ברשימה: ${phrases.map((p) => `"${p}"`).join(', ')}` }],
      });
      if (response.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { friendly: 'Claude לא הצליח להעריך את זה' });
      if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('max_tokens'), { friendly: 'התשובה נקטעה – נסו טקסט קצר יותר' });
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return JSON.parse(text).items || [];
    } catch (e) {
      if (e.friendly) throw e;
      const friendly = e instanceof Anthropic.AuthenticationError ? 'מפתח ה-API לא תקין'
        : e instanceof Anthropic.PermissionDeniedError ? 'למפתח אין הרשאה – בדקו את החשבון ב-Anthropic'
        : e instanceof Anthropic.RateLimitError ? 'יותר מדי בקשות – נסו שוב בעוד רגע'
        : e instanceof Anthropic.APIConnectionError ? 'אין חיבור ל-Claude כרגע'
        : e instanceof Anthropic.APIError && e.status === 402 ? 'אין יתרה בחשבון ה-API'
        : e instanceof Anthropic.APIError ? `שגיאה מ-Claude (${e.status})`
        : 'לא הצלחתי לקרוא את התשובה';
      throw Object.assign(e, { friendly });
    }
  }

  /* ---------- הגדרות ---------- */
  function renderPanel() {
    const el = $('#claudePanel');
    if (!el) return;
    const has = !!getKey();
    el.innerHTML = `<h3>🤖 הערכת קלוריות עם Claude</h3>
      <p class="hint">כשכותבים בתיבת "זיהוי" משהו שלא נמצא ברשימה, Claude מעריך את הקלוריות.
        צריך מפתח API אישי מ-<b dir="ltr">console.anthropic.com</b> (API Keys). המפתח נשמר רק בדפדפן הזה.
        עלות משוערת: כ-2 סנט לבדיקה.</p>
      ${has ? `<div class="sync-row"><span class="hint">✓ מפתח שמור</span>
          <button type="button" class="btn" data-ck="remove">הסרת המפתח</button></div>`
        : `<div class="sync-row"><input type="password" id="claudeKey" dir="ltr" placeholder="sk-ant-…" autocomplete="off">
          <button type="button" class="btn primary" data-ck="save">שמירה</button></div>`}`;
    const save = el.querySelector('[data-ck=save]');
    if (save) save.onclick = () => {
      const k = $('#claudeKey').value.trim();
      if (!/^sk-ant-/.test(k)) { toast('המפתח מתחיל ב-sk-ant-'); return; }
      setKey(k); renderPanel(); toast('🤖 המפתח נשמר');
    };
    const rm = el.querySelector('[data-ck=remove]');
    if (rm) rm.onclick = () => { setKey(''); renderPanel(); };
    const inp = el.querySelector('#claudeKey');
    if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } };
  }

  window.wellnessClaude = { enabled: () => !!getKey(), estimate, renderPanel };
  renderPanel();
})();
