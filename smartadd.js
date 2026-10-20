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

  /* ---------------- ברקוד ---------------- */
  let stream = null;
  let scanTimer = null;
  let scanned = null; // { code, source }

  function stopCamera() {
    clearInterval(scanTimer);
    scanTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function openScanner() {
    scanned = null;
    $('#scanResult').classList.add('hidden');
    $('#scanCode').value = '';
    $('#scanDialog').showModal();
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

  async function lookup(code) {
    code = String(code).replace(/\D/g, '');
    if (code.length < 6) { toast('מספר ברקוד לא תקין'); return; }
    $('#scanCode').value = code;
    $('#scanStatus').textContent = 'מחפש את המוצר…';
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_he,generic_name,brands,nutriments,serving_quantity`;
      const data = await (await fetch(url)).json();
      const pr = data && data.status === 1 ? data.product : null;
      const n = (pr && pr.nutriments) || {};
      const kcal = n['energy-kcal_100g'] != null ? n['energy-kcal_100g'] : n.energy_100g != null ? n.energy_100g / 4.184 : null;
      const name = pr && (pr.product_name_he || pr.product_name || pr.generic_name || pr.brands);
      if (!pr) {
        toast('המוצר לא נמצא במאגר – אפשר להוסיף אותו ידנית');
        $('#scanDialog').close();
        openCustomAdd('');
        return;
      }
      scanned = { code };
      $('#scanName').value = (name || '').trim();
      $('#scanKcal').value = kcal != null ? Math.round(kcal) : '';
      $('#scanServing').value = Math.round(pr.serving_quantity) || 100;
      $('#scanSource').textContent = kcal != null
        ? `ברקוד ${code} · נתונים מ-Open Food Facts (כדאי לוודא מול התווית)`
        : `ברקוד ${code} · אין במאגר ערך קלורי – הזינו מהתווית`;
      $('#scanResult').classList.remove('hidden');
      $('#scanCamera').classList.add('hidden');
    } catch (e) {
      toast('אין חיבור למאגר המוצרים כרגע');
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

  window.wellnessSmart = { parseFreeText, lookup };
  bind();
})();
