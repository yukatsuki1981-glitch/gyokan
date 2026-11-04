/**
 * How many one-chip-high lanes (multi-day bands + event/task chips) a day
 * cell of the private-mode month calendar can show.
 *
 * By design a day shows up to 5 lanes — on PC 4 in a 6-week month — a
 * holiday/commemorative-day label taking one of them. But the rows
 * are as tall as the screen allows, so on a short window fewer lanes really
 * fit — and a chip that doesn't fit used to be clipped silently, without
 * being counted in "+n". The capacity is therefore the design number, capped
 * by what the row's height actually holds.
 */

export function designLanes(weekRows: number, hasDayLabel: boolean, wide = true) {
  // Phones: 5 whatever the month — the row height alone decides (the "+n"
  // tag lies over the last chip, so it needs no lane of its own).
  return (wide && weekRows >= 6 ? 4 : 5) - (hasDayLabel ? 1 : 0);
}

// Cell geometry (PrivateCalendar's DayCell), in px — as it was before the
// date row became 20px and the bottom padding 0, so this estimate stays a
// few px on the safe side (the shown chips are counted from the real layout):
//   1 bottom border + 2 top padding + 24 day header + 2 gap + 2 bottom padding
//   + 2 margin above the first band when there are bands — counted always, to
//   stay on the safe side — then one 17px lane per band/chip, 2px apart.
//   A day label line takes 2 + 10.
const CELL_FIXED = 1 + 2 + 24 + 2 + 2 + 2;
const DAY_LABEL = 12;
const LANE_H = 17;
const LANE_GAP = 2;

/** Lanes that physically fit in a row `rowHeightPx` tall (null: not measured yet — no cap). */
export function lanesThatFit(rowHeightPx: number | null, hasDayLabel: boolean) {
  if (rowHeightPx == null) return Infinity;
  const room = rowHeightPx - CELL_FIXED - (hasDayLabel ? DAY_LABEL : 0);
  // n lanes take n * 17 + (n - 1) * 2 px.
  return Math.max(0, Math.floor((room + LANE_GAP) / (LANE_H + LANE_GAP)));
}

export function cellLaneCapacity(weekRows: number, hasDayLabel: boolean, rowHeightPx: number | null, wide = true) {
  return Math.min(designLanes(weekRows, hasDayLabel, wide), lanesThatFit(rowHeightPx, hasDayLabel));
}

/**
 * Chips (17px, 2px apart) that fit in the cell's chip area as rendered — its
 * measured height, below the date row, band lanes and day label. null: not
 * measured yet (no cap).
 */
export function chipsThatFitIn(chipAreaHeightPx: number | null) {
  if (chipAreaHeightPx == null) return Infinity;
  return Math.max(0, Math.floor((chipAreaHeightPx + LANE_GAP) / (LANE_H + LANE_GAP)));
}

/**
 * What a day cell shows: the first `shown` chips, and "+hidden" for the rest
 * (incl. bands that didn't fit). `capacity` is the day's lane limit (bands +
 * chips); `measuredFit` (chipsThatFitIn of the real chip area), when known,
 * caps the chips too — so a chip is never drawn half-clipped, and never left
 * out while there is room for it.
 */
export function dayCellPreview(
  chipCount: number,
  bandLanes: number,
  hiddenBands: number,
  capacity: number,
  measuredFit = Infinity,
) {
  const shown = Math.min(chipCount, Math.max(0, capacity - bandLanes), measuredFit);
  return { shown, hidden: chipCount - shown + hiddenBands };
}
