import moment from 'moment';
import {
  allDayEntriesOn,
  calendarTimeLabel,
  CalendarEntry,
  normalizeCalendarFeed,
  timedCalendarOccurrences,
} from '../../src/util/calendarEntries';

// Local times, as the Mac's calendar helper sends them (ISO with the offset).
const at = (date: string, time: string) => moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm').format();
const timed = (id: string, start: string, end: string, extra = {}): CalendarEntry => ({
  id,
  calendarId: 'work',
  title: id,
  location: '',
  start,
  end,
  allDay: false,
  busy: true,
  ...extra,
});
const allDay = (id: string, start: string, end: string): CalendarEntry => ({
  ...timed(id, start, end),
  allDay: true,
});
const minutes = (occurrence: { startMinute: number; endMinute: number }) => [
  occurrence.startMinute,
  occurrence.endMinute,
];

describe('what the Mac sends', () => {
  test('is read safely', () => {
    const feed = normalizeCalendarFeed({
      status: 'granted',
      from: '2026-11-01',
      to: 'later',
      calendars: [{ id: 'work', title: 'Work', color: '#FF8800' }, { title: 'no id' }],
      events: [
        timed('ok', at('2026-11-18', '09:00'), at('2026-11-18', '10:00')),
        timed('bad time', 'soon', at('2026-11-18', '10:00')),
        allDay('backwards', '2026-11-19', '2026-11-18'),
        { title: 'no id' },
      ],
    });
    expect(feed.status).toBe('granted');
    expect(feed.from).toBe('2026-11-01');
    expect(feed.to).toBe('');
    expect(feed.calendars).toEqual([{ id: 'work', title: 'Work', color: '#FF8800', source: '' }]);
    expect(feed.events.map(entry => entry.id)).toEqual(['ok']);
  });

  test('anything else means it is still waiting', () => {
    expect(normalizeCalendarFeed(null).status).toBe('waiting');
    expect(normalizeCalendarFeed({ status: 'whatever' }).status).toBe('waiting');
    expect(normalizeCalendarFeed({ status: 'denied' }).status).toBe('denied');
  });
});

describe('timed entries on the calendar', () => {
  test('an entry on one day', () => {
    const [part] = timedCalendarOccurrences(
      [timed('talk', at('2026-11-18', '09:30'), at('2026-11-18', '11:00'))],
      ['2026-11-17', '2026-11-18']
    );
    expect(part.date).toBe('2026-11-18');
    expect(minutes(part)).toEqual([570, 660]);
  });

  test('one over midnight is cut at midnight', () => {
    const parts = timedCalendarOccurrences(
      [timed('flight', at('2026-11-18', '22:00'), at('2026-11-19', '02:30'))],
      ['2026-11-18', '2026-11-19', '2026-11-20']
    );
    expect(parts.map(part => [part.date, ...minutes(part)])).toEqual([
      ['2026-11-18', 1320, 1440],
      ['2026-11-19', 0, 150],
    ]);
  });

  test('one ending at midnight stays on its day', () => {
    const parts = timedCalendarOccurrences(
      [timed('party', at('2026-11-18', '20:00'), at('2026-11-19', '00:00'))],
      ['2026-11-18', '2026-11-19']
    );
    expect(parts.map(part => [part.date, ...minutes(part)])).toEqual([['2026-11-18', 1200, 1440]]);
  });

  test('days in between are full', () => {
    const parts = timedCalendarOccurrences(
      [timed('conference', at('2026-11-17', '09:00'), at('2026-11-19', '17:00'))],
      ['2026-11-18']
    );
    expect(minutes(parts[0])).toEqual([0, 1440]);
  });

  test('an entry without length still shows', () => {
    const [part] = timedCalendarOccurrences(
      [timed('reminder', at('2026-11-18', '08:00'), at('2026-11-18', '08:00'))],
      ['2026-11-18']
    );
    expect(minutes(part)).toEqual([480, 495]);
  });

  test('only the days asked for, and no all-day entries', () => {
    const entries = [
      timed('talk', at('2026-11-18', '09:00'), at('2026-11-18', '10:00')),
      allDay('holiday', '2026-11-18', '2026-11-19'),
    ];
    expect(timedCalendarOccurrences(entries, ['2026-11-17'])).toEqual([]);
    expect(timedCalendarOccurrences(entries, ['2026-11-18']).map(part => part.entry.id)).toEqual([
      'talk',
    ]);
  });

  test('each time a repeating entry happens has its own key', () => {
    const parts = timedCalendarOccurrences(
      [
        timed('standup@1', at('2026-11-18', '09:00'), at('2026-11-18', '09:15')),
        timed('standup@2', at('2026-11-19', '09:00'), at('2026-11-19', '09:15')),
      ],
      ['2026-11-18', '2026-11-19']
    );
    expect(new Set(parts.map(part => part.key)).size).toBe(2);
  });
});

describe('all-day entries', () => {
  const entries = [
    allDay('trip', '2026-11-17', '2026-11-20'),
    allDay('birthday', '2026-11-18', '2026-11-19'),
  ];

  test('on every day they cover, not the day after', () => {
    expect(allDayEntriesOn(entries, '2026-11-16').map(entry => entry.id)).toEqual([]);
    expect(allDayEntriesOn(entries, '2026-11-18').map(entry => entry.id)).toEqual([
      'trip',
      'birthday',
    ]);
    expect(allDayEntriesOn(entries, '2026-11-19').map(entry => entry.id)).toEqual(['trip']);
    expect(allDayEntriesOn(entries, '2026-11-20')).toEqual([]);
  });
});

describe('the time shown', () => {
  test('times on the day, the weekday when it is another day', () => {
    const talk = timed('talk', at('2026-11-18', '09:30'), at('2026-11-18', '11:00'));
    const flight = timed('flight', at('2026-11-18', '22:00'), at('2026-11-19', '02:30'));
    expect(calendarTimeLabel(talk, '2026-11-18')).toBe('09:30–11:00');
    expect(calendarTimeLabel(flight, '2026-11-18')).toBe('22:00–Thu 02:30');
    expect(calendarTimeLabel(flight, '2026-11-19')).toBe('Wed 22:00–02:30');
    expect(calendarTimeLabel(allDay('trip', '2026-11-17', '2026-11-20'), '2026-11-18')).toBe(
      'All day'
    );
  });
});
