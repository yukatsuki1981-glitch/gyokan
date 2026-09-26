import { getLunar } from "chinese-lunar-calendar";

// index = (lunarMonth + lunarDay - 1) % 6. Verified against the well-known
// fixed points of the cycle (旧暦1/1・7/1 = 先勝, 5/1・11/1 = 大安,
// 6/1・12/1 = 赤口) rather than guessing an ordering.
const ROKUYOU_NAMES = ["赤口", "先勝", "友引", "先負", "仏滅", "大安"] as const;

/** Returns the 六曜 for a `YYYY-MM-DD` date, or null if it's out of the
 * underlying lunar table's supported range (1901-2100). Leap lunar months
 * intentionally reuse their base month's index (the standard convention). */
export function getRokuyou(iso: string): string | null {
  const [year, month, day] = iso.split("-").map((v) => parseInt(v, 10));
  try {
    const { lunarMonth, lunarDate } = getLunar(year, month, day);
    return ROKUYOU_NAMES[(lunarMonth + lunarDate - 1) % 6];
  } catch {
    return null;
  }
}
