// קטגוריות להצגה בבוחר המוצרים
const FOOD_CATS = [
  { id: 'grains', label: 'לחמים ודגנים', icon: '🍞' },
  { id: 'protein', label: 'חלבון', icon: '🍗' },
  { id: 'dairy', label: 'חלב וגבינות', icon: '🧀' },
  { id: 'dishes', label: 'מנות', icon: '🥙' },
  { id: 'produce', label: 'ירקות ופירות', icon: '🥗' },
  { id: 'sweets', label: 'שומנים ומתוקים', icon: '🍫' },
  { id: 'drinks', label: 'שתייה', icon: '☕' },
];

// מאגר מזונות: קלוריות ל-100 גרם, ויחידת הגשה נפוצה (שם + משקל בגרם)
const FOODS = [
  // לחמים ודגנים
  { cat: 'grains', name: 'לחם לבן', kcal100: 265, unit: 'פרוסה', unitG: 30 },
  { cat: 'grains', name: 'לחם מלא', kcal100: 247, unit: 'פרוסה', unitG: 30 },
  { cat: 'grains', name: 'פיתה', kcal100: 275, unit: 'פיתה', unitG: 80 },
  { cat: 'grains', name: 'לחמניה', kcal100: 280, unit: 'יחידה', unitG: 60 },
  { cat: 'grains', name: 'פריכית אורז', kcal100: 387, unit: 'פריכית', unitG: 9 },
  { cat: 'grains', name: 'קרקר', kcal100: 430, unit: 'יחידה', unitG: 7 },
  { cat: 'grains', name: 'קורנפלקס', kcal100: 375, unit: 'כוס', unitG: 30 },
  { cat: 'grains', name: 'אורז לבן מבושל', kcal100: 130, unit: 'כוס', unitG: 160 },
  { cat: 'grains', name: 'פסטה מבושלת', kcal100: 158, unit: 'כוס', unitG: 140 },
  { cat: 'grains', name: 'פתיתים מבושלים', kcal100: 160, unit: 'כוס', unitG: 160 },
  { cat: 'grains', name: 'תפוח אדמה מבושל', kcal100: 87, unit: 'יחידה', unitG: 150 },
  { cat: 'grains', name: 'בטטה אפויה', kcal100: 90, unit: 'יחידה', unitG: 150 },
  // חלבון
  { cat: 'protein', name: 'ביצה', kcal100: 155, unit: 'ביצה', unitG: 55 },
  { cat: 'protein', name: 'חביתה (ביצה אחת בשמן)', kcal100: 190, unit: 'יחידה', unitG: 60 },
  { cat: 'protein', name: 'חזה עוף צלוי', kcal100: 165, unit: 'מנה', unitG: 150 },
  { cat: 'protein', name: 'פרגית צלויה', kcal100: 210, unit: 'מנה', unitG: 150 },
  { cat: 'protein', name: 'שניצל', kcal100: 260, unit: 'יחידה', unitG: 120 },
  { cat: 'protein', name: 'סלמון', kcal100: 208, unit: 'מנה', unitG: 150 },
  { cat: 'protein', name: 'טונה במים', kcal100: 116, unit: 'קופסה', unitG: 120 },
  { cat: 'protein', name: 'בשר בקר טחון', kcal100: 250, unit: 'מנה', unitG: 150 },
  { cat: 'protein', name: 'סטייק אנטריקוט', kcal100: 290, unit: 'מנה', unitG: 200 },
  { cat: 'protein', name: 'קציצה', kcal100: 230, unit: 'יחידה', unitG: 60 },
  { cat: 'protein', name: 'טופו', kcal100: 76, unit: 'מנה', unitG: 150 },
  { cat: 'protein', name: 'עדשים מבושלות', kcal100: 116, unit: 'כוס', unitG: 200 },
  // חלב וגבינות
  { cat: 'dairy', name: 'חלב 3%', kcal100: 60, unit: 'כוס', unitG: 240 },
  { cat: 'dairy', name: 'יוגורט 3%', kcal100: 60, unit: 'גביע', unitG: 200 },
  { cat: 'dairy', name: 'יוגורט יווני 0%', kcal100: 59, unit: 'גביע', unitG: 170 },
  { cat: 'dairy', name: 'גבינה לבנה 5%', kcal100: 95, unit: 'כף', unitG: 30 },
  { cat: 'dairy', name: 'קוטג\' 5%', kcal100: 100, unit: 'גביע', unitG: 250 },
  { cat: 'dairy', name: 'גבינה צהובה 28%', kcal100: 350, unit: 'פרוסה', unitG: 20 },
  { cat: 'dairy', name: 'גבינה בולגרית 5%', kcal100: 130, unit: 'קובייה', unitG: 30 },
  { cat: 'dairy', name: 'לבנה', kcal100: 160, unit: 'כף', unitG: 30 },
  { cat: 'dairy', name: 'גבינת שמנת', kcal100: 290, unit: 'כף', unitG: 20 },
  // מזרחי ומנות
  { cat: 'dishes', name: 'חומוס (ממרח)', kcal100: 240, unit: 'כף', unitG: 30 },
  { cat: 'dishes', name: 'טחינה מוכנה', kcal100: 300, unit: 'כף', unitG: 20 },
  { cat: 'dishes', name: 'פלאפל', kcal100: 333, unit: 'כדור', unitG: 17 },
  { cat: 'dishes', name: 'שקשוקה', kcal100: 110, unit: 'מנה', unitG: 300 },
  { cat: 'dishes', name: 'שווארמה', kcal100: 220, unit: 'מנה', unitG: 200 },
  { cat: 'dishes', name: 'מג\'דרה', kcal100: 150, unit: 'כוס', unitG: 200 },
  { cat: 'dishes', name: 'פיצה', kcal100: 266, unit: 'משולש', unitG: 110 },
  { cat: 'dishes', name: 'שווארמה בצלחת', kcal100: 180, unit: 'צלחת', unitG: 450 },
  { cat: 'dishes', name: 'פסטה בולונז', kcal100: 150, unit: 'צלחת', unitG: 350 },
  { cat: 'dishes', name: 'תבשיל אפונה וגזר', kcal100: 85, unit: 'קערה', unitG: 200 },
  { cat: 'dishes', name: 'פוטטוס', kcal100: 190, unit: 'מנה', unitG: 150 },
  // ארוחה שלמה: כריך מק רויאל (~520) + צ'יפס בינוני (~330) + שתייה מוגזת בינונית (~200)
  { cat: 'dishes', name: 'ארוחת מק רויאל', kcalUnit: 1050, unit: 'ארוחה' },
  // מנות מסעדה – הערכה לפי רכיבים (אין נתונים רשמיים)
  // חזה עוף צלוי ~200 ג' (~360) + שעועית ירוקה מוקפצת ~150 ג' (~90) + סלטון עם רוטב חמאת בוטנים (~180)
  { cat: 'dishes', name: 'לה קרנה: חזה עוף, שעועית וסלטון ברוטב בוטנים', kcalUnit: 630, unit: 'מנה' },
  // חזה עוף צלוי ~200 ג' (~360) + צ'יפס מתובל ~150 ג' (~470) + סלטון עם רוטב חמאת בוטנים (~180)
  { cat: 'dishes', name: 'לה קרנה: חזה עוף, צ\'יפס וסלטון ברוטב בוטנים', kcalUnit: 1010, unit: 'מנה' },
  // חזה עוף ~150 ג' (~250) + רוטב חלב קוקוס וירקות (~400) + אטריות ביצים מבושלות ~200 ג' (~275)
  { cat: 'dishes', name: 'ניניצ\'ו: קארי קוקוס עם חזה עוף ואטריות ביצים', kcalUnit: 925, unit: 'מנה' },
  // חזה עוף ~150 ג' (~280) + כרוב מבושל ~150 ג' (~60) + בטטה ~150 ג' (~135) + פטריות מוקפצות ~100 ג' (~60)
  { cat: 'dishes', name: 'חזה עוף עם כרוב מבושל, בטטה ופטריות', kcalUnit: 535, unit: 'מנה' },
  { cat: 'dishes', name: 'המבורגר בלחמניה', kcal100: 250, unit: 'יחידה', unitG: 230 },
  { cat: 'dishes', name: 'צ\'יפס', kcal100: 312, unit: 'מנה', unitG: 150 },
  { cat: 'dishes', name: 'סושי', kcal100: 150, unit: 'יחידה', unitG: 30 },
  { cat: 'dishes', name: 'מרק ירקות', kcal100: 35, unit: 'קערה', unitG: 300 },
  { cat: 'dishes', name: 'מרק עוף', kcal100: 45, unit: 'קערה', unitG: 300 },
  // ירקות ופירות
  { cat: 'produce', name: 'סלט ירקות (בלי שמן)', kcal100: 22, unit: 'קערה', unitG: 200 },
  // 2 עגבניות (43) + 2 מלפפונים (30) + גמבה (39) + חצי אבוקדו (160), בלי שמן
  { cat: 'produce', name: 'סלט בהרכבה: עגבניות, מלפפונים, גמבה ואבוקדו', kcalUnit: 270, unit: 'קערה' },
  { cat: 'produce', name: 'עגבנייה', kcal100: 18, unit: 'יחידה', unitG: 120 },
  { cat: 'produce', name: 'מלפפון', kcal100: 15, unit: 'יחידה', unitG: 100 },
  { cat: 'produce', name: 'גזר', kcal100: 41, unit: 'יחידה', unitG: 70 },
  { cat: 'produce', name: 'פלפל', kcal100: 26, unit: 'יחידה', unitG: 150 },
  { cat: 'produce', name: 'אבוקדו', kcal100: 160, unit: 'חצי', unitG: 100 },
  { cat: 'produce', name: 'תפוח', kcal100: 52, unit: 'יחידה', unitG: 180 },
  { cat: 'produce', name: 'בננה', kcal100: 89, unit: 'יחידה', unitG: 120 },
  { cat: 'produce', name: 'תפוז', kcal100: 47, unit: 'יחידה', unitG: 150 },
  { cat: 'produce', name: 'ענבים', kcal100: 69, unit: 'כוס', unitG: 150 },
  { cat: 'produce', name: 'אבטיח', kcal100: 30, unit: 'פלח', unitG: 300 },
  { cat: 'produce', name: 'מנגו', kcal100: 60, unit: 'יחידה', unitG: 200 },
  { cat: 'produce', name: 'תמר', kcal100: 277, unit: 'יחידה', unitG: 24 },
  { cat: 'produce', name: 'תותים', kcal100: 32, unit: 'כוס', unitG: 150 },
  // שומנים, אגוזים ומתוקים
  { cat: 'sweets', name: 'שמן זית', kcal100: 884, unit: 'כף', unitG: 13 },
  { cat: 'sweets', name: 'חמאה', kcal100: 717, unit: 'כפית', unitG: 5 },
  { cat: 'sweets', name: 'חמאת בוטנים', kcal100: 588, unit: 'כף', unitG: 16 },
  { cat: 'sweets', name: 'שקדים', kcal100: 579, unit: 'חופן', unitG: 28 },
  { cat: 'sweets', name: 'אגוזי מלך', kcal100: 654, unit: 'חופן', unitG: 28 },
  { cat: 'sweets', name: 'דבש', kcal100: 304, unit: 'כפית', unitG: 7 },
  { cat: 'sweets', name: 'סוכר', kcal100: 387, unit: 'כפית', unitG: 5 },
  { cat: 'sweets', name: 'שוקולד חלב', kcal100: 535, unit: 'שורה', unitG: 25 },
  { cat: 'sweets', name: 'עוגיה', kcal100: 480, unit: 'יחידה', unitG: 15 },
  { cat: 'sweets', name: 'עוגה', kcal100: 380, unit: 'פרוסה', unitG: 80 },
  { cat: 'sweets', name: 'במבה', kcal100: 545, unit: 'שקית קטנה', unitG: 25 },
  { cat: 'sweets', name: 'גלידה', kcal100: 207, unit: 'כדור', unitG: 70 },
  // שתייה
  { cat: 'drinks', name: 'קפה הפוך', kcal100: 50, unit: 'כוס', unitG: 240 },
  { cat: 'drinks', name: 'קפה שחור / תה', kcal100: 1, unit: 'כוס', unitG: 240 },
  { cat: 'drinks', name: 'מיץ תפוזים', kcal100: 45, unit: 'כוס', unitG: 240 },
  { cat: 'drinks', name: 'קולה', kcal100: 42, unit: 'פחית', unitG: 330 },
  { cat: 'drinks', name: 'בירה', kcal100: 43, unit: 'בקבוק', unitG: 330 },
  { cat: 'drinks', name: 'יין', kcal100: 83, unit: 'כוס', unitG: 150 },
];

// מוצרים מהרשימה הקבועה ששמם השתנה: שם ישן → שם חדש.
// app.js מעביר אליהם ארוחות שנרשמו ושינויי קלוריות (✎) שנשמרו בשם הישן.
const RENAMED_FOODS = {
  'ניניצ\'ו: קארי קוקוס עם חזה עוף ואורז': 'ניניצ\'ו: קארי קוקוס עם חזה עוף ואטריות ביצים',
};

// פעילויות: ערכי MET (Compendium of Physical Activities)
const EXERCISES = [
  { name: 'ריצה', met: 9.8 },
  { name: 'רכיבה על אופניים', met: 7.5 },
  { name: 'שחייה', met: 7 },
  { name: 'אימון כוח / חדר כושר', met: 5 },
  { name: 'אימון HIIT', met: 8 },
  { name: 'ריקוד', met: 5 },
  { name: 'פילאטיס', met: 3 },
  { name: 'יוגה', met: 2.5 },
  { name: 'טניס', met: 7.3 },
  { name: 'כדורגל / כדורסל', met: 7 },
  { name: 'ניקיון הבית', met: 3.3 },
  { name: 'גינון', met: 3.8 },
];
