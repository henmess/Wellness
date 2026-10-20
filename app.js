'use strict';

// גרסת האתר (מה-?v= של app.js ב-index.html)
const APP_VERSION = (document.currentScript && new URL(document.currentScript.src).searchParams.get('v')) || '';

/* ================= State ================= */
const STORE_KEY = 'wellness-v1';
const MEALS = [
  { id: 'breakfast', label: 'בוקר', icon: '🌅' },
  { id: 'lunch', label: 'צהריים', icon: '☀️' },
  { id: 'dinner', label: 'ערב', icon: '🌙' },
  { id: 'snack', label: 'נשנושים', icon: '🍎' },
];
// חלוקה מומלצת של יעד הקלוריות היומי בין הארוחות
const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
const mealGoal = (pid, meal) => Math.round(state.profiles[pid].calGoal * MEAL_SPLIT[meal] / 10) * 10;
const BMI_CATS = [
  { label: 'תת-משקל', min: 0, max: 18.5, color: '#6cb6ff' },
  { label: 'משקל תקין', min: 18.5, max: 25, color: '#22b07d' },
  { label: 'עודף משקל', min: 25, max: 30, color: '#f7c948' },
  { label: 'השמנה דרגה 1', min: 30, max: 35, color: '#f59345' },
  { label: 'השמנה דרגה 2', min: 35, max: 40, color: '#ec5b5b' },
  { label: 'השמנה דרגה 3', min: 40, max: Infinity, color: '#b8344a' },
];

const defaultState = () => ({
  active: 'p1',
  profiles: {
    p1: { name: 'חן', sex: 'f', age: 37, height: 167, weight: 61, stepGoal: 8000, calGoal: 1900, color: '#ff8fab' },
    p2: { name: 'ניר', sex: 'm', age: 40, height: 180, weight: 82, stepGoal: 10000, calGoal: 2500, color: '#2bb3a3' },
  },
  days: { p1: {}, p2: {} },
  customFoods: [],
  foodOverrides: {}, // שינויי קלוריות למוצרים מהרשימה הקבועה, לפי שם
});

let goalsJustUpdated = false;
let state = load();
migrateNames();
if (goalsJustUpdated) persistLocal(); // נשמר מיד; השמירה המשותפת תדחוף בסנכרון הבא
let currentDate = todayKey();
let currentMeal = guessMeal();
let charts = {};
let pickerCat = 'all';
let tray = []; // { food, qty, mode: 'unit' | 'g' }
let trayWho = null; // למי להוסיף: רשימת פרופילים (ברירת מחדל – הפרופיל הפעיל)
// בונים מחדש את הבוחר רק כשהתוכן השתנה, כדי שבנייה מחדש (למשל אחרי שמירת שדה)
// לא "תבלע" לחיצה שכבר התחילה על כרטיס או כפתור
const lastKeys = {};
function unchanged(name, key) {
  if (lastKeys[name] === key) return true;
  lastKeys[name] = key;
  return false;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* storage unavailable */ }
  return defaultState();
}
// פרופילים שנשמרו בגרסה הקודמת עם שמות ברירת המחדל הישנים
function migrateNames() {
  const old = { p1: ['אני', 'חן'], p2: ['בעלי', 'ניר'] };
  Object.entries(old).forEach(([id, [from, to]]) => {
    if (state.profiles[id] && state.profiles[id].name === from) state.profiles[id].name = to;
  });
  // ברירת המחדל הישנה של חן הייתה 165 ס"מ / 62 ק"ג
  const chen = state.profiles.p1;
  if (chen && chen.height === 165 && chen.weight === 62) { chen.height = 167; chen.weight = 61; }
  // מוצרים מהרשימה הקבועה ששמם השתנה (RENAMED_FOODS ב-foods.js)
  const ov = state.foodOverrides || {};
  Object.entries(RENAMED_FOODS).forEach(([from, to]) => {
    if (ov[from] && !ov[to]) ov[to] = ov[from];
    delete ov[from];
  });
  Object.values(state.days || {}).forEach((days) => Object.values(days).forEach((d) => {
    Object.values(d.meals || {}).forEach((items) => items.forEach((it) => {
      if (RENAMED_FOODS[it.name]) it.name = RENAMED_FOODS[it.name];
    }));
  }));
  // פעם אחת: הגילים המעודכנים (חן 37, ניר 40). יעד שהיה לפי ההמלצה מחושב מחדש לפי הגיל החדש;
  // יעד ששונה ידנית נשאר כמו שהוא
  Object.entries({ p1: 37, p2: 40 }).forEach(([id, age]) => {
    const p = state.profiles[id];
    if (!p || p.ageV) return;
    const before = recommendFor(id);
    const wasRec = p.goalsRec && p.calGoal === before.cal && p.stepGoal === before.steps;
    p.age = age;
    p.ageV = 1;
    if (wasRec) {
      const after = recommendFor(id);
      p.calGoal = after.cal;
      p.stepGoal = after.steps;
    }
    goalsJustUpdated = true;
  });
  // פעם אחת: היעדים מתעדכנים להמלצה לפי הנתונים של כל אחד
  Object.entries(state.profiles).forEach(([id, p]) => {
    if (p.goalsRec) return;
    const r = recommendFor(id);
    p.calGoal = r.cal;
    p.stepGoal = r.steps;
    p.goalsRec = 1;
    goalsJustUpdated = true;
  });
  // הוורוד הקודם של חן הוחלף בוורוד בהיר יותר
  if (chen && chen.color === '#ff6b8b') chen.color = '#ff8fab';
}
function persistLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
function save() {
  persistLocal();
  if (window.wellnessSync) window.wellnessSync.push();
}

/* ================= Helpers ================= */
const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('he-IL');
function todayKey() { return keyOf(new Date()); }
function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function shiftKey(k, delta) { const d = parseKey(k); d.setDate(d.getDate() + delta); return keyOf(d); }
function guessMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}
function profile(id = state.active) { return state.profiles[id]; }
function day(id = state.active, key = currentDate, create = false) {
  const days = state.days[id] || (state.days[id] = {});
  if (!days[key] && create) {
    days[key] = { steps: 0, meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, exercise: [] };
  }
  return days[key];
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ================= Calculations ================= */
// המשקל העדכני ביותר עד התאריך הנבחר
function weightOn(id, key) {
  const days = state.days[id] || {};
  const keys = Object.keys(days).filter((k) => k <= key && days[k].weight).sort();
  return keys.length ? days[keys[keys.length - 1]].weight : profile(id).weight;
}
// יעד מומלץ לפי מין, גיל, גובה ומשקל:
// הוצאה יומית = BMR (Mifflin-St Jeor) × 1.375 (פעילות קלה, ~8–10 אלף צעדים),
// ואז התאמה לפי BMI: תקין – שמירה; 25–27: ‎-300; מעל 27: ‎-500; מתחת ל-18.5: ‎+300.
function recommendGoals({ sex, age, height, weight }) {
  const base = 10 * weight + 6.25 * height - 5 * age + (sex === 'm' ? 5 : -161);
  const maintain = base * 1.375;
  const bmi = bmiOf(weight, height);
  let adj = 0;
  let why = 'שמירה על המשקל (BMI תקין)';
  if (bmi < 18.5) { adj = 300; why = 'עלייה הדרגתית במשקל (BMI נמוך)'; }
  else if (bmi >= 27) { adj = -500; why = 'ירידה הדרגתית, כחצי ק"ג בשבוע'; }
  else if (bmi >= 25) { adj = -300; why = 'ירידה עדינה, כ-300 גרם בשבוע'; }
  const floor = sex === 'm' ? 1500 : 1200;
  const r50 = (n) => Math.round(n / 50) * 50;
  return {
    cal: Math.max(floor, r50(maintain + adj)),
    maintain: r50(maintain),
    steps: adj < 0 ? 10000 : 8000,
    bmi, why,
  };
}
// function ולא const: נקרא כבר בטעינה (migrateNames) לפני שהשורה הזו רצה
function recommendFor(pid) {
  const p = state.profiles[pid];
  return recommendGoals({ sex: p.sex, age: p.age, height: p.height, weight: weightOn(pid, todayKey()) });
}

function bmiOf(weight, heightCm) { const h = heightCm / 100; return weight / (h * h); }
function bmiCat(bmi) { return BMI_CATS.find((c) => bmi < c.max); }
// Mifflin-St Jeor
function bmr(id, key) {
  const p = profile(id);
  const w = weightOn(id, key);
  return 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
}
function stride(p) { return p.height * (p.sex === 'm' ? 0.415 : 0.413) / 100; }
function stepsKcal(id, key, steps) {
  const km = steps * stride(profile(id)) / 1000;
  return km * weightOn(id, key) * 0.5;
}
function exKcal(id, key, ex) { return ex.met * weightOn(id, key) * (ex.min / 60); }

function daySummary(id, key) {
  const d = day(id, key) || { steps: 0, meals: {}, exercise: [] };
  const mealTotals = {};
  let eaten = 0;
  MEALS.forEach((m) => {
    const t = (d.meals[m.id] || []).reduce((s, f) => s + f.kcal, 0);
    mealTotals[m.id] = t;
    eaten += t;
  });
  const base = bmr(id, key);
  const st = stepsKcal(id, key, d.steps || 0);
  const ex = (d.exercise || []).reduce((s, e) => s + exKcal(id, key, e), 0);
  const burned = base + st + ex;
  return { eaten, mealTotals, steps: d.steps || 0, base, stepsKcal: st, exKcal: ex, burned, balance: eaten - burned, hasData: !!day(id, key) };
}

/* ================= Rendering ================= */
function ring(el, pct, color) {
  const r = 27, c = 2 * Math.PI * r;
  if (!el.querySelector('svg')) {
    el.innerHTML = `<svg viewBox="0 0 64 64" width="64" height="64">
      <circle class="track" cx="32" cy="32" r="${r}" fill="none" stroke-width="7"/>
      <circle class="bar" cx="32" cy="32" r="${r}" fill="none" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg><span class="pct"></span>`;
  }
  const bar = el.querySelector('.bar');
  bar.style.stroke = color;
  requestAnimationFrame(() => { bar.style.strokeDashoffset = c * (1 - Math.min(pct, 1)); });
  el.querySelector('.pct').textContent = `${Math.round(pct * 100)}%`;
}

function renderProfiles() {
  const nav = $('#profileTabs');
  nav.innerHTML = '';
  Object.entries(state.profiles).forEach(([id, p]) => {
    const b = document.createElement('button');
    b.className = 'profile-tab' + (id === state.active ? ' active' : '');
    b.style.setProperty('--c', p.color);
    b.innerHTML = `<span class="avatar">${(p.name || '?').trim().charAt(0)}</span>${p.name}`;
    b.onclick = () => switchProfile(id);
    nav.appendChild(b);
  });
  document.documentElement.style.setProperty('--accent', profile().color);
  $('.brand .family').textContent = `${profile().name} מושקוביץ`;
  document.documentElement.style.setProperty('--accent-2', profile().sex === 'm' ? '#5aa9ff' : '#ffb36b');
}

function switchProfile(id) {
  state.active = id;
  save();
  renderAll();
  toast(`עברנו לפרופיל של ${profile().name}`);
}

function renderDate() {
  $('#datePicker').value = currentDate;
  const d = parseKey(currentDate);
  const t = todayKey();
  let label = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  if (currentDate === t) label = 'היום · ' + label;
  else if (currentDate === shiftKey(t, -1)) label = 'אתמול · ' + label;
  $('#dateLabel').textContent = label;
  $('#nextDay').disabled = currentDate >= t;
  $('#nextDay').style.opacity = currentDate >= t ? .4 : 1;
}

function renderSummary() {
  const p = profile();
  const s = daySummary(state.active, currentDate);
  const accent = p.color;
  $('#sumEaten').textContent = fmt(s.eaten);
  $('#sumEatenSub').textContent = `יעד: ${fmt(p.calGoal)} · נותרו ${fmt(Math.max(p.calGoal - s.eaten, 0))}`;
  ring(document.querySelector('[data-ring="eaten"]'), s.eaten / p.calGoal, s.eaten > p.calGoal ? 'var(--warn)' : accent);

  $('#sumBurned').textContent = fmt(s.burned);
  $('#sumBurnedSub').textContent = `בסיס ${fmt(s.base)} · צעדים ${fmt(s.stepsKcal)} · פעילות ${fmt(s.exKcal)}`;
  ring(document.querySelector('[data-ring="burned"]'), (s.stepsKcal + s.exKcal) / 500, 'var(--good)');

  $('#sumSteps').textContent = fmt(s.steps);
  $('#sumStepsSub').textContent = `יעד: ${fmt(p.stepGoal)} · ${(s.steps * stride(p) / 1000).toFixed(1)} ק"מ`;
  ring(document.querySelector('[data-ring="steps"]'), s.steps / p.stepGoal, s.steps >= p.stepGoal ? 'var(--good)' : accent);

  const card = $('#balanceCard');
  card.classList.toggle('deficit', s.balance < 0 && s.eaten > 0);
  card.classList.toggle('surplus', s.balance > 0);
  $('#sumBalance').textContent = s.eaten ? (s.balance > 0 ? '+' : '') + fmt(s.balance) : '–';
  if (s.eaten === 0) {
    $('#sumBalanceSub').textContent = 'הוסיפו ארוחות כדי לראות מאזן';
    $('#balanceIcon').textContent = '⚖';
  } else if (s.balance < 0) {
    $('#sumBalanceSub').textContent = `גירעון ≈ ${(Math.abs(s.balance) / 7700 * 1000).toFixed(0)} גרם שומן`;
    $('#balanceIcon').textContent = '📉';
  } else {
    $('#sumBalanceSub').textContent = 'עודף קלורי היום';
    $('#balanceIcon').textContent = '📈';
  }
}

/* ================= Habits: הצעות לפי מה שחוזר כל יום ================= */
const HABIT_KEY = 'wellness-habits';
const HABIT_DAYS = 7;
function habitStore() {
  try { return JSON.parse(localStorage.getItem(HABIT_KEY)) || { day: {}, never: {} }; } catch (e) { return { day: {}, never: {} }; }
}
function saveHabitStore(h) {
  // שומרים דחיות "לא היום" רק לשבועיים האחרונים
  const cutoff = shiftKey(todayKey(), -14);
  Object.keys(h.day).forEach((k) => { if (k.slice(0, 10) < cutoff) delete h.day[k]; });
  try { localStorage.setItem(HABIT_KEY, JSON.stringify(h)); } catch (e) { /* ignore */ }
}

// מאכל/שתייה שהופיעו באותה ארוחה ברוב הימים האחרונים ועוד לא נרשמו היום
function habitSuggestions(pid, date) {
  const days = state.days[pid] || {};
  const prev = Array.from({ length: HABIT_DAYS }, (_, i) => shiftKey(date, -1 - i))
    .filter((k) => days[k] && Object.values(days[k].meals || {}).some((items) => items.length));
  if (prev.length < 3) return [];
  const counts = {};
  prev.forEach((k) => {
    MEALS.forEach((m) => {
      const seen = new Set();
      (days[k].meals[m.id] || []).forEach((it) => {
        const key = `${m.id}|${it.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        const c = counts[key] || (counts[key] = { meal: m.id, name: it.name, days: 0, last: null, qtys: {} });
        c.days++;
        const q = `${it.qty}|${it.unit}`;
        c.qtys[q] = (c.qtys[q] || 0) + 1;
        if (!c.last || k > c.last.date) c.last = { date: k, item: it };
      });
    });
  });
  const h = habitStore();
  const today = (days[date] && days[date].meals) || {};
  return Object.values(counts)
    .filter((c) => c.days >= 3 && c.days / prev.length >= 0.6)
    .filter((c) => !(today[c.meal] || []).some((it) => it.name === c.name))
    .filter((c) => !h.never[`${pid}|${c.meal}|${c.name}`] && !h.day[`${date}|${pid}|${c.meal}|${c.name}`])
    .map((c) => {
      // הכמות הנפוצה ביותר, והקלוריות לפי הערך העדכני של המוצר
      const [qty, unit] = Object.entries(c.qtys).sort((a, b) => b[1] - a[1])[0][0].split('|');
      const q = Number(qty);
      const food = allFoods().find((f) => f.name === c.name);
      const kcal = food
        ? Math.round(unit === 'גרם' && !isFixed(food) ? food.kcal100 * q / 100 : unitKcal(food) * q)
        : Math.round(c.last.item.kcal / c.last.item.qty * q);
      return { meal: c.meal, name: c.name, qty: q, unit, kcal, days: c.days, of: prev.length };
    })
    .sort((a, b) => MEALS.findIndex((m) => m.id === a.meal) - MEALS.findIndex((m) => m.id === b.meal) || b.days - a.days)
    .slice(0, 5);
}

function addHabit(sg) {
  day(state.active, currentDate, true).meals[sg.meal].push({ name: sg.name, qty: sg.qty, unit: sg.unit, kcal: sg.kcal });
}

function renderHabits() {
  const el = $('#habits');
  const list = habitSuggestions(state.active, currentDate);
  if (unchanged('habits', JSON.stringify([state.active, currentDate, list]))) return;
  el.classList.toggle('hidden', !list.length);
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="habits-head"><b>💡 לפי ההרגלים שלך</b>
      ${list.length > 1 ? '<button type="button" class="link-btn" data-all>הוספת הכול</button>' : ''}</div>
    <ul>${list.map((sg, i) => {
      const meal = MEALS.find((m) => m.id === sg.meal);
      return `<li data-i="${i}">
        <span class="h-name">${meal.icon} ${escapeHtml(sg.name)}
          <small><bdi dir="ltr">${sg.unit === 'גרם' ? sg.qty : fmtQty(sg.qty)}</bdi> ${escapeHtml(sg.unit)} · ${meal.label} · ${sg.days} מתוך ${sg.of} ימים</small></span>
        <span class="h-kcal">${fmt(sg.kcal)} קק"ל</span>
        <button type="button" class="btn primary h-add">הוספה</button>
        <button type="button" class="h-menu" title="לא להציע">✕</button>
        <span class="h-ask">
          <button type="button" class="chip" data-skip="day">רק לא היום</button>
          <button type="button" class="chip" data-skip="never">לא להציע יותר</button>
        </span>
      </li>`;
    }).join('')}</ul>`;
  el.querySelectorAll('li').forEach((li) => {
    const sg = list[Number(li.dataset.i)];
    li.querySelector('.h-add').onclick = () => {
      addHabit(sg);
      save(); renderAll();
      toast(`נוסף: ${sg.name} · ${fmt(sg.kcal)} קק"ל`);
    };
    li.querySelector('.h-menu').onclick = () => li.classList.toggle('asking');
    li.querySelectorAll('[data-skip]').forEach((b) => {
      b.onclick = () => {
        const h = habitStore();
        if (b.dataset.skip === 'never') h.never[`${state.active}|${sg.meal}|${sg.name}`] = 1;
        else h.day[`${currentDate}|${state.active}|${sg.meal}|${sg.name}`] = 1;
        saveHabitStore(h);
        renderHabits();
        toast(b.dataset.skip === 'never' ? `"${sg.name}" לא יוצע יותר` : `"${sg.name}" לא יוצע היום`);
      };
    });
  });
  const all = el.querySelector('[data-all]');
  if (all) all.onclick = () => {
    list.forEach(addHabit);
    save(); renderAll();
    toast(`נוספו ${list.length} פריטים · ${fmt(list.reduce((s, x) => s + x.kcal, 0))} קק"ל`);
  };
}

function renderMeals() {
  renderHabits();
  const d = day();
  const s = daySummary(state.active, currentDate);
  $('#mealsTotal').textContent = `${fmt(s.eaten)} קק"ל`;

  const tabs = $('#mealTabs');
  tabs.innerHTML = '';
  MEALS.forEach((m) => {
    const b = document.createElement('button');
    b.className = 'tab' + (m.id === currentMeal ? ' active' : '');
    const goal = mealGoal(state.active, m.id);
    b.innerHTML = `<span>${m.icon} ${m.label}</span>
      <small class="${s.mealTotals[m.id] > goal ? 'over' : ''}">${fmt(s.mealTotals[m.id])} / ${fmt(goal)}</small>`;
    b.onclick = () => { currentMeal = m.id; renderMeals(); renderTray(); };
    tabs.appendChild(b);
  });

  const list = $('#foodItems');
  const items = (d && d.meals[currentMeal]) || [];
  list.innerHTML = items.length ? '' : `<li class="empty">עדיין לא נוספו פריטים לארוחת ${MEALS.find((m) => m.id === currentMeal).label}</li>`;
  items.forEach((f, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${escapeHtml(f.name)}<small><bdi dir="ltr">${f.unit === 'גרם' ? f.qty : fmtQty(f.qty)}</bdi> ${escapeHtml(f.unit)}</small></span>
      <span class="kcal">${fmt(f.kcal)} קק"ל</span><button class="del" title="מחיקה">✕</button>`;
    li.querySelector('.del').onclick = () => {
      d.meals[currentMeal].splice(i, 1);
      save(); renderAll();
    };
    list.appendChild(li);
  });

  // התקדמות מול היעד המומלץ לכל ארוחה
  $('#mealBars').innerHTML = `<div class="meal-bars-head">יעד מומלץ לכל ארוחה (מתוך ${fmt(profile().calGoal)} ביום)</div>` +
    MEALS.map((m) => {
      const goal = mealGoal(state.active, m.id);
      const eaten = s.mealTotals[m.id];
      return `<div class="meal-bar ${eaten > goal ? 'over' : ''}"><span>${m.icon} ${m.label}</span>
        <div class="track"><div class="fill" style="width:${Math.min(eaten / goal, 1) * 100}%"></div></div>
        <span class="val"><bdi dir="ltr">${fmt(eaten)} / ${fmt(goal)}</bdi></span></div>`;
    }).join('');
}

function renderSteps() {
  const p = profile();
  const d = day();
  const steps = d ? d.steps : 0;
  const input = $('#stepsInput');
  if (document.activeElement !== input) input.value = steps;
  const kcal = stepsKcal(state.active, currentDate, steps);
  $('#stepsKcal').textContent = `${fmt(kcal)} קק"ל`;
  $('#stepsBar').style.width = Math.min(steps / p.stepGoal * 100, 100) + '%';
  const left = p.stepGoal - steps;
  $('#stepsInfo').textContent = left > 0
    ? `עוד ${fmt(left)} צעדים ליעד (${fmt(p.stepGoal)}) · אורך צעד משוער ${Math.round(stride(p) * 100)} ס"מ`
    : `🎉 כל הכבוד! עברת את היעד ב-${fmt(-left)} צעדים`;

  const ex = (d && d.exercise) || [];
  const exList = $('#exItems');
  const exTotal = ex.reduce((s, e) => s + exKcal(state.active, currentDate, e), 0);
  $('#exKcal').textContent = `${fmt(exTotal)} קק"ל`;
  exList.innerHTML = ex.length ? '' : '<li class="empty">לא נרשמה פעילות</li>';
  ex.forEach((e, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${escapeHtml(e.name)}<small>${e.min} דקות</small></span>
      <span class="kcal">${fmt(exKcal(state.active, currentDate, e))} קק"ל</span><button class="del" title="מחיקה">✕</button>`;
    li.querySelector('.del').onclick = () => { d.exercise.splice(i, 1); save(); renderAll(); };
    exList.appendChild(li);
  });
}

function renderBmi() {
  const p = profile();
  const w = weightOn(state.active, currentDate);
  const d = day();
  const wi = $('#weightInput');
  if (document.activeElement !== wi) wi.value = (d && d.weight) || w;
  const bmi = bmiOf(w, p.height);
  const cat = bmiCat(bmi);
  $('#bmiValue').textContent = bmi.toFixed(1);
  $('#bmiValue').style.color = cat.color;
  $('#bmiCat').textContent = cat.label;
  $('#bmiCat').style.color = cat.color;

  const h2 = (p.height / 100) ** 2;
  const lo = 18.5 * h2, hi = 24.9 * h2;
  let msg = `גובה ${p.height} ס"מ · משקל ${w} ק"ג<br>טווח משקל תקין עבורך: <b dir="ltr">${lo.toFixed(1)}–${hi.toFixed(1)}</b> ק"ג`;
  if (w > hi) msg += `<br>עוד ${(w - hi).toFixed(1)} ק"ג לטווח התקין`;
  else if (w < lo) msg += `<br>חסרים ${(lo - w).toFixed(1)} ק"ג לטווח התקין`;
  else msg += '<br>✨ את/ה בטווח התקין';
  $('#bmiMeta').innerHTML = msg;

  const pos = Math.min(Math.max((bmi - 15) / 25, 0), 1) * 100;
  $('#gaugeMarker').style.left = pos + '%';

  $('#bmiTable tbody').innerHTML = BMI_CATS.map((c) => {
    const range = c.max === Infinity ? `${c.min}+` : c.min === 0 ? `< ${c.max}` : `${c.min}–${(c.max - 0.1).toFixed(1)}`;
    const wr = c.max === Infinity ? `${(c.min * h2).toFixed(0)}+ kg`
      : c.min === 0 ? `< ${(c.max * h2).toFixed(0)} kg`
      : `${(c.min * h2).toFixed(0)}–${(c.max * h2).toFixed(0)} kg`;
    return `<tr class="${c === cat ? 'current' : ''}"><td><span class="dot" style="background:${c.color}"></span>${c.label}</td><td><span dir="ltr">${range}</span></td><td><span dir="ltr">${wr}</span></td></tr>`;
  }).join('');
}

function renderCouple() {
  $('#coupleGrid').innerHTML = Object.entries(state.profiles).map(([id, p]) => {
    const s = daySummary(id, currentDate);
    const bmi = bmiOf(weightOn(id, currentDate), p.height);
    return `<div class="couple-card ${id === state.active ? 'active' : ''}" data-id="${id}" style="--c:${p.color}">
      <h3>${p.sex === 'm' ? '🧔' : '👩'} ${escapeHtml(p.name)}</h3>
      <div class="row"><span>אכל/ה</span><b>${fmt(s.eaten)} קק"ל</b></div>
      <div class="row"><span>שרף/ה</span><b>${fmt(s.burned)} קק"ל</b></div>
      <div class="row"><span>צעדים</span><b>${fmt(s.steps)}</b></div>
      <div class="row"><span>מאזן</span><b dir="ltr">${s.eaten ? (s.balance > 0 ? '+' : '') + fmt(s.balance) : '–'}</b></div>
      <div class="row"><span>BMI</span><b style="color:${bmiCat(bmi).color}">${bmi.toFixed(1)}</b></div>
    </div>`;
  }).join('');
  document.querySelectorAll('.couple-card').forEach((el) => {
    el.onclick = () => el.dataset.id !== state.active && switchProfile(el.dataset.id);
  });
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const id = state.active;
  const p = profile();
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim();
  const grid = css.getPropertyValue('--border').trim();
  Chart.defaults.font.family = 'Rubik, sans-serif';
  Chart.defaults.color = muted;

  const keys = Array.from({ length: 7 }, (_, i) => shiftKey(currentDate, i - 6));
  // תוויות קצרות: "א׳ 18"
  const labels = keys.map((k) => {
    const d = parseKey(k);
    return `${d.toLocaleDateString('he-IL', { weekday: 'narrow' })} ${d.getDate()}`;
  });
  const BURNED = '#6c7ae0'; // שונה מצבעי הפרופילים
  const pids = Object.keys(state.profiles);
  const sums = Object.fromEntries(pids.map((pid) => [pid, keys.map((k) => daySummary(pid, k))]));
  // אותו קנה מידה לשני הגרפים, כדי שאפשר יהיה להשוות ביניהם
  const all = Object.values(sums).flat();
  const kcalMax = Math.max(500, ...all.map((s) => Math.max(s.eaten, s.hasData ? s.burned : 0))) * 1.1;
  const stepsMax = Math.max(2000, ...all.map((s) => s.steps)) * 1.1;

  pids.forEach((pid) => {
    const pp = state.profiles[pid];
    const block = document.querySelector(`.week-block[data-pid="${pid}"]`);
    if (!block) return;
    const title = block.querySelector('.week-title');
    title.textContent = `${pp.sex === 'm' ? '🧔' : '👩'} ${pp.name}`;
    title.style.color = pp.color;
    const data = {
      labels,
      datasets: [
        { type: 'line', label: 'צעדים', data: sums[pid].map((s) => s.steps), borderColor: '#f4a62a', backgroundColor: '#f4a62a', tension: 0.35, pointRadius: 4, yAxisID: 'y1', order: 0 },
        { type: 'bar', label: 'נאכל', data: sums[pid].map((s) => Math.round(s.eaten)), backgroundColor: pp.color, borderRadius: 8, yAxisID: 'y', order: 1 },
        { type: 'bar', label: 'נשרף', data: sums[pid].map((s) => (s.hasData ? Math.round(s.burned) : 0)), backgroundColor: BURNED, borderRadius: 8, yAxisID: 'y', order: 1 },
      ],
    };
    const opts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', rtl: true, labels: { usePointStyle: true } } },
      scales: {
        x: { reverse: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } },
        y: { position: 'right', min: 0, max: Math.ceil(kcalMax / 500) * 500, grid: { color: grid }, title: { display: true, text: 'קק"ל' } },
        y1: { position: 'left', min: 0, max: Math.ceil(stepsMax / 1000) * 1000, grid: { display: false }, title: { display: true, text: 'צעדים' } },
      },
    };
    const key = `week-${pid}`;
    if (charts[key]) { charts[key].data = data; charts[key].options = opts; charts[key].update(); }
    else charts[key] = new Chart(block.querySelector('canvas'), { data, options: opts });
  });

  // גרף משקל: כל השקילות עד התאריך הנבחר (עד 30 אחרונות)
  const days = state.days[id] || {};
  const wKeys = Object.keys(days).filter((k) => days[k].weight && k <= currentDate).sort().slice(-30);
  const wData = {
    labels: wKeys.map((k) => parseKey(k).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })),
    datasets: [{ label: 'משקל', data: wKeys.map((k) => days[k].weight), borderColor: p.color, fill: true,
      backgroundColor: p.color + '22', tension: .35, pointRadius: 3 }],
  };
  const wOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: true, text: wKeys.length ? 'מגמת משקל' : 'הזינו משקל כדי לראות מגמה' } },
    scales: { x: { reverse: true, grid: { display: false } }, y: { position: 'right', grid: { color: grid } } },
  };
  if (charts.weight) { charts.weight.data = wData; charts.weight.options = wOpts; charts.weight.update(); }
  else charts.weight = new Chart($('#weightChart'), { type: 'line', data: wData, options: wOpts });
}

function renderAll() {
  renderProfiles();
  renderDate();
  renderSummary();
  renderMeals();
  renderCatChips();
  renderProducts();
  renderTray();
  renderSteps();
  renderBmi();
  renderCouple();
  renderCharts();
  if (window.wellnessWatch) window.wellnessWatch.render();
}

// כמות להצגה: 0.25 → ¼, 1.5 → 1½
function fmtQty(q) {
  const whole = Math.floor(q);
  const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[+(q - whole).toFixed(2)];
  if (!frac) return String(+q.toFixed(2));
  return whole ? `${whole}${frac}` : frac;
}
// צעד הכמות ביחידות: 0 → ¼ → ½ → 1 → 1½ …
function stepQty(q, dir) {
  if (dir > 0) return q < 0.5 ? q + 0.25 : q + 0.5;
  return Math.max(0, q <= 0.5 ? q - 0.25 : q - 0.5);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= Product picker ================= */
// הרשימה הקבועה אחרי שינויי הקלוריות שלנו; נבנית מחדש רק כשהשינויים משתנים
let builtinFoods = FOODS;
let builtinKey = '';
function builtins() {
  const ov = state.foodOverrides || {};
  const key = JSON.stringify(ov);
  if (key !== builtinKey) {
    builtinKey = key;
    builtinFoods = FOODS.map((f) => (ov[f.name] ? { ...f, ...ov[f.name], edited: true } : f));
    // מוצרים שכבר נבחרו לארוחה עוברים לגרסה המעודכנת
    tray.forEach((t) => {
      if (!t.food.custom) t.food = builtinFoods.find((b) => b.name === t.food.name) || t.food;
    });
  }
  return builtinFoods;
}
function allFoods() { return [...state.customFoods, ...builtins()]; }
function catIcon(f) { return f.oneOff ? '📝' : f.custom ? '⭐' : (FOOD_CATS.find((c) => c.id === f.cat) || {}).icon || '🍽'; }
const isFixed = (f) => f.kcalUnit != null; // קלוריות קבועות למנה – בלי המרה לגרמים
function unitKcal(f) { return isFixed(f) ? f.kcalUnit : f.kcal100 * f.unitG / 100; }
function itemKcal(t) {
  if (isFixed(t.food)) return t.food.kcalUnit * t.qty;
  return t.mode === 'g' ? t.food.kcal100 * t.qty / 100 : unitKcal(t.food) * t.qty;
}

function renderCatChips() {
  const cats = [{ id: 'all', label: 'הכול', icon: '✨' }];
  if (state.customFoods.length) cats.push({ id: 'mine', label: 'שלי', icon: '⭐' });
  cats.push(...FOOD_CATS);
  if (!cats.some((c) => c.id === pickerCat)) pickerCat = 'all';
  if (unchanged('chips', JSON.stringify([cats.map((c) => c.id), pickerCat]))) return;
  $('#catChips').innerHTML = cats.map((c) =>
    `<button type="button" class="chip ${c.id === pickerCat ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('');
  document.querySelectorAll('#catChips .chip').forEach((b) => {
    b.onclick = () => { pickerCat = b.dataset.cat; renderCatChips(); renderProducts(); };
  });
}

function renderProducts() {
  const q = $('#pickerSearch').value.trim();
  const list = allFoods().filter((f) => {
    if (q) return f.name.includes(q);
    if (pickerCat === 'all') return true;
    if (pickerCat === 'mine') return f.custom;
    return f.cat === pickerCat;
  });
  const grid = $('#productGrid');
  const key = JSON.stringify([q, pickerCat,
    list.map((f) => [f.name, unitKcal(f), f.unit, !!f.edited, !!f.custom]),
    tray.map((t) => [t.food.name, t.qty, t.mode])]);
  if (unchanged('products', key) && grid.childElementCount) return;
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = q
      ? `<div class="none">לא נמצא "${escapeHtml(q)}"<br>
          <button type="button" class="btn primary suggest-add">➕ הוספת "${escapeHtml(q)}" כמוצר חדש</button></div>`
      : '<div class="none">אין מוצרים בקטגוריה הזו</div>';
    const add = grid.querySelector('.suggest-add');
    if (add) add.onclick = () => openCustomAdd(q);
  }
  list.forEach((f) => {
    const inTray = tray.find((t) => t.food === f);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'product' + (inTray ? ' selected' : '');
    b.innerHTML = `<span class="p-icon">${catIcon(f)}</span><span class="p-name">${escapeHtml(f.name)}</span>
      <span class="p-kcal">${fmt(unitKcal(f))} קק"ל · ${escapeHtml(f.unit)}</span>
      ${inTray ? `<span class="p-count" dir="ltr">${inTray.mode === 'g' ? inTray.qty + 'g' : fmtQty(inTray.qty)}</span>` : ''}
      <span class="p-edit ${f.edited ? 'edited' : ''}" title="${f.edited ? 'נערך · ' : ''}עריכה">✎</span>`;
    b.onclick = (e) => {
      if (e.target.closest('.p-edit')) editFood(f);
      else pickFood(f);
    };
    grid.appendChild(b);
  });
}

// פותח את טופס "מוצר שלא מופיע ברשימה" עם השם שחיפשו
function openCustomAdd(name) {
  const box = $('#customAdd');
  box.open = true;
  $('#customName').value = name;
  $('#customKcal').value = '';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#customKcal').focus({ preventScroll: true });
}

/* ---------- עריכת מוצר שלי (מכפתור ✎ בכרטיס) ---------- */
// עורכים לפי שם ולא לפי אובייקט, כי סנכרון יכול להחליף את האובייקטים בזמן שהחלון פתוח
let editing = null; // { name, custom }
const findCustom = (name) => state.customFoods.find((x) => x.name === name);
const findBuiltin = (name) => builtins().find((x) => x.name === name);

// מעדכן ארוחות שכבר נרשמו עם המוצר (בכל הימים ולשני הפרופילים)
function recalcLogged(oldName, food) {
  let n = 0;
  Object.values(state.days).forEach((days) => Object.values(days).forEach((d) => {
    Object.values(d.meals || {}).forEach((items) => items.forEach((it) => {
      if (it.name !== oldName) return;
      const kcal = Math.round(it.unit === 'גרם' && !isFixed(food) ? food.kcal100 * it.qty / 100 : unitKcal(food) * it.qty);
      if (it.kcal !== kcal || it.name !== food.name) { it.kcal = kcal; it.name = food.name; n++; }
    }));
  }));
  return n;
}
const loggedNote = (n) => (n ? ` · עודכנו ${n} פריטים בארוחות` : '');

function editFood(f) {
  editing = { name: f.name, custom: !!f.custom };
  const base = FOODS.find((x) => x.name === f.name);
  $('#feName').value = f.name;
  $('#feName').readOnly = !f.custom;
  $('#feKcal').value = Math.round(unitKcal(f));
  $('#feKcalLabel').textContent = `קק"ל ל${f.unit}${isFixed(f) ? '' : ` (${f.unitG} גר')`}`;
  $('#feDelete').classList.toggle('hidden', !f.custom);
  $('#feReset').classList.toggle('hidden', !f.edited);
  $('#feHint').textContent = f.custom
    ? 'השינוי יעדכן גם ארוחות שכבר נרשמו עם המוצר.'
    : `מוצר מהרשימה הקבועה (במקור ${fmt(unitKcal(base))} קק"ל). השינוי יעדכן גם ארוחות שכבר נרשמו.`;
  $('#foodEdit').showModal();
}

function saveFoodEdit() {
  if (!editing) return;
  const kcal = parseFloat($('#feKcal').value);
  if (!(kcal >= 0)) return;
  let changed = 0;
  if (editing.custom) {
    const f = findCustom(editing.name);
    const name = $('#feName').value.trim();
    if (!f || !name) return;
    if (name !== f.name && allFoods().some((x) => x !== f && x.name === name)) { toast('כבר יש מוצר בשם הזה'); return; }
    const oldName = f.name;
    f.name = name;
    f.kcalUnit = kcal;
    changed = recalcLogged(oldName, f);
  } else {
    const base = FOODS.find((x) => x.name === editing.name);
    if (!base) return;
    const ov = state.foodOverrides || (state.foodOverrides = {});
    if (Math.round(unitKcal(base)) === Math.round(kcal)) delete ov[base.name];
    else ov[base.name] = isFixed(base) ? { kcalUnit: kcal } : { kcal100: +(kcal * 100 / base.unitG).toFixed(2) };
    changed = recalcLogged(base.name, findBuiltin(base.name));
  }
  save(); renderAll();
  toast(`"${$('#feName').value.trim()}" עודכן ✓${loggedNote(changed)}`);
}

function resetFoodEdit() {
  if (!editing || editing.custom) return;
  delete state.foodOverrides[editing.name];
  const changed = recalcLogged(editing.name, findBuiltin(editing.name));
  save();
  $('#foodEdit').close();
  renderAll();
  toast(`"${editing.name}" חזר לערך המקורי${loggedNote(changed)}`);
}

function deleteEditingFood() {
  const f = editing && editing.custom && findCustom(editing.name);
  if (!f || !confirm(`למחוק את "${f.name}" מהמוצרים שלי?`)) return;
  state.customFoods = state.customFoods.filter((x) => x !== f);
  tray = tray.filter((t) => !(t.food.custom && t.food.name === f.name));
  save();
  $('#foodEdit').close();
  renderCatChips(); renderProducts(); renderTray();
  toast(`"${f.name}" נמחק`);
}

function pickFood(f) {
  if (!f.oneOff) f = allFoods().find((x) => x.name === f.name && !!x.custom === !!f.custom) || f;
  const t = tray.find((x) => x.food === f);
  if (t) t.qty += t.mode === 'g' ? f.unitG : 1;
  else tray.push({ food: f, qty: 1, mode: 'unit' });
  renderTray(); renderProducts();
}

function whoList() {
  if (!trayWho || !tray.length) trayWho = [state.active];
  return trayWho;
}
function renderTrayWho() {
  const who = whoList();
  const ids = Object.keys(state.profiles);
  const opt = (key, label, color, on) =>
    `<button type="button" class="chip ${on ? 'active' : ''}" data-who="${key}" style="--c:${color}">${label}</button>`;
  $('#trayWho').innerHTML = '<span>למי:</span>' +
    ids.map((id) => opt(id, escapeHtml(state.profiles[id].name), state.profiles[id].color, who.length === 1 && who[0] === id)).join('') +
    opt('both', 'לשנינו 💑', 'var(--accent)', who.length === ids.length);
  $('#trayWho').querySelectorAll('[data-who]').forEach((b) => {
    b.onclick = () => {
      trayWho = b.dataset.who === 'both' ? ids : [b.dataset.who];
      renderTray();
    };
  });
}

function renderTray() {
  $('#tray').classList.toggle('hidden', !tray.length);
  const ul = $('#trayList');
  const meal = MEALS.find((m) => m.id === currentMeal);
  const total = tray.reduce((s, t) => s + itemKcal(t), 0);
  const who = whoList();
  const names = who.map((id) => state.profiles[id].name).join(' ו');
  $('#addTray').textContent = `הוספה לארוחת ${meal.label}${who.length > 1 || who[0] !== state.active ? ` של ${names}` : ''} · ${fmt(total)} קק"ל${who.length > 1 ? ' לכל אחד' : ''}`;
  renderTrayWho();
  if (unchanged('tray', JSON.stringify(tray.map((t) => [t.food.name, t.qty, t.mode, itemKcal(t)])))) return;
  ul.innerHTML = '';
  tray.forEach((t, i) => {
    const li = document.createElement('li');
    const units = isFixed(t.food)
      ? `<option value="unit">${escapeHtml(t.food.unit)}</option>`
      : `<option value="unit" ${t.mode === 'unit' ? 'selected' : ''}>${escapeHtml(t.food.unit)} (${t.food.unitG} גר')</option>
         <option value="g" ${t.mode === 'g' ? 'selected' : ''}>גרם</option>`;
    // ביחידות מציגים שבר (¼, ½); בגרמים אפשר להקליד מספר
    const qty = t.mode === 'g'
      ? `<input type="number" min="0" step="10" value="${t.qty}" aria-label="כמות בגרמים">`
      : `<span class="qty-val" dir="ltr">${fmtQty(t.qty)}</span>`;
    li.innerHTML = `<span class="t-name">${catIcon(t.food)} ${escapeHtml(t.food.name)}</span>
      <span class="t-kcal">${fmt(itemKcal(t))} קק"ל</span>
      <button type="button" class="del" title="הסרה">✕</button>
      <span class="stepper"><button type="button" data-d="-1" aria-label="פחות">−</button>${qty}<button type="button" data-d="1" aria-label="יותר">+</button></span>
      <select aria-label="יחידה">${units}</select>`;
    li.querySelectorAll('.stepper button').forEach((b) => {
      b.onclick = () => {
        const dir = Number(b.dataset.d);
        t.qty = t.mode === 'g' ? Math.max(0, t.qty + 10 * dir) : +stepQty(t.qty, dir).toFixed(2);
        afterTrayChange();
      };
    });
    const input = li.querySelector('input');
    if (input) input.onchange = (e) => {
      if (e.target.value === '') return; // נמחק בלי להקליד – הערך הקודם חוזר
      t.qty = Math.max(0, parseFloat(e.target.value) || 0);
      afterTrayChange();
    };
    li.querySelector('select').onchange = (e) => {
      const mode = e.target.value;
      if (mode === t.mode) return;
      t.qty = mode === 'g' ? Math.round(t.qty * t.food.unitG) : Math.max(0.25, Math.round(t.qty / t.food.unitG * 4) / 4);
      t.mode = mode;
      afterTrayChange();
    };
    li.querySelector('.del').onclick = () => { tray.splice(i, 1); afterTrayChange(); };
    ul.appendChild(li);
  });
}
function afterTrayChange() { renderTray(); renderProducts(); }

function addTrayToMeal() {
  const items = tray.filter((t) => t.qty > 0);
  if (!items.length) return;
  const who = whoList();
  who.forEach((pid) => {
    const d = day(pid, currentDate, true);
    items.forEach((t) => d.meals[currentMeal].push({
      name: t.food.name, qty: t.qty, unit: t.mode === 'g' ? 'גרם' : t.food.unit, kcal: Math.round(itemKcal(t)),
    }));
  });
  const total = items.reduce((s, t) => s + itemKcal(t), 0);
  const names = who.map((id) => state.profiles[id].name).join(' ו');
  tray = [];
  trayWho = null;
  save(); renderAll();
  toast(`נוספו ${items.length} מוצרים · ${fmt(total)} קק"ל${who.length > 1 || who[0] !== state.active ? ` ל${names}` : ''}`);
}

/* ================= Settings ================= */
function openSettings() {
  $('#settingsProfiles').innerHTML = Object.entries(state.profiles).map(([id, p]) => `
    <div class="settings-profile ${id === state.active ? 'show' : ''}" data-id="${id}" style="--c:${p.color}">
      <div class="field"><label>שם</label><input name="name" value="${escapeHtml(p.name)}" required></div>
      <div class="two">
        <div class="field"><label>מין</label><select name="sex">
          <option value="f" ${p.sex === 'f' ? 'selected' : ''}>אישה</option>
          <option value="m" ${p.sex === 'm' ? 'selected' : ''}>גבר</option></select></div>
        <div class="field"><label>גיל</label><input name="age" type="number" min="10" max="110" value="${p.age}"></div>
      </div>
      <div class="two">
        <div class="field"><label>גובה (ס"מ)</label><input name="height" type="number" min="100" max="230" value="${p.height}"></div>
        <div class="field"><label>משקל התחלתי (ק"ג)</label><input name="weight" type="number" step="0.1" value="${p.weight}"></div>
      </div>
      <div class="two">
        <div class="field"><label>יעד צעדים</label><input name="stepGoal" type="number" step="500" value="${p.stepGoal}"></div>
        <div class="field"><label>יעד קלוריות</label><input name="calGoal" type="number" step="50" value="${p.calGoal}"></div>
      </div>
      <div class="rec" data-rec></div>
      <p class="hint meal-split" data-split></p>
      <div class="field"><label>צבע</label><input name="color" type="color" value="${p.color}"></div>
    </div>`).join('');
  const tabs = $('#settingsTabs');
  tabs.innerHTML = Object.entries(state.profiles).map(([id, p]) =>
    `<button type="button" data-id="${id}" style="--c:${p.color}" class="${id === state.active ? 'active' : ''}">${escapeHtml(p.name)}</button>`).join('');
  tabs.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.settings-profile').forEach((el) => el.classList.toggle('show', el.dataset.id === b.dataset.id));
    };
  });
  // המלצה ליעדים לפי הנתונים בטופס (ומשקל אחרון שנשקל, אם יש)
  document.querySelectorAll('.settings-profile').forEach((el) => {
    const pid = el.dataset.id;
    const val = (n) => el.querySelector(`[name="${n}"]`).value;
    // הכפתור נבנה פעם אחת ומתעדכן במקום, כדי שלחיצה עליו לא תיבלע כששדה אחר נשמר
    const box = el.querySelector('[data-rec]');
    box.innerHTML = '<div><b data-rec-title></b><small data-rec-why></small></div><button type="button" class="btn" data-apply></button>';
    const btn = box.querySelector('[data-apply]');
    let r = null;
    const show = () => {
      const logged = Object.values(state.days[pid] || {}).some((d) => d.weight);
      const weight = logged ? weightOn(pid, todayKey()) : parseFloat(val('weight')) || 0;
      r = recommendGoals({ sex: val('sex'), age: parseFloat(val('age')) || 0, height: parseFloat(val('height')) || 0, weight });
      const same = Number(val('calGoal')) === r.cal && Number(val('stepGoal')) === r.steps;
      box.querySelector('[data-rec-title]').textContent = `💡 מומלץ: ${fmt(r.cal)} קק"ל · ${fmt(r.steps)} צעדים`;
      box.querySelector('[data-rec-why]').textContent = `לפי ${weight} ק"ג${logged ? ' (שקילה אחרונה)' : ''} · BMI ${r.bmi.toFixed(1)} · ${r.why}${r.cal !== r.maintain ? ` · לשמירה: ${fmt(r.maintain)}` : ''}`;
      btn.textContent = same ? '✓ לפי ההמלצה' : 'החלה';
      btn.classList.toggle('primary', !same);
      btn.disabled = same;
    };
    btn.onclick = () => {
      el.querySelector('[name="calGoal"]').value = r.cal;
      el.querySelector('[name="stepGoal"]').value = r.steps;
      el.querySelector('[name="calGoal"]').dispatchEvent(new Event('input'));
      show();
    };
    ['sex', 'age', 'height', 'weight', 'calGoal', 'stepGoal'].forEach((n) => {
      el.querySelector(`[name="${n}"]`).addEventListener('input', show);
      el.querySelector(`[name="${n}"]`).addEventListener('change', show);
    });
    show();
  });
  // החלוקה המומלצת לארוחות מתעדכנת בזמן הקלדת היעד
  document.querySelectorAll('.settings-profile').forEach((el) => {
    const input = el.querySelector('[name="calGoal"]');
    const show = () => {
      const g = parseFloat(input.value) || 0;
      el.querySelector('[data-split]').innerHTML = '<b>חלוקה מומלצת:</b> ' + MEALS.map((m) =>
        `${m.icon} ${m.label} ${fmt(Math.round(g * MEAL_SPLIT[m.id] / 10) * 10)}`).join(' · ');
    };
    input.addEventListener('input', show);
    show();
  });
  $('#settings').showModal();
  $('.settings-body').scrollTop = 0;
}

function saveSettings() {
  document.querySelectorAll('.settings-profile').forEach((el) => {
    const p = state.profiles[el.dataset.id];
    const v = (n) => el.querySelector(`[name="${n}"]`).value;
    p.name = v('name').trim() || p.name;
    p.sex = v('sex');
    ['age', 'height', 'weight', 'stepGoal', 'calGoal'].forEach((k) => {
      const num = parseFloat(v(k));
      if (num > 0) p[k] = num;
    });
    p.color = v('color');
  });
  save(); renderAll();
  toast('ההגדרות נשמרו ✓');
}

/* ================= Events ================= */
function bindNumberFields() {
  const isNum = (el) => el && el.matches && el.matches('input[type=number]') && el.dataset.keep == null;
  const start = (el) => {
    if (el.value === '') return;
    if (el.dataset.ph == null) el.dataset.ph = el.placeholder;
    el.dataset.prev = el.value;
    el.placeholder = el.value;
    el.value = '';
  };
  document.addEventListener('focusin', (e) => { if (isNum(e.target)) start(e.target); });
  // בטלפון סגירת המקלדת לא מוציאה את הפוקוס מהשדה, ולכן נגיעה חוזרת לא מפעילה focusin –
  // נגיעה בשדה שכבר בפוקוס מתחילה הזנה חדשה
  document.addEventListener('pointerdown', (e) => {
    if (isNum(e.target) && document.activeElement === e.target) start(e.target);
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('input[type=number]') || el.dataset.prev == null) return;
    if (el.value === '') el.value = el.dataset.prev;
    el.placeholder = el.dataset.ph || '';
    delete el.dataset.prev;
    delete el.dataset.ph;
  });
}

function bind() {
  bindNumberFields();
  $('#prevDay').onclick = () => { currentDate = shiftKey(currentDate, -1); renderAll(); };
  $('#nextDay').onclick = () => { if (currentDate < todayKey()) { currentDate = shiftKey(currentDate, 1); renderAll(); } };
  $('#todayBtn').onclick = () => { currentDate = todayKey(); renderAll(); };
  $('#datePicker').onchange = (e) => {
    if (e.target.value) { currentDate = e.target.value > todayKey() ? todayKey() : e.target.value; renderAll(); }
  };

  $('#pickerSearch').addEventListener('input', renderProducts);
  $('#clearTray').onclick = () => { tray = []; afterTrayChange(); };
  $('#addTray').onclick = addTrayToMeal;
  $('#feDelete').onclick = deleteEditingFood;
  $('#feReset').onclick = resetFoodEdit;
  $('#foodEditForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') saveFoodEdit();
  });
  // מוצר חד-פעמי: נכנס לסל ולחישוב היום, לא נשמר ב"שלי"
  $('#oneOffBtn').onclick = () => {
    const kcal = parseFloat($('#customKcal').value);
    if (!(kcal >= 0)) { $('#customKcal').focus(); toast('הזינו כמה קלוריות'); return; }
    const name = $('#customName').value.trim() || 'פריט נוסף';
    tray.push({ food: { name, custom: true, oneOff: true, unit: 'מנה', kcalUnit: kcal }, qty: 1, mode: 'unit' });
    $('#customName').value = ''; $('#customKcal').value = '';
    $('#pickerSearch').value = '';
    afterTrayChange();
    $('#tray').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`"${name}" נוסף לארוחה הזו בלבד`);
  };
  $('#customForm').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#customName').value.trim();
    const kcal = parseFloat($('#customKcal').value);
    if (!name || !(kcal >= 0)) return;
    let food = state.customFoods.find((f) => f.name === name);
    if (food) food.kcalUnit = kcal;
    else { food = { name, custom: true, unit: 'מנה', kcalUnit: kcal }; state.customFoods.unshift(food); }
    save();
    $('#customName').value = ''; $('#customKcal').value = '';
    $('#pickerSearch').value = '';
    renderCatChips();
    pickFood(food);
    toast(`"${name}" נשמר ונבחר`);
  };

  const setSteps = (val) => {
    const d = day(state.active, currentDate, true);
    d.steps = Math.max(0, Math.round(val) || 0);
    save(); renderAll();
  };
  $('#stepsInput').addEventListener('change', (e) => { if (e.target.value !== '') setSteps(parseFloat(e.target.value)); });
  document.querySelectorAll('[data-steps]').forEach((b) => {
    b.onclick = () => setSteps(((day() && day().steps) || 0) + Number(b.dataset.steps));
  });

  $('#exType').innerHTML = EXERCISES.map((x, i) => `<option value="${i}">${x.name}</option>`).join('');
  $('#addExForm').onsubmit = (e) => {
    e.preventDefault();
    const x = EXERCISES[$('#exType').value];
    const min = parseFloat($('#exMin').value);
    if (!(min > 0)) return;
    day(state.active, currentDate, true).exercise.push({ name: x.name, met: x.met, min });
    save(); renderAll();
    toast(`נוסף: ${x.name} ${min} דק'`);
  };

  $('#weightInput').addEventListener('change', (e) => {
    const w = parseFloat(e.target.value);
    if (!(w > 20 && w < 350)) return;
    day(state.active, currentDate, true).weight = w;
    save(); renderAll();
    toast('המשקל עודכן וה-BMI חושב מחדש');
  });

  $('#openSettings').onclick = openSettings;
  $('#syncPill').onclick = openSettings;
  $('#settingsForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') saveSettings();
  });

  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wellness-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.profiles || !data.days) throw new Error('bad file');
      state = Object.assign(defaultState(), data);
      tray = []; save(); renderAll();
      $('#settings').close();
      toast('הנתונים יובאו בהצלחה ✓');
    } catch (err) {
      toast('הקובץ אינו תקין');
    }
    e.target.value = '';
  };

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderCharts);
}

// ממשק עבור sync.js (שמירה משותפת)
window.wellness = {
  getState: () => state,
  applyRemote(mutate) {
    mutate(state);
    migrateNames();
    persistLocal();
    renderAll();
  },
  toast,
};

// בדיקת גרסה חדשה: GitHub Pages שומר את הדף במטמון עד 10 דקות, אז בודקים בעצמנו
async function checkForUpdate() {
  if (!APP_VERSION || location.protocol === 'file:') return;
  try {
    const html = await (await fetch(`${location.pathname}?check=${Date.now()}`, { cache: 'no-store' })).text();
    const m = html.match(/app\.js\?v=([\w-]+)/);
    if (!m || m[1] === APP_VERSION) return;
    const bar = $('#updateBar');
    bar.classList.remove('hidden');
    bar.querySelector('button').onclick = () => location.replace(`${location.pathname}?v=${m[1]}${location.hash}`);
  } catch (e) { /* offline */ }
}

bind();
renderAll();
$('#appVersion').textContent = APP_VERSION ? `גרסה ${APP_VERSION}` : '';
checkForUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
if (goalsJustUpdated) {
  goalsJustUpdated = false;
  toast('🎯 היעדים עודכנו לפי ההמלצה – הפירוט בהגדרות');
}
