export function todaySPString(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseISODate(value: string): Date {
  return new Date(value + "T00:00:00");
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISODate(value);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfWeekSP(value?: string): string {
  const ref = value ? parseISODate(value) : parseISODate(todaySPString());
  const day = ref.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  ref.setUTCDate(ref.getUTCDate() - mondayOffset);
  return iso(ref);
}

export function startOfMonthSP(value?: string): string {
  const ref = value ? parseISODate(value) : parseISODate(todaySPString());
  return `${ref.toISOString().slice(0, 7)}-01`;
}

export function startOfWeekFor(value: string): string {
  return startOfWeekSP(value);
}

export function endOfWeekFor(value: string): string {
  const ref = parseISODate(value);
  const day = ref.getUTCDay();
  const sundayOffset = (7 - day) % 7;
  ref.setUTCDate(ref.getUTCDate() + sundayOffset);
  return iso(ref);
}

export function startOfMonthFor(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonthFor(value: string): string {
  const [year, month] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month, 0));
  return iso(d);
}

export function startOfYearFor(value: string): string {
  return `${value.slice(0, 4)}-01-01`;
}

export function endOfYearFor(value: string): string {
  return `${value.slice(0, 4)}-12-31`;
}
