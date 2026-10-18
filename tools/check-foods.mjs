#!/usr/bin/env node
// בודק את foods.js: שמות ייחודיים, קטגוריות קיימות, ערכים מספריים הגיוניים.
// שימוש: node tools/check-foods.mjs   (יוצא עם קוד 1 אם יש שגיאות)
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../foods.js', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(`${src}\nthis.FOOD_CATS = FOOD_CATS; this.FOODS = FOODS; this.EXERCISES = EXERCISES;`, ctx);
const { FOOD_CATS, FOODS } = ctx;

const errors = [];
const cats = new Set(FOOD_CATS.map((c) => c.id));
const seen = new Map();
FOODS.forEach((f, i) => {
  const at = `#${i + 1} "${f.name}"`;
  if (!f.name || typeof f.name !== 'string') errors.push(`${at}: missing name`);
  if (seen.has(f.name)) errors.push(`${at}: duplicate name (also #${seen.get(f.name)})`);
  seen.set(f.name, i + 1);
  if (!cats.has(f.cat)) errors.push(`${at}: unknown cat "${f.cat}"`);
  if (!f.unit) errors.push(`${at}: missing unit`);
  const fixed = f.kcalUnit != null;
  if (fixed) {
    if (!(f.kcalUnit > 0 && f.kcalUnit < 5000)) errors.push(`${at}: kcalUnit out of range`);
    if (f.kcal100 != null || f.unitG != null) errors.push(`${at}: fixed item must not have kcal100/unitG`);
  } else {
    if (!(f.kcal100 >= 0 && f.kcal100 <= 900)) errors.push(`${at}: kcal100 must be 0–900 (pure fat is ~884)`);
    if (!(f.unitG > 0 && f.unitG <= 2000)) errors.push(`${at}: unitG must be 1–2000`);
  }
});

const perCat = {};
FOODS.forEach((f) => { perCat[f.cat] = (perCat[f.cat] || 0) + 1; });
console.log(`${FOODS.length} foods:`, Object.entries(perCat).map(([c, n]) => `${c} ${n}`).join(', '));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK');
