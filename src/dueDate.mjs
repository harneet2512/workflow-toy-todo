// The one place that decides what a todo due date may be.
// Pure: nothing is mutated, every result is a fresh value, either { dueDate } or { error }.
// A due date is a calendar day written YYYY-MM-DD, not an instant.
export const DUE_DATE_ERROR = 'dueDate must be a valid date in YYYY-MM-DD format';

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/; // \d is ASCII-only without the u flag; $ refuses a trailing newline
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year, month) => (month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]);

// Explicit calendar arithmetic on purpose: Date.parse rolls 2026-02-30 into March and
// Date.UTC maps years 0 to 99 to 1900 to 1999.
function isRealDay(raw) {
  const match = SHAPE.exec(raw);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

// null means "no date". undefined is an error: callers decide "absent" with `=== undefined`.
export function normalizeDueDate(raw) {
  if (raw === null) return { dueDate: null };
  if (typeof raw === 'string' && isRealDay(raw)) return { dueDate: raw };
  return { error: DUE_DATE_ERROR };
}
