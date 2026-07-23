export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTodayKey(): string {
  return toDateKey(new Date());
}

const DAY_CUTOFF_HOUR = 5;

// 새벽 5시 이전은 전날의 연장으로 취급(밤샘 작업 시 "어제 몫"으로 잡히도록).
function getEffectiveDate(): Date {
  const now = new Date();
  if (now.getHours() < DAY_CUTOFF_HOUR) {
    now.setDate(now.getDate() - 1);
  }
  return now;
}

export function getEffectiveTodayKey(): string {
  return toDateKey(getEffectiveDate());
}

export function getEffectiveYesterdayKey(): string {
  const d = getEffectiveDate();
  d.setDate(d.getDate() - 1);
  return toDateKey(d);
}

export function getEffectiveWeekStartKey(): string {
  const d = getEffectiveDate();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return toDateKey(d);
}

export type MonthGridCell = { date: Date; inMonth: boolean };

export function getMonthGrid(year: number, month: number): MonthGridCell[] {
  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: MonthGridCell[] = [];
  for (let i = startWeekday; i > 0; i--) {
    cells.push({ date: new Date(year, month - 1, 1 - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

export function chunkIntoWeeks<T>(cells: T[]): T[][] {
  const weeks: T[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}