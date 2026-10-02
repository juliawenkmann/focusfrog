import {
  dueFrogReminder,
  freshFrogReminderHistory,
  frogPlanDate,
} from '../../src/util/frogReminders';

describe('frog reminders', () => {
  test('uses the 6am plan-day rollover', () => {
    expect(frogPlanDate(new Date(2026, 6, 30, 5, 59))).toBe('2026-07-29');
    expect(frogPlanDate(new Date(2026, 6, 30, 6, 0))).toBe('2026-07-30');
  });

  test('selects only the latest reminder slot that is due', () => {
    const now = new Date(2026, 6, 30, 16, 25);
    const history = freshFrogReminderHistory(now);

    expect(dueFrogReminder(now, history)?.id).toBe('16:00');
  });

  test('does not backfill older slots after the latest one was shown', () => {
    const now = new Date(2026, 6, 30, 16, 25);
    const history = {
      ...freshFrogReminderHistory(now),
      shownSlots: ['16:00'],
    };

    expect(dueFrogReminder(now, history)).toBeNull();
  });

  test('brings a snoozed frog back when the snooze expires', () => {
    const now = new Date(2026, 6, 30, 16, 25);
    const history = {
      ...freshFrogReminderHistory(now),
      shownSlots: ['16:00'],
      snoozedUntil: now.getTime() - 1,
    };

    expect(dueFrogReminder(now, history)?.id).toBe('snoozed');
  });

  test('keeps a reminder hidden while it is snoozed', () => {
    const now = new Date(2026, 6, 30, 16, 25);
    const history = {
      ...freshFrogReminderHistory(now),
      shownSlots: ['16:00'],
      snoozedUntil: now.getTime() + 30 * 60 * 1000,
    };

    expect(dueFrogReminder(now, history)).toBeNull();
  });
});
