import moment from 'moment';

export type TimeBlockType = 'work' | 'deep-work' | 'email-admin' | 'life' | 'break';
export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';

export interface TimeBlock {
  id: string;
  title: string;
  type: TimeBlockType;
  date: string;
  start: string;
  end: string;
  notes: string;
  repeat: RepeatRule;
  // ISO weekdays (1 = Monday ... 7 = Sunday) for weekly and biweekly repeats.
  repeatDays: number[];
  repeatUntil: string;
  // Dates of single occurrences that were removed from a repeating block.
  skipDates: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BlockOccurrence {
  key: string;
  block: TimeBlock;
  date: string;
  startMinute: number;
  endMinute: number;
}

export interface PositionedOccurrence extends BlockOccurrence {
  column: number;
  columns: number;
}

export const DAY_MINUTES = 24 * 60;
export const REPEAT_RULES: RepeatRule[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
];
const DATE_FORMAT = 'YYYY-MM-DD';
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

// 24:00 is allowed as an end time so blocks can run until midnight.
export function endTimeToMinutes(time: string): number {
  return time === '24:00' ? DAY_MINUTES : timeToMinutes(time);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)));
  if (clamped === DAY_MINUTES) return '24:00';
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function isoWeekday(date: string): number {
  return moment(date, DATE_FORMAT).isoWeekday();
}

export function isValidDate(date: unknown): date is string {
  return typeof date === 'string' && moment(date, DATE_FORMAT, true).isValid();
}

function startOfIsoWeek(date: string) {
  return moment(date, DATE_FORMAT).startOf('isoWeek');
}

export function repeatDaysFor(block: Pick<TimeBlock, 'date' | 'repeatDays'>): number[] {
  return block.repeatDays.length > 0 ? block.repeatDays : [isoWeekday(block.date)];
}

export function isRepeating(block: Pick<TimeBlock, 'repeat'>): boolean {
  return block.repeat !== 'none';
}

export function occursOn(block: TimeBlock, date: string): boolean {
  if (date < block.date) return false;
  if (block.repeatUntil && date > block.repeatUntil) return false;
  if (block.skipDates.includes(date)) return false;

  switch (block.repeat) {
    case 'none':
      return date === block.date;
    case 'daily':
      return true;
    case 'weekdays':
      return isoWeekday(date) <= 5;
    case 'weekly':
      return repeatDaysFor(block).includes(isoWeekday(date));
    case 'biweekly': {
      if (!repeatDaysFor(block).includes(isoWeekday(date))) return false;
      const weeks = startOfIsoWeek(date).diff(startOfIsoWeek(block.date), 'weeks');
      return weeks % 2 === 0;
    }
    case 'monthly': {
      const first = moment(block.date, DATE_FORMAT);
      const current = moment(date, DATE_FORMAT);
      // Months without that day (e.g. the 31st) use their last day instead.
      return current.date() === Math.min(first.date(), current.daysInMonth());
    }
    default:
      return false;
  }
}

export function occurrencesForDates(blocks: TimeBlock[], dates: string[]): BlockOccurrence[] {
  const occurrences: BlockOccurrence[] = [];
  dates.forEach(date => {
    blocks.forEach(block => {
      if (!occursOn(block, date)) return;
      occurrences.push({
        key: `${block.id}@${date}`,
        block,
        date,
        startMinute: timeToMinutes(block.start),
        endMinute: endTimeToMinutes(block.end),
      });
    });
  });
  return occurrences;
}

// Places overlapping events of one day side by side, like most calendar apps.
export function layoutDay(occurrences: BlockOccurrence[]): PositionedOccurrence[] {
  const sorted = [...occurrences].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute
  );
  const positioned: PositionedOccurrence[] = [];
  let cluster: PositionedOccurrence[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const closeCluster = () => {
    const columns = Math.max(1, columnEnds.length);
    cluster.forEach(item => {
      item.columns = columns;
    });
    positioned.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  sorted.forEach(occurrence => {
    if (cluster.length > 0 && occurrence.startMinute >= clusterEnd) closeCluster();
    let column = columnEnds.findIndex(end => end <= occurrence.startMinute);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(occurrence.endMinute);
    } else {
      columnEnds[column] = occurrence.endMinute;
    }
    cluster.push({ ...occurrence, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, occurrence.endMinute);
  });
  if (cluster.length > 0) closeCluster();
  return positioned;
}

export function weekdayList(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map(day => WEEKDAY_SHORT[day - 1])
    .join(', ');
}

export function describeRepeat(block: TimeBlock): string {
  let text = '';
  switch (block.repeat) {
    case 'daily':
      text = 'Every day';
      break;
    case 'weekdays':
      text = 'Every weekday';
      break;
    case 'weekly':
      text = `Weekly on ${weekdayList(repeatDaysFor(block))}`;
      break;
    case 'biweekly':
      text = `Every 2 weeks on ${weekdayList(repeatDaysFor(block))}`;
      break;
    case 'monthly':
      text = `Monthly on day ${moment(block.date, DATE_FORMAT).date()}`;
      break;
    default:
      return '';
  }
  if (block.repeatUntil) {
    text += ` until ${moment(block.repeatUntil, DATE_FORMAT).format('MMM D')}`;
  }
  return text;
}

// Moving a whole series to another day shifts its start date and repeat weekdays together.
export function shiftSeries(
  block: TimeBlock,
  dayDelta: number
): Pick<TimeBlock, 'date' | 'repeatDays'> {
  const date = moment(block.date, DATE_FORMAT).add(dayDelta, 'days').format(DATE_FORMAT);
  const repeatDays = block.repeatDays.map(day => ((((day - 1 + dayDelta) % 7) + 7) % 7) + 1);
  return { date, repeatDays: Array.from(new Set(repeatDays)).sort((a, b) => a - b) };
}
