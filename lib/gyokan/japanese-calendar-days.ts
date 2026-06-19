import { isoDate } from "./iso-date";

export type CalendarDayKind = "holiday" | "commemorative";

export type CalendarDayEntry = {
  label: string;
  kind: CalendarDayKind;
};

function padDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateAt(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

/** nth weekday in month (weekday: 0=Sun … 6=Sat). */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): string {
  const cursor = dateAt(year, month, 1);
  let count = 0;
  while (cursor.getMonth() === month - 1) {
    if (cursor.getDay() === weekday) {
      count += 1;
      if (count === n) return isoDate(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return padDate(year, month, 1);
}

function vernalEquinoxDay(year: number) {
  if (year >= 1980 && year <= 2099) {
    return Math.floor(
      20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
    );
  }
  if (year >= 1900 && year < 1980) {
    return Math.floor(
      20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
    );
  }
  return 20;
}

function autumnalEquinoxDay(year: number) {
  if (year >= 1980 && year <= 2099) {
    return Math.floor(
      23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
    );
  }
  if (year >= 1900 && year < 1980) {
    return Math.floor(
      23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
    );
  }
  return 23;
}

function marineDay(year: number) {
  if (year === 2020) return padDate(year, 7, 23);
  if (year === 2021) return padDate(year, 7, 22);
  return nthWeekdayOfMonth(year, 7, 1, 3);
}

function mountainDay(year: number) {
  if (year === 2020) return padDate(year, 8, 10);
  if (year === 2021) return padDate(year, 8, 8);
  if (year >= 2016) return padDate(year, 8, 11);
  return "";
}

function sportsDay(year: number) {
  if (year === 2020) return padDate(year, 7, 24);
  if (year === 2021) return padDate(year, 7, 23);
  return nthWeekdayOfMonth(year, 10, 1, 2);
}

function emperorBirthday(year: number) {
  if (year >= 2020) return padDate(year, 2, 23);
  if (year >= 1989 && year <= 2018) return padDate(year, 12, 23);
  return "";
}

function buildBaseHolidays(year: number) {
  const holidays = new Map<string, string>();

  const add = (iso: string, label: string) => {
    if (iso) holidays.set(iso, label);
  };

  add(padDate(year, 1, 1), "元日");
  add(nthWeekdayOfMonth(year, 1, 1, 2), "成人の日");
  add(padDate(year, 2, 11), "建国記念の日");
  add(emperorBirthday(year), "天皇誕生日");
  add(padDate(year, 3, vernalEquinoxDay(year)), "春分の日");
  add(padDate(year, 4, 29), "昭和の日");
  add(padDate(year, 5, 3), "憲法記念日");
  add(padDate(year, 5, 4), "みどりの日");
  add(padDate(year, 5, 5), "こどもの日");
  add(marineDay(year), "海の日");
  add(mountainDay(year), "山の日");
  add(nthWeekdayOfMonth(year, 9, 1, 3), "敬老の日");
  add(padDate(year, 9, autumnalEquinoxDay(year)), "秋分の日");
  add(sportsDay(year), year >= 2020 ? "スポーツの日" : "体育の日");
  add(padDate(year, 11, 3), "文化の日");
  add(padDate(year, 11, 23), "勤労感謝の日");

  return holidays;
}

function applySubstituteHolidays(holidays: Map<string, string>) {
  for (const iso of [...holidays.keys()].sort()) {
    const date = new Date(iso + "T12:00:00");
    if (date.getDay() !== 0) continue;

    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    while (holidays.has(isoDate(next))) {
      next.setDate(next.getDate() + 1);
    }
    const substitute = isoDate(next);
    if (!holidays.has(substitute)) {
      holidays.set(substitute, "振替休日");
    }
  }
}

function applyCitizensHolidays(holidays: Map<string, string>) {
  const sorted = [...holidays.keys()].sort();
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = new Date(sorted[i]! + "T12:00:00");
    const end = new Date(sorted[i + 1]! + "T12:00:00");
    const gapDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (gapDays !== 2) continue;

    const between = new Date(start);
    between.setDate(between.getDate() + 1);
    const iso = isoDate(between);
    if (between.getDay() !== 0 && !holidays.has(iso)) {
      holidays.set(iso, "国民の休日");
    }
  }
}

function buildCommemorativeDays(year: number) {
  const days = new Map<string, string>();
  const add = (iso: string, label: string) => days.set(iso, label);

  add(padDate(year, 2, 14), "バレンタインデー");
  add(padDate(year, 3, 14), "ホワイトデー");
  add(nthWeekdayOfMonth(year, 5, 0, 2), "母の日");
  add(nthWeekdayOfMonth(year, 6, 0, 3), "父の日");
  add(padDate(year, 7, 7), "七夕");
  add(padDate(year, 10, 31), "ハロウィン");
  add(padDate(year, 12, 24), "クリスマスイブ");
  add(padDate(year, 12, 25), "クリスマス");
  add(padDate(year, 12, 31), "大晦日");

  return days;
}

const holidayCache = new Map<number, Map<string, string>>();
const commemorativeCache = new Map<number, Map<string, string>>();

function holidaysForYear(year: number) {
  let cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays = buildBaseHolidays(year);
  applySubstituteHolidays(holidays);
  applyCitizensHolidays(holidays);
  holidayCache.set(year, holidays);
  return holidays;
}

function commemorativeForYear(year: number) {
  let cached = commemorativeCache.get(year);
  if (cached) return cached;

  cached = buildCommemorativeDays(year);
  commemorativeCache.set(year, cached);
  return cached;
}

export function getJapaneseCalendarDay(iso: string): CalendarDayEntry | null {
  const year = Number(iso.slice(0, 4));
  if (!Number.isFinite(year)) return null;

  const holiday = holidaysForYear(year).get(iso);
  if (holiday) return { label: holiday, kind: "holiday" };

  const commemorative = commemorativeForYear(year).get(iso);
  if (commemorative) return { label: commemorative, kind: "commemorative" };

  return null;
}
