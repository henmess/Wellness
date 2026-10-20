// הוספה חכמה: זיהוי מאכלים מטקסט חופשי, וסריקת ברקוד (Open Food Facts).
// משתמש בפונקציות ובמשתנים של app.js (tray, allFoods, afterTrayChange ...).
(() => {
  /* ---------------- טקסט חופשי ---------------- */
  const NUMS = {
    אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4,
    חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, עשר: 10, חצי: 0.5, רבע: 0.25,
  };
  const FILLER = /^(אכלתי|שתיתי|היום|אתמול|בבוקר|בצהריים|בערב|ארוחת|לארוחת|משהו|הרבה|פרוס(ה|ות)|כוס(ות)?|כפ(ית|יות|ות)|כף|יחיד(ה|ות)|מנ(ה|ות)|צלח(ת|ות)|גביע(ים)?|קער(ה|ות)|חתיכ(ה|ות)|משולש(ים)?|כדור(ים)?|שקית|בקבוק|פחית|קופס(ה|ת)|של|עם|גם|קצת|ועוד|עוד|ו|גרם|גר|ג'|וחצי|ורבע)$/;
  const COOKED = /\s+(מבושל(ת|ים|ות)?|צלוי(ה|ים|ות)?|מאוד(ה|ים|ות)|אפוי(ה|ים)?|מוקפצ(ים|ת)|מטוגנ(ים|ת)?|קלוי(ה)?)(?=\s|$)/g;
  // שמות קצרים נפוצים → המאכל ברשימה
  const SHORT = {
    אורז: 'אורז לבן מבושל', פסטה: 'פסטה מבושלת', סלט: 'סלט ירקות (בלי שמן)', קפה: 'קפה הפוך', לחם: 'לחם לבן',
    עוף: 'חזה עוף צלוי', מרק: 'מרק ירקות', המבורגר: 'המבורגר בלחמניה', סטייק: 'סטייק אנטריקוט', יוגורט: 'יוגורט 3%',
    קורנפלקס: 'קורנפלקס', טונה: 'טונה במים', סלמון: 'סלמון', שוקולד: 'שוקולד חלב', אספרסו: 'קפה שחור / תה',
  };
  const IRREGULAR = { ביצה: 'ביצים', תמר: 'תמרים', פלפל: 'פלפלים', אבוקדו: 'אבוקדו', עגבנייה: 'עגבניות', קציצה: 'קציצות', פיתה: 'פיתות' };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripVav = (w) => (w.length > 2 && w[0] === 'ו' ? w.slice(1) : w);

  // שמות חלופיים לכל מאכל: בלי סוגריים/אחוזים, כל צד של "/", ובלי "מבושל/צלוי"
  function aliases(name) {
    const short = Object.keys(SHORT).filter((k) => SHORT[k] === name);
    const core = name.replace(/\(.*?\)/g, ' ').replace(/\d+%/g, ' ').replace(/\s+/g, ' ').trim();
    const out = new Set([core]);
    core.split('/').forEach((x) => out.add(x.trim()));
    [...out].forEach((x) => out.add(x.replace(COOKED, '').trim()));
    // רבים: בננה → בננות, תפוח → תפוחים (+ כמה צורות לא סדירות)
    [...out].forEach((x) => {
      const [first, ...rest] = x.split(' ');
      const pl = IRREGULAR[first] || (first.endsWith('ה') ? `${first.slice(0, -1)}ות` : `${first}ים`);
      if (first.length >= 3) out.add([pl, ...rest].join(' '));
    });
    short.forEach((x) => out.add(x));
    return [...out].filter((x) => x.length >= 2);
  }

  function numberOf(word) {
    const w = stripVav(word);
    if (/^\d+([.,]\d+)?$/.test(w)) return parseFloat(w.replace(',', '.'));
    return NUMS[w] != null ? NUMS[w] : NUMS[word];
  }

  function parseFreeText(text) {
    const src = ` ${text.replace(/[\n;+]/g, ',')} `;
    const cands = [];
    allFoods().forEach((food, order) => {
      aliases(food.name).forEach((al) => {
        const re = new RegExp(`(^|[\\s,])([ובהלכשמ]?)(${esc(al)})(?=[\\s,.!?]|$)`, 'g');
        let m;
        while ((m = re.exec(src))) {
          const start = m.index + m[1].length;
          cands.push({ start, end: start + m[2].length + m[3].length, food, len: al.length, order, weak: SHORT[al] === food.name });
        }
      });
    });
    // הארוך ביותר קודם; בשוויון – מוצרים שלי ואז הסדר ברשימה
    cands.sort((a, b) => b.len - a.len || a.order - b.order);
    const taken = [];
    cands.forEach((c) => { if (!taken.some((t) => c.start < t.end && t.start < c.end)) taken.push(c); });
    taken.sort((a, b) => a.start - b.start);
    // שם קצר ("סלט", "מרק") שאחריו מילה לא מוכרת הוא כנראה מאכל אחר ("סלט קינואה") – לא לוקחים
    for (let i = taken.length - 1; i >= 0; i--) {
      const c = taken[i];
      if (!c.weak) continue;
      const next = (src.slice(c.end).match(/^\s+([^\s,]+)/) || [])[1];
      const nextIsFood = taken[i + 1] && src.slice(c.end, taken[i + 1].start).trim() === '';
      if (next && !nextIsFood && next[0] !== 'ו' && numberOf(next) == null && !FILLER.test(next)) taken.splice(i, 1);
    }

    let consumed = 0; // עד איפה כבר נוצלו מילים (למשל "וחצי" של המאכל הקודם)
    const found = taken.map((c, i) => {
      // כמות: רק המילים הצמודות לפני המאכל – מספרים ומילות קישור, עד מילה אחרת/פסיק/מאכל קודם
      const from = Math.max(consumed, i ? taken[i - 1].end : 0, src.lastIndexOf(',', c.start) + 1);
      const before = src.slice(from, c.start).trim().split(/\s+/).filter(Boolean);
      let qty = null;
      let grams = false;
      for (let j = before.length - 1; j >= 0; j--) {
        const w = before[j];
        const n = numberOf(w);
        if (n != null) qty = qty != null && n >= 1 && qty < 1 ? n + qty : (qty != null && n < 1 ? qty + n : n);
        else if (/^(גרם|גר|ג')$/.test(stripVav(w))) grams = true;
        else if (!FILLER.test(w) && !FILLER.test(stripVav(w))) break;
      }
      consumed = c.end;
      const afterM = src.slice(c.end).match(/^\s*(וחצי|ורבע)(?=[\s,]|$)/);
      if (afterM) {
        qty = (qty || 1) + (afterM[1] === 'וחצי' ? 0.5 : 0.25);
        consumed = c.end + afterM[0].length;
      }
      const useGrams = grams && !isFixed(c.food);
      return { food: c.food, qty: qty || (useGrams ? 100 : 1), mode: useGrams ? 'g' : 'unit' };
    });

    // מה שנשאר אחרי שמורידים את המאכלים, הכמויות ומילות הקישור = לא זוהה
    let rest = src;
    [...taken].reverse().forEach((c) => { rest = `${rest.slice(0, c.start)},${rest.slice(c.end)}`; });
    const unknown = rest.split(',').map((ph) => {
      const words = ph.trim().split(/\s+/)
        .filter((w) => w && numberOf(w) == null && !FILLER.test(w) && !FILLER.test(stripVav(w)) && !/^[\d.,]+$/.test(w));
      if (words.length) words[0] = stripVav(words[0]);
      return words.join(' ');
    }).filter((ph) => ph.length >= 2);
    return { found, unknown };
  }

  function addFreeText() {
    const input = $('#freeText');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    const { found, unknown } = parseFreeText(text);
    found.forEach((f) => tray.push({ food: f.food, qty: f.qty, mode: f.mode }));
    input.value = unknown.join(', ');
    if (found.length) {
      afterTrayChange();
      $('#tray').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (unknown.length && window.wellnessClaude && window.wellnessClaude.enabled()) {
      askClaude(unknown, text, found.length);
    } else if (unknown.length) {
      // בלי מפתח: הערכה חינמית דרך אפליקציית AI
      openAiDialog({ phrases: unknown, text });
      // מציגים את ההצעה "➕ הוספת ... כמוצר חדש" עבור הראשון שלא זוהה
      $('#pickerSearch').value = unknown[0];
      renderProducts();
      toast(found.length
        ? `זוהו ${found.length} מוצרים · לא זוהה: ${unknown.join(', ')}`
        : `לא זיהיתי: ${unknown.join(', ')} – אפשר להוסיף כמוצר חדש`);
    } else if (found.length) {
      toast(`זוהו ${found.length} מוצרים – בדקו כמויות והוסיפו`);
    }
  }

  async function askClaude(unknown, text, foundN) {
    const btn = $('#freeTextGo');
    btn.disabled = true;
    btn.textContent = '🤖 בודק…';
    toast(`${foundN ? `זוהו ${foundN} מוצרים · ` : ''}🤖 Claude מעריך: ${unknown.join(', ')}`);
    try {
      const items = await window.wellnessClaude.estimate(unknown, text);
      items.filter((it) => it.kcal_per_portion >= 0).forEach((it) => tray.push({
        food: { name: it.name, custom: true, oneOff: true, ai: true, unit: it.portion || 'מנה', kcalUnit: it.kcal_per_portion, note: it.note },
        qty: it.qty > 0 ? it.qty : 1, mode: 'unit',
      }));
      if (items.length) {
        $('#freeText').value = '';
        afterTrayChange();
        $('#tray').scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(`🤖 נוספו ${items.length} הערכות – ⭐ ליד פריט שומר אותו ב"שלי"`);
      } else {
        toast('Claude לא מצא כאן מאכל');
      }
    } catch (e) {
      toast(`🤖 ${e.friendly || 'שגיאה'} – אפשר להוסיף ידנית`);
      $('#pickerSearch').value = unknown[0];
      renderProducts();
    } finally {
      btn.disabled = false;
      btn.textContent = 'זיהוי';
    }
  }

  /* ---------------- הערכה חינמית: שליחה לאפליקציית AI והדבקת התשובה ---------------- */
  let aiJob = null; // { phrases, text } או { photo: dataUrl, note }
  const FORMAT = '{"title":"שם קצר לארוחה","items":[{"name":"שניצל","portion":"יחידה","qty":1,"kcal_per_portion":330,"note":"כ-130 גרם"}]}';

  function aiPrompt(job) {
    if (job.label) {
      return `בתמונה תווית ערכים תזונתיים של מוצר${job.name ? ` (${job.name})` : ''}.
קרא ממנה את האנרגיה (קלוריות) ל-100 גרם/מ"ל ואת גודל המנה בגרם, אם מופיע. אל תעריך – רק מה שכתוב.
ענה רק בבלוק JSON בפורמט הזה, בלי הסבר:
{"name":"שם המוצר","kcal_per_100g":535,"serving_g":25}`;
    }
    const what = job.photo
      ? `בתמונה המצורפת הארוחה שלי.${job.note ? ` הערה: ${job.note}.` : ''}`
      : `אכלתי: ${job.phrases.join(', ')} (מתוך המשפט: "${job.text}").`;
    return `אני רושמת ביומן תזונה מה אכלתי. ${what}
פרק כל מרכיב בנפרד (כולל שמן ורטבים אם יש בהם הרבה קלוריות), הערך גודל מנה ישראלי טיפוסי וקלוריות ליחידה.
ענה רק בבלוק JSON בפורמט הזה, בלי הסבר:
${FORMAT}`;
  }

  // dataURL → File בלי await, כדי שהשיתוף יקרה מיד בלחיצה (הדפדפן דורש זאת)
  function dataUrlToFile(dataUrl, name) {
    const [head, b64] = dataUrl.split(',');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: head.match(/:(.*?);/)[1] });
  }

  function openAiDialog(job) {
    if (job.photo) job.file = dataUrlToFile(job.photo, 'meal.jpg');
    aiJob = job;
    $('#aiWhat').textContent = job.label ? 'קריאת הקלוריות מהתווית' : job.photo ? 'הערכה של הארוחה מהתמונה' : `הערכה של: ${job.phrases.join(', ')}`;
    $('#aiAnswer').value = '';
    aiError('');
    $('#aiShare').textContent = job.photo ? '📤 שליחת התמונה והבקשה' : '📤 שליחה';
    $('#aiDialog').showModal();
  }

  async function shareJob() {
    const text = aiPrompt(aiJob);
    try {
      if (aiJob.file) {
        if (navigator.canShare && navigator.canShare({ files: [aiJob.file] })) {
          await navigator.share({ files: [aiJob.file], text });
          return;
        }
      } else if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return; // ביטלו את השיתוף
    }
    // אין שיתוף (למשל במחשב): מעתיקים את הבקשה, ואת התמונה מעלים ידנית
    await copyPrompt();
    if (aiJob.photo) toast('הבקשה הועתקה – פתחו את אפליקציית ה-AI, הדביקו והעלו את התמונה');
  }

  async function copyPrompt() {
    const text = aiPrompt(aiJob);
    try { await navigator.clipboard.writeText(text); toast('הבקשה הועתקה – הדביקו אותה באפליקציית ה-AI'); }
    catch (e) { prompt('העתיקו את הבקשה:', text); }
  }

  /* ---- קריאת תשובה מאפליקציית AI: סלחנית לכל מיני ניסוחים של ChatGPT / Gemini / Claude ---- */
  // תווי כיוון נסתרים, רווח קשיח ומירכאות "חכמות" שנוספים בהעתקה מהטלפון
  const tidy = (raw) => String(raw || '')
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");

  const num = (x) => {
    if (typeof x === 'number') return x;
    const t = String(x == null ? '' : x).trim();
    const frac = t.match(/^(\d+)\s*\/\s*(\d+)/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    if (/^חצי/.test(t)) return 0.5;
    const n = parseFloat(t.replace(/,/g, '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return undefined; };

  // כל קטעי ה-JSON בטקסט: בתוך ``` וגם לפי סוגריים מאוזנים (מתעלם מסוגריים בתוך מחרוזות)
  function jsonCandidates(t) {
    const out = [];
    for (const m of t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) out.push(m[1]);
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== '{' && t[i] !== '[') continue;
      let depth = 0, inStr = false;
      for (let j = i; j < t.length; j++) {
        const c = t[j];
        if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') { depth--; if (!depth) { out.push(t.slice(i, j + 1)); i = j; break; } }
      }
    }
    return out.sort((x, y) => y.length - x.length);
  }
  function tryJson(c) {
    for (const v of [c, c.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1')]) {
      try { return JSON.parse(v); } catch (e) { /* הבא */ }
    }
    return undefined;
  }

  function normItem(it) {
    if (!it || typeof it !== 'object') return null;
    const name = String(pick(it, ['name', 'item', 'food', 'dish', 'שם', 'מאכל', 'title', 'meal_name', 'meal']) || '').trim();
    const qty = num(pick(it, ['qty', 'quantity', 'amount', 'כמות'])) || 1;
    let kcal = num(pick(it, ['kcal_per_portion', 'kcal_per_unit', 'calories_per_portion', 'kcal', 'calories', 'cal', 'energy', 'קלוריות', 'קק"ל']));
    const total = num(pick(it, ['total_kcal', 'kcal_total', 'total_calories', 'calories_total']));
    if (!Number.isFinite(kcal) && Number.isFinite(total)) kcal = total / qty;
    if (!name || !Number.isFinite(kcal) || kcal < 0) return null;
    const portion = pick(it, ['portion', 'unit', 'serving', 'serving_size', 'מנה', 'יחידה']);
    return {
      name, qty, kcal_per_portion: Math.round(kcal),
      portion: typeof portion === 'string' && portion.length <= 20 ? portion : 'מנה',
      note: String(pick(it, ['note', 'notes', 'assumption', 'portion_note', 'הערה']) || (typeof portion === 'string' && portion.length > 20 ? portion : '')),
    };
  }
  function itemsOf(v) {
    if (Array.isArray(v)) return { title: '', list: v };
    if (!v || typeof v !== 'object') return { title: '', list: [] };
    const arr = pick(v, ['items', 'foods', 'components', 'ingredients', 'meal', 'מרכיבים', 'פריטים']);
    if (Array.isArray(arr)) return { title: String(pick(v, ['title', 'meal_name', 'שם']) || ''), list: arr };
    return { title: '', list: [v] };
  }

  function parseAiAnswer(raw) {
    const t = tidy(raw);
    let best = null;
    for (const c of jsonCandidates(t)) {
      const v = tryJson(c);
      if (v === undefined) continue;
      const { title, list } = itemsOf(v);
      const items = list.map(normItem).filter(Boolean);
      if (items.length) { best = { title, items }; break; }
    }
    // JSON שבור: זוגות "name" ... "kcal" בכל מקום בטקסט
    const items = [];
    for (const m of t.matchAll(/"(?:name|item|food|שם)"\s*:\s*"([^"]+)"[^{}]*?"(?:kcal_per_portion|kcal|calories|קלוריות)"\s*:\s*"?(\d+(?:\.\d+)?)/g)) {
      items.push({ name: m[1].trim(), portion: 'מנה', qty: 1, kcal_per_portion: Math.round(Number(m[2])), note: '' });
    }
    // JSON שנחתך באמצע: רק חלק מהפריטים נסגרו – הזוגות מוצאים את כולם
    if (best && best.items.length >= items.length) return best;
    if (items.length) return { title: best ? best.title : '', items };
    // טקסט רגיל: "שניצל – כ-330 קק"ל" בכל שורה
    t.replace(/״/g, '"').split('\n').forEach((line) => {
      const l = line.replace(/\*\*/g, '').replace(/^[\s*•\-\d.)|]+/, '');
      if (/סה"כ|סך הכול|סך הכל|total/i.test(l)) return;
      const m = l.match(/^(.+?)[\s:–—|-]+(?:כ-?|~|בערך\s*)?\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?\s*(?:קק"ל|קלוריות|kcal|cal)/i);
      if (m) {
        const kcal = m[3] ? (Number(m[2]) + Number(m[3])) / 2 : Number(m[2]); // טווח 300-350 → ממוצע
        items.push({ name: m[1].replace(/[:\-–—|(]+$/, '').trim(), portion: 'מנה', qty: 1, kcal_per_portion: Math.round(kcal), note: '' });
      }
    });
    return { title: '', items };
  }

  // תשובה לתווית: JSON עם קלוריות ל-100 גרם, או "535 קק"ל ל-100 גרם" בטקסט
  function parseLabelAnswer(raw) {
    const t = tidy(raw);
    for (const c of jsonCandidates(t)) {
      const v = tryJson(c);
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const kcal = num(pick(v, ['kcal_per_100g', 'kcal_100g', 'calories_per_100g', 'energy_kcal_100g', 'kcal', 'calories', 'קלוריות']));
      if (Number.isFinite(kcal) && kcal >= 0) {
        return { name: String(pick(v, ['name', 'product', 'שם']) || ''), kcal_per_100g: kcal, serving_g: num(pick(v, ['serving_g', 'serving', 'serving_size', 'מנה'])) || 100 };
      }
    }
    const m = t.replace(/״/g, '"').match(/(\d{1,4}(?:\.\d)?)\s*(?:קק"ל|קלוריות|kcal)/i);
    return m ? { name: '', kcal_per_100g: Number(m[1]), serving_g: 100 } : null;
  }

  function aiError(msg) {
    const el = $('#aiError');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  function addAiItems(items, title) {
    items.forEach((it) => tray.push({
      food: { name: it.name, custom: true, oneOff: true, ai: true, unit: it.portion || 'מנה', kcalUnit: it.kcal_per_portion, note: it.note || '' },
      qty: it.qty > 0 ? Number(it.qty) : 1, mode: 'unit',
    }));
    lastPhotoTitle = title || '';
    afterTrayChange();
    $('#tray').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const total = items.reduce((s, it) => s + it.kcal_per_portion * (it.qty > 0 ? it.qty : 1), 0);
    toast(`🤖 ${title ? `${title} · ` : ''}${items.length} פריטים · כ-${fmt(total)} קק"ל – ⭐ / 💾 לשמירה`);
  }

  // תשובה לתווית: JSON עם kcal_per_100g, או "535 קק"ל ל-100 גרם"
  function parseLabelAnswer(raw) {
    const t = raw.replace(/[“”]/g, '"');
    const s = t.indexOf('{'); const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try { const o = JSON.parse(t.slice(s, e + 1)); if (Number(o.kcal_per_100g) >= 0) return o; } catch (err) { /* שורות */ }
    }
    const m = t.match(/(\d{1,4}(?:\.\d)?)\s*(?:קק"ל|קלוריות|kcal)/i);
    return m ? { name: '', kcal_per_100g: Number(m[1]), serving_g: 100 } : null;
  }

  function addFromAnswer() {
    if (!$('#aiAnswer').value.trim()) { aiError('התיבה ריקה – הדביקו כאן את התשובה (לחיצה ארוכה ← הדבקה)'); return; }
    aiError('');
    if (aiJob.label) {
      const r = parseLabelAnswer($('#aiAnswer').value);
      if (!r) { aiError('לא מצאתי בתשובה קלוריות ל-100 גרם. הדביקו את כל התשובה, או הקלידו רק את המספר (למשל: 535 קק"ל)'); return; }
      $('#aiDialog').close();
      showScanForm({ name: r.name || aiJob.name || '', kcal100: r.kcal_per_100g, serving: r.serving_g || 100, source: 'נקרא מהתווית – בדקו לפני שמירה' });
      return;
    }
    const { title, items } = parseAiAnswer($('#aiAnswer').value);
    if (!items.length) {
      aiError('לא הצלחתי לקרוא מהתשובה מאכלים וקלוריות. ודאו שהדבקתם את כל התשובה (כולל הסוגריים { }), או כתבו שורה לכל מאכל, למשל: שניצל – 330 קק"ל');
      return;
    }
    $('#aiDialog').close();
    if (!aiJob.photo) $('#freeText').value = '';
    addAiItems(items, title);
  }

  /* ---------------- ברקוד ---------------- */
  let stream = null;
  let scanTimer = null;
  let scanned = null; // { code, source }
  let lastPhotoTitle = ''; // שם שהציע Claude לארוחה מהתמונה – ברירת מחדל לשמירה כארוחה קבועה

  function stopCamera() {
    clearInterval(scanTimer);
    scanTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function setScanMode(mode) {
    document.querySelectorAll('.scan-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    $('#barcodeMode').classList.toggle('hidden', mode !== 'barcode');
    $('#mealMode').classList.toggle('hidden', mode !== 'meal');
    if (mode === 'barcode') startBarcodeCamera();
    else stopCamera();
    if (mode === 'meal') mealStatus();
  }
  function mealStatus() {
    const auto = !!(window.wellnessClaude && window.wellnessClaude.enabled());
    $('#mealEstimate').classList.toggle('hidden', !auto);
    $('#mealStatus').textContent = auto
      ? '📤 חינם דרך אפליקציית AI שלכם, או 🤖 אוטומטית עם מפתח ה-API. התמונה מוקטנת לפני השליחה.'
      : '📤 התמונה והבקשה נשלחות לאפליקציית ה-AI שלכם (חינם), ואת התשובה מדביקים חזרה כאן.';
  }

  async function openScanner() {
    scanned = null;
    $('#scanResult').classList.add('hidden');
    $('#scanMissing').classList.add('hidden');
    $('#scanCode').value = '';
    $('#scanDialog').showModal();
    setScanMode('barcode');
  }

  async function startBarcodeCamera() {
    if (stream || scanned) return;
    const status = $('#scanStatus');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
      $('#scanCamera').classList.add('hidden');
      return;
    }
    $('#scanCamera').classList.remove('hidden');
    status.textContent = 'מכוונים את המצלמה לברקוד…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = $('#scanVideo');
      video.srcObject = stream;
      await video.play();
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      scanTimer = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          if (codes.length) { stopCamera(); lookup(codes[0].rawValue); }
        } catch (e) { /* frame not ready */ }
      }, 300);
    } catch (e) {
      $('#scanCamera').classList.add('hidden');
      toast('אין גישה למצלמה – אפשר להקליד את מספר הברקוד');
    }
  }

  const hasHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');
  // השם: עדיף בעברית, ועם המותג אם הוא לא כבר בשם ("במבה אסם")
  function productName(pr) {
    const names = [pr.product_name_he, pr.product_name, pr.product_name_en, pr.generic_name_he, pr.generic_name].map((x) => (x || '').trim()).filter(Boolean);
    let name = names.find(hasHebrew) || names[0] || '';
    const brand = (pr.brands || '').split(',')[0].trim();
    if (brand && !name.includes(brand)) name = name ? `${name} ${brand}` : brand;
    return name;
  }

  async function lookup(code) {
    code = String(code).replace(/\D/g, '');
    if (code.length < 6) { toast('מספר ברקוד לא תקין'); return; }
    $('#scanCode').value = code;
    $('#scanStatus').textContent = 'מחפש את המוצר…';
    scanned = { code };
    // מוצר שכבר שמרתי עם הברקוד הזה – מיד, בלי לחפש במאגר
    const mine = state.customFoods.find((f) => f.barcode === code);
    if (mine) { addScanned(mine); return; }
    let pr = null;
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_he,product_name_en,generic_name,generic_name_he,brands,nutriments,serving_quantity`;
      const data = await (await fetch(url)).json();
      pr = data && data.product ? data.product : null;
    } catch (e) {
      toast('אין חיבור למאגר המוצרים כרגע – אפשר לצלם את התווית');
    }
    const n = (pr && pr.nutriments) || {};
    const kcal = n['energy-kcal_100g'] != null ? n['energy-kcal_100g']
      : n['energy-kj_100g'] != null ? n['energy-kj_100g'] / 4.184
      : n.energy_100g != null ? n.energy_100g / 4.184 : null;
    const name = pr ? productName(pr) : '';
    if (pr && kcal != null && name) {
      addScanned({ name, custom: true, oneOff: true, scanned: true, barcode: code, unit: 'מנה', unitG: Math.round(pr.serving_quantity) || 100, kcal100: Math.round(kcal) });
      return;
    }
    // לא נמצא / בלי קלוריות: צילום התווית או הזנה ידנית
    stopCamera();
    scanned = { code, name };
    $('#scanCamera').classList.add('hidden');
    $('#scanMissingText').textContent = pr
      ? `מצאתי את "${name || 'המוצר'}", אבל אין במאגר ערך קלורי.`
      : 'המוצר לא נמצא במאגר המוצרים (חסרים בו לא מעט מוצרים ישראליים).';
    $('#scanMissing').classList.remove('hidden');
  }

  // מוצר מהברקוד → ישר לסל (מנה או גרמים); ⭐ בסל שומר אותו ב"שלי" יחד עם הברקוד
  function addScanned(food) {
    tray.push({ food, qty: 1, mode: 'unit' });
    $('#scanDialog').close();
    afterTrayChange();
    $('#tray').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`📷 נוסף: ${food.name} · ${fmt(unitKcal(food))} קק"ל ל${food.unit}${food.unitG && !isFixed(food) ? ` (${food.unitG} גר')` : ''}${food.oneOff ? ' – ⭐ לשמירה' : ''}`);
  }

  // טופס אישור: שם, קלוריות ל-100 גרם וגודל מנה (מתווית או הזנה ידנית)
  function showScanForm({ name = '', kcal100 = '', serving = 100, source = '' } = {}) {
    if (!$('#scanDialog').open) $('#scanDialog').showModal();
    setScanMode('barcode');
    stopCamera();
    $('#scanCamera').classList.add('hidden');
    $('#scanMissing').classList.add('hidden');
    $('#scanName').value = name;
    $('#scanKcal').value = kcal100 === '' ? '' : Math.round(kcal100);
    $('#scanServing').value = Math.round(serving) || 100;
    $('#scanSource').textContent = source || (scanned ? `ברקוד ${scanned.code} · בדקו מול התווית` : '');
    $('#scanResult').classList.remove('hidden');
  }

  async function onLabelPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let dataUrl;
    try { dataUrl = await shrinkImage(file); } catch (err) { toast('לא הצלחתי לפתוח את התמונה'); return; }
    const name = scanned && scanned.name;
    if (window.wellnessClaude && window.wellnessClaude.enabled()) {
      $('#scanMissingText').textContent = '🤖 קורא את התווית…';
      try {
        const r = await window.wellnessClaude.readLabel(dataUrl.split(',')[1], name);
        if (!r.found || !(r.kcal_per_100g >= 0)) { $('#scanMissingText').textContent = 'לא רואים בתמונה טבלת ערכים תזונתיים – נסו שוב מקרוב'; return; }
        showScanForm({ name: r.name || name || '', kcal100: r.kcal_per_100g, serving: r.serving_g, source: `נקרא מהתווית${scanned ? ` · ברקוד ${scanned.code}` : ''} – בדקו לפני שמירה` });
      } catch (err) {
        $('#scanMissingText').textContent = `🤖 ${err.friendly || 'שגיאה בקריאת התווית'}`;
      }
      return;
    }
    // בלי מפתח: דרך אפליקציית ה-AI (חינם)
    $('#scanDialog').close();
    openAiDialog({ label: dataUrl, photo: dataUrl, name });
    shareJob();
  }

  /* ---------------- צילום ארוחה ---------------- */
  let photoB64 = null;
  let photoUrl = null;

  // מקטינים ל-1568 פיקסלים בצלע הארוכה (מספיק לזיהוי אוכל, וזול יותר) ומקודדים JPEG
  function shrinkImage(file, maxSide = 1568) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await shrinkImage(file);
      photoB64 = dataUrl.split(',')[1];
      $('#mealPreview').src = dataUrl;
      $('#mealPreview').classList.remove('hidden');
      photoUrl = dataUrl;
      $('#mealShare').disabled = false;
      $('#mealEstimate').disabled = !(window.wellnessClaude && window.wellnessClaude.enabled());
      mealStatus();
    } catch (err) {
      toast('לא הצלחתי לפתוח את התמונה');
    }
    e.target.value = '';
  }

  async function estimateMeal() {
    if (!photoB64) return;
    const btn = $('#mealEstimate');
    btn.disabled = true;
    btn.textContent = '🤖 מנתח את התמונה…';
    try {
      const { title, items } = await window.wellnessClaude.estimatePhoto(photoB64, $('#mealNote').value.trim());
      const ok = (items || []).filter((it) => it.kcal_per_portion >= 0);
      if (!ok.length) { toast('Claude לא זיהה אוכל בתמונה'); return; }
      photoB64 = null;
      photoUrl = null;
      $('#mealPreview').classList.add('hidden');
      $('#mealNote').value = '';
      $('#mealShare').disabled = true;
      $('#scanDialog').close();
      addAiItems(ok, title);
    } catch (err) {
      toast(`🤖 ${err.friendly || 'שגיאה בניתוח התמונה'}`);
    } finally {
      btn.textContent = '🤖 הערכת קלוריות';
      btn.disabled = !photoB64;
    }
  }

  function scannedFood(oneOff) {
    const name = $('#scanName').value.trim();
    const kcal100 = parseFloat($('#scanKcal').value);
    const unitG = parseFloat($('#scanServing').value) || 100;
    if (!name || !(kcal100 >= 0)) { toast('צריך שם וקלוריות ל-100 גרם'); return null; }
    return { name, custom: true, oneOff, unit: 'מנה', unitG, kcal100, barcode: scanned && scanned.code };
  }

  function bind() {
    $('#freeTextGo').onclick = addFreeText;
    $('#freeText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFreeText(); } });
    $('#scanBtn').onclick = openScanner;
    $('#scanLookup').onclick = () => lookup($('#scanCode').value);
    $('#scanCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup($('#scanCode').value); } });
    $('#scanDialog').addEventListener('close', stopCamera);
    document.querySelectorAll('.scan-tabs .tab').forEach((t) => { t.onclick = () => setScanMode(t.dataset.mode); });
    $('#mealPhoto').addEventListener('change', onPhoto);
    $('#labelPhoto').addEventListener('change', onLabelPhoto);
    $('#scanManual').onclick = () => showScanForm({ name: (scanned && scanned.name) || '' });
    $('#mealEstimate').onclick = estimateMeal;
    $('#mealShare').onclick = () => {
      if (!photoUrl) return;
      const job = { photo: photoUrl, note: $('#mealNote').value.trim() };
      $('#scanDialog').close();
      openAiDialog(job);
      shareJob();
    };
    $('#aiShare').onclick = shareJob;
    $('#aiCopy').onclick = copyPrompt;
    $('#aiAdd').onclick = addFromAnswer;
    // "הדבקה": אם כבר הדבקתם בתיבה – משתמשים בה; אחרת מנסים לקרוא מהלוח (בלי למחוק את התיבה אם הלוח ריק/חסום)
    $('#aiPaste').onclick = async () => {
      if (!$('#aiAnswer').value.trim()) {
        let clip = '';
        try { clip = await navigator.clipboard.readText(); } catch (e) { /* חסום */ }
        if (!clip.trim()) { $('#aiAnswer').focus(); aiError('לא הצלחתי לקרוא מהלוח – לחיצה ארוכה בתיבה ← הדבקה, ואז "הוספה לארוחה"'); return; }
        $('#aiAnswer').value = clip;
      }
      addFromAnswer();
    };
    $('#aiAnswer').addEventListener('input', () => aiError(''));
    $('#scanOnce').onclick = () => {
      const f = scannedFood(true);
      if (!f) return;
      tray.push({ food: f, qty: 1, mode: 'unit' });
      $('#scanDialog').close();
      afterTrayChange();
      toast(`"${f.name}" נוסף לארוחה הזו בלבד`);
    };
    $('#scanSave').onclick = () => {
      const f = scannedFood(false);
      if (!f) return;
      if (allFoods().some((x) => x.name === f.name)) { toast('כבר יש מוצר בשם הזה – שנו את השם'); return; }
      delete f.oneOff;
      state.customFoods.unshift(f);
      save();
      $('#scanDialog').close();
      renderCatChips();
      pickFood(f);
      toast(`"${f.name}" נשמר ב"שלי" ונבחר`);
    };
  }

  window.wellnessSmart = { parseFreeText, parseAiAnswer, parseLabelAnswer, lookup, photoTitle: () => (tray.some((t) => t.food.ai) ? lastPhotoTitle : '') };
  bind();
})();
