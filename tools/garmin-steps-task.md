# משימה מתוזמנת: צעדים מגרמין

הקובץ הזה הוא ההוראות למשימה מתוזמנת של Claude שמעדכנת את הצעדים של **חן (p1)** מ-Garmin Connect.

## הקמה (פעם אחת)
1. מחברים את מחבר Garmin ב-https://claude.ai/customize/connectors.
2. פותחים סשן חדש של Claude Code על המאגר `henmess/Wellness` ומבקשים:
   > צור משימה מתוזמנת לפי tools/garmin-steps-task.md
3. Claude יוצר משימה שרצה כמה פעמים ביום, עם גישה למחבר Garmin ולמאגר `henmess/wellness-data`.

## ההוראה שהמשימה מריצה בכל פעם
> עדכן את הצעדים של חן מגרמין:
> 1. שכפל את `henmess/wellness-data` (עם הרשאת push) ואת `henmess/Wellness`.
> 2. בעזרת מחבר Garmin, קרא את מספר הצעדים היומי של 3 הימים האחרונים כולל היום (לפי שעון ישראל, Asia/Jerusalem).
> 3. הרץ: `node Wellness/tools/set-steps.mjs wellness-data p1 <תאריך>=<צעדים> ...`
> 4. אם השתנה משהו: commit ("Garmin steps") ו-push לענף הראשי של wellness-data. אם ה-push נדחה – pull ונסה שוב.
> 5. אם מחבר Garmin לא זמין או מחזיר שגיאה – אל תכתוב כלום ודווח על השגיאה.
>
> אל תמציא נתונים ואל תשנה שום דבר אחר במאגר.

האתר קולט את השינוי בסנכרון הבא (עד חצי דקה כשהוא פתוח).
