---
name: manage-foods
description: Add, remove or change foods and their calories in the Wellness site's built-in food list (foods.js). Use when the user asks to add dishes/products ("תוסיף מאכלים", "תוסיף לרשימה"), remove them ("תוריד"), or fix calories/serving sizes of built-in items ("תעדכן קלוריות של...").
---

# Managing the built-in food list

The built-in list lives in `foods.js` (`FOODS`, grouped by the `FOOD_CATS` categories).
The user's own products and their edits of built-in calories are **not** in code: they live
in the site data (`customFoods`, `foodOverrides`) and are edited in the site with the ✎ button.
If the user wants to change something for themselves only, point them there instead.

## Entry format
Two kinds of entries. Keep them inside the matching category section of `FOODS`:

```js
// Weighed food: calories per 100 g + a common serving (name + grams).
{ cat: 'dishes', name: 'פסטה בולונז', kcal100: 150, unit: 'צלחת', unitG: 350 },
// Whole serving with a fixed total (composed salads, fast-food meals). No grams option.
// Put the breakdown in a comment above it.
// כריך (~520) + צ'יפס בינוני (~330) + שתייה בינונית (~200)
{ cat: 'dishes', name: 'ארוחת מק רויאל', kcalUnit: 1050, unit: 'ארוחה' },
```

Categories (`cat`): `grains`, `protein`, `dairy`, `dishes`, `produce`, `sweets`, `drinks`.

## Choosing values
- Use standard nutrition tables (Israeli "צמרת" / USDA FoodData Central) for kcal per 100 g, and
  typical Israeli serving sizes (פרוסה 30 ג', פיתה 80 ג', כף 13–30 ג', כוס מבושל 140–200 ג').
- Cooked weights for grains/pasta; prepared values for spreads (טחינה מוכנה, not raw).
- Composed dishes: sum the ingredients, round to the nearest 5–10 kcal, and say what you assumed
  (e.g. "חצי אבוקדו, בלי שמן").
- Names in Hebrew, unique across the list. If a requested item already exists, don't duplicate
  it: tell the user its current values.
- If a name is ambiguous or looks like a typo (e.g. "קוקוס מלא" in a list of grains), pick the
  likely meaning, state the assumption, and invite correction.

## Editing safely
- **Don't rename existing built-in items** unless asked: `foodOverrides` and logged meals match
  items by name. When a rename is needed (e.g. the user corrects what a dish contains), add
  `'old name': 'new name'` to `RENAMED_FOODS` in `foods.js`; `app.js` then moves logged meals and
  calorie edits to the new name on every device.
- Removing an item is safe: logged meals keep their stored calories.
- Changing a built-in value changes it for new picks only; logged meals keep their values unless
  the user edits the product in the site.

## After every change
1. `node tools/check-foods.mjs`: must print `OK` (unique names, valid categories, sane numbers).
2. Bump the cache version in `index.html`: every `?v=YYYYMMDDx` on the asset links, so phones
   don't mix old and new files.
3. Check in a browser (Playwright, Chromium is preinstalled) that each new item is found by the
   search box and shows the expected calories on its card (`.product .p-kcal`), and that removed
   items no longer appear. Serve over http (`python3 -m http.server`); `file://` blocks `sync.js`.
4. Commit and push to the working branch.
5. Reply in Hebrew with a short table of what changed (name · unit · kcal per unit), plus any
   assumptions and items that already existed.
