export interface FrogReminderSlot {
  id: string;
  minuteOfDay: number;
  heading: string;
}

export interface FrogReminderHistory {
  date: string;
  shownSlots: string[];
  snoozedUntil?: number;
}

export const FROG_REMINDER_SLOTS: FrogReminderSlot[] = [
  { id: '10:00', minuteOfDay: 10 * 60, heading: 'Morning frog check' },
  { id: '13:00', minuteOfDay: 13 * 60, heading: 'Your frog is still waiting' },
  { id: '16:00', minuteOfDay: 16 * 60, heading: 'Afternoon frog nudge' },
  { id: '19:00', minuteOfDay: 19 * 60, heading: 'One last hop for today' },
];

const DAY_PLAN_ROLLOVER_HOUR = 6;

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function frogPlanDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - DAY_PLAN_ROLLOVER_HOUR);
  return localDateKey(shifted);
}

export function freshFrogReminderHistory(now: Date = new Date()): FrogReminderHistory {
  return {
    date: frogPlanDate(now),
    shownSlots: [],
  };
}

export function dueFrogReminder(
  now: Date,
  reminderHistory: FrogReminderHistory
): FrogReminderSlot | null {
  if (reminderHistory.date !== frogPlanDate(now)) {
    return null;
  }

  if (reminderHistory.snoozedUntil) {
    if (reminderHistory.snoozedUntil > now.getTime()) return null;
    return {
      id: 'snoozed',
      minuteOfDay: now.getHours() * 60 + now.getMinutes(),
      heading: 'Your frog hopped back',
    };
  }

  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const latestSlot = [...FROG_REMINDER_SLOTS]
    .reverse()
    .find(slot => slot.minuteOfDay <= minuteOfDay);

  if (!latestSlot || reminderHistory.shownSlots.includes(latestSlot.id)) {
    return null;
  }

  return latestSlot;
}
