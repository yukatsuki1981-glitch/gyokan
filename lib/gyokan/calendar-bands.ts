/**
 * Lays out multi-day items (date-range tasks) as horizontal bands across one
 * calendar week row, stacked into lanes so that no two bands overlap.
 */

export type BandInput<T> = {
  item: T;
  /** Whether the item shows on that ISO date (e.g. a completed range task only shows on its completion day). */
  isVisibleOn: (iso: string) => boolean;
  /** Tie-breaker between otherwise equal bands — lower comes first (higher up). */
  order: number;
};

export type WeekBand<T> = {
  item: T;
  /** First and last column (0 = Sunday) the band covers in this week. */
  startCol: number;
  endCol: number;
  lane: number;
  /** The item also shows on the day before / after this week's segment (it was cut at the week edge). */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type WeekBandLayout<T> = {
  bands: WeekBand<T>[];
  /** Per column: lanes reserved above the day's own content (highest occupied lane + 1, gaps included so lanes line up across the week). */
  lanesUsed: number[];
  /** Per column: bands that didn't fit and are only counted (in the day's "+n"). */
  hiddenCount: number[];
};

function shiftISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}

/**
 * @param weekDays the seven ISO dates of the row, Sunday first
 * @param laneCapacity per column, how many lanes bands may use on that day
 */
export function layoutWeekBands<T>(
  weekDays: string[],
  inputs: BandInput<T>[],
  laneCapacity: number[],
): WeekBandLayout<T> {
  type Segment = Omit<WeekBand<T>, "lane"> & { order: number };
  const segments: Segment[] = [];

  for (const input of inputs) {
    let col = 0;
    while (col < 7) {
      if (!input.isVisibleOn(weekDays[col]!)) {
        col++;
        continue;
      }
      const startCol = col;
      while (col + 1 < 7 && input.isVisibleOn(weekDays[col + 1]!)) col++;
      const endCol = col;
      segments.push({
        item: input.item,
        startCol,
        endCol,
        continuesBefore: startCol === 0 && input.isVisibleOn(shiftISO(weekDays[0]!, -1)),
        continuesAfter: endCol === 6 && input.isVisibleOn(shiftISO(weekDays[6]!, 1)),
        order: input.order,
      });
      col++;
    }
  }

  // Earlier starts first, then longer bands, then the list's own order.
  segments.sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.order - b.order,
  );

  const occupied: boolean[][] = [];
  const bands: WeekBand<T>[] = [];
  const lanesUsed = Array<number>(7).fill(0);
  const hiddenCount = Array<number>(7).fill(0);

  for (const segment of segments) {
    let capacity = Infinity;
    for (let c = segment.startCol; c <= segment.endCol; c++) {
      capacity = Math.min(capacity, laneCapacity[c] ?? 0);
    }

    let lane = 0;
    while (lane < capacity) {
      const row = occupied[lane];
      let free = true;
      for (let c = segment.startCol; c <= segment.endCol && free; c++) {
        if (row?.[c]) free = false;
      }
      if (free) break;
      lane++;
    }

    if (lane >= capacity) {
      for (let c = segment.startCol; c <= segment.endCol; c++) hiddenCount[c]!++;
      continue;
    }

    const row = (occupied[lane] ??= Array<boolean>(7).fill(false));
    for (let c = segment.startCol; c <= segment.endCol; c++) {
      row[c] = true;
      lanesUsed[c] = Math.max(lanesUsed[c]!, lane + 1);
    }
    bands.push({
      item: segment.item,
      startCol: segment.startCol,
      endCol: segment.endCol,
      lane,
      continuesBefore: segment.continuesBefore,
      continuesAfter: segment.continuesAfter,
    });
  }

  return { bands, lanesUsed, hiddenCount };
}
