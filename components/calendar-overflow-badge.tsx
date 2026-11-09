/**
 * The phone month calendars' "+n" — how many of a day's items didn't fit:
 * a small dark rounded tag with white text, laid over the right end of the
 * last visible chip (or the cell's bottom right when no chip shows). It
 * takes no room of its own. Shared by tasks mode's and private mode's month
 * calendars; `className` places it.
 */
export function CalendarOverflowBadge({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span className={`rounded-sm bg-gray-800 px-0.5 text-[7px] font-semibold leading-none text-white ${className}`}>
      +{count}
    </span>
  );
}
