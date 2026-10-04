import { arrayMove } from "@dnd-kit/sortable";

type Identified = { id: string };

/**
 * Writes `nextVisible` back over the slots that `visible` occupied inside
 * `all`, so items outside the visible slice keep their position — and with it
 * the sort_order the backend derives from that position.
 *
 * An item pulled into the slice from elsewhere in `all` is removed from its old
 * position, and a slice that grew spills its surplus onto the end of the list.
 */
export function applyVisibleOrder<T extends Identified>(
  all: T[],
  visible: T[],
  nextVisible: T[],
): T[] {
  const visibleIds = new Set(visible.map((item) => item.id));
  const nextIds = new Set(nextVisible.map((item) => item.id));
  const result: T[] = [];
  let nextIdx = 0;

  for (const item of all) {
    if (visibleIds.has(item.id)) {
      if (nextIdx < nextVisible.length) result.push(nextVisible[nextIdx++]!);
      continue;
    }
    if (nextIds.has(item.id)) continue;
    result.push(item);
  }
  while (nextIdx < nextVisible.length) result.push(nextVisible[nextIdx++]!);

  return result;
}

/**
 * Moves the item `id` to `index` within the visible slice, leaving the rest of
 * `all` alone. `visible` must be in the order the list is *rendered* in — a
 * drop index refers to what the user saw.
 */
export function moveWithinVisible<T extends Identified>(
  all: T[],
  visible: T[],
  id: string,
  index: number,
): T[] {
  const oldIndex = visible.findIndex((item) => item.id === id);
  if (oldIndex === -1 || index < 0 || index >= visible.length || index === oldIndex) {
    return all;
  }
  return applyVisibleOrder(all, visible, arrayMove(visible, oldIndex, index));
}

/** Moves the item dragged from `activeId` onto `overId`'s slot (dnd-kit's drop semantics). */
export function reorderWithinVisible<T extends Identified>(
  all: T[],
  visible: T[],
  activeId: string,
  overId: string,
): T[] {
  const newIndex = visible.findIndex((item) => item.id === overId);
  if (newIndex === -1) return all;
  return moveWithinVisible(all, visible, activeId, newIndex);
}

/**
 * Splices the item `id` out of wherever it sits in `all` and into `visible` at
 * `index`, passing it through `transform` on the way (used to retag a task as
 * belonging to the list it was dropped into).
 */
export function insertIntoVisible<T extends Identified>(
  all: T[],
  id: string,
  visible: T[],
  index: number,
  transform: (item: T) => T,
): T[] {
  const moving = all.find((item) => item.id === id);
  if (!moving) return all;

  const nextVisible = [...visible];
  nextVisible.splice(Math.max(0, Math.min(index, visible.length)), 0, transform(moving));
  return applyVisibleOrder(all, visible, nextVisible);
}
