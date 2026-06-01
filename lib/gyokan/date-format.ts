/** Normalize case deadline from date input (YYYY-MM-DD) to stored format (YYYY/MM/DD). */
export function parseCaseDeadlineInput(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return "";
  return `${y}/${m}/${d}`;
}

/** Normalize stored deadline to date input value. */
export function formatCaseDeadlineForInput(deadline: string) {
  if (!deadline) return "";
  return deadline.replace(/\./g, "-").replace(/\//g, "-");
}
