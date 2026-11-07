import { GeneratedInvoice } from '../models/generated-invoice.model';
import { Invoice } from '../models/invoice.model';

export interface RecurrencePeriod {
  date: Date;
  periodKey: string;
  overdue: boolean;
}

const MAX_PERIODS = 120;

export function toPeriodKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function toLocalIsoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function occurrenceIn(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(1, day || 1), lastDay));
}

function parseIso(value?: string) {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month) {
    return null;
  }
  return new Date(year, month - 1, day || 1);
}

/**
 * Month (year, monthIndex) where the schedule starts:
 * - the earliest period already generated for the recurrence, so skipped months after it count as pending;
 * - otherwise the first occurrence on or after the recurrence start date (issueDate);
 * - otherwise the current month.
 */
function getStartMonth(recurrence: Invoice, generatedKeys: string[], today: Date) {
  if (generatedKeys.length) {
    const [year, month] = [...generatedKeys].sort()[0].split('-').map(Number);
    return { year, month: month - 1 };
  }

  const start = parseIso(recurrence.issueDate);
  if (!start) {
    return { year: today.getFullYear(), month: today.getMonth() };
  }

  const firstOccurrence = occurrenceIn(start.getFullYear(), start.getMonth(), recurrence.recurringDay);
  if (firstOccurrence.getTime() < start.getTime()) {
    return { year: start.getFullYear(), month: start.getMonth() + 1 };
  }
  return { year: start.getFullYear(), month: start.getMonth() };
}

/**
 * Returns every period that is due (date <= today) and not generated yet, oldest first,
 * plus the next future period that is not generated.
 */
export function getRecurrenceSchedule(
  recurrence: Invoice,
  generatedInvoices: GeneratedInvoice[],
  today = new Date(),
) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const generatedKeys = generatedInvoices
    .filter((item) => item.recurrenceId === recurrence.id && item.periodKey)
    .map((item) => item.periodKey);
  const generatedSet = new Set(generatedKeys);

  // A manual invoice for the same client covers every period up to its issue date
  // (e.g. months billed by hand after being missed), so they are not shown as pending.
  const coveredUntil = generatedInvoices
    .filter((item) => item.isManual && item.clientId === recurrence.clientId)
    .map((item) => parseIso(item.issueDate)?.getTime() ?? 0)
    .reduce((max, value) => Math.max(max, value), 0);

  const start = getStartMonth(recurrence, generatedKeys, todayStart);
  const pending: RecurrencePeriod[] = [];
  let next: RecurrencePeriod | null = null;

  for (let offset = 0; offset < MAX_PERIODS * 2; offset++) {
    const date = occurrenceIn(start.year, start.month + offset, recurrence.recurringDay);
    const periodKey = toPeriodKey(date);
    if (generatedSet.has(periodKey) || date.getTime() <= coveredUntil) {
      continue;
    }

    if (date.getTime() <= todayStart.getTime()) {
      pending.push({ date, periodKey, overdue: date.getTime() < todayStart.getTime() });
      continue;
    }

    next = { date, periodKey, overdue: false };
    break;
  }

  return { pending, next };
}

/** Oldest pending period, or the next upcoming one when everything is up to date. */
export function getNextRecurrencePeriod(
  recurrence: Invoice,
  generatedInvoices: GeneratedInvoice[],
  today = new Date(),
) {
  const { pending, next } = getRecurrenceSchedule(recurrence, generatedInvoices, today);
  return pending[0] ?? next;
}
