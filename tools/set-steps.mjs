#!/usr/bin/env node
// כותב צעדים יומיים לקובצי הנתונים של מאגר wellness-data, באותו פורמט שהאתר משתמש בו.
// שימוש: node tools/set-steps.mjs <תיקיית wellness-data> <p1|p2> <YYYY-MM-DD=צעדים> [...]
// דוגמה:  node tools/set-steps.mjs ../wellness-data p1 2026-10-16=8432 2026-10-17=5120
import fs from 'node:fs';
import path from 'node:path';

const [dir, pid, ...pairs] = process.argv.slice(2);
if (!dir || !/^p[12]$/.test(pid || '') || !pairs.length) {
  console.error('usage: set-steps.mjs <wellness-data dir> <p1|p2> <YYYY-MM-DD=steps> [...]');
  process.exit(2);
}

const emptyDay = () => ({ steps: 0, meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, exercise: [] });
const files = {};
let changed = 0;

for (const pair of pairs) {
  const m = pair.match(/^(\d{4}-\d{2}-\d{2})=(\d+)$/);
  if (!m) { console.error(`bad value: ${pair}`); process.exit(2); }
  const [, date, stepsStr] = m;
  const steps = Number(stepsStr);
  if (steps <= 0) continue; // אין נתון – לא דורסים ערך קיים
  const file = path.join(dir, 'days', `${date.slice(0, 7)}.json`);
  if (!files[file]) files[file] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const month = files[file];
  const day = ((month[pid] ||= {})[date] ||= emptyDay());
  if (day.steps !== steps) {
    console.log(`${pid} ${date}: ${day.steps} → ${steps}`);
    day.steps = steps;
    day.stepsSource = 'garmin';
    changed++;
  }
}

for (const [file, data] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}
console.log(changed ? `updated ${changed} day(s)` : 'no changes');
