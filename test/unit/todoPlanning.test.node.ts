import type { TimeBlock } from '../../src/util/calendarBlocks';
import {
  firstFreeSlot,
  nextFreeSlot,
  nextScheduled,
  normalizePlannableTodos,
  planCategories,
  PLANNING_DAY_START,
  scheduledLabel,
  slotSearchStart,
  todoBlockType,
} from '../../src/util/todoPlanning';

const todo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  projectId: '',
  area: 'work',
  dueDate: '',
  dueTime: '',
  completed: false,
  ...extra,
});
const project = (id: string, name: string) => ({
  id,
  name,
  color: '#123456',
  createdAt: '',
  updatedAt: '',
});
const busy = (start: string, end: string) => {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return { startMinute: minutes(start), endMinute: minutes(end) };
};
const at = (time: string) => busy(time, time).startMinute;

describe('categories of todos to plan', () => {
  const todos = [
    todo('paper', { projectId: 'research', dueDate: '2026-11-20' }),
    todo('slides', { projectId: 'research', dueDate: '2026-11-16', dueTime: '09:00' }),
    todo('groceries', { area: 'home' }),
    todo('old', { projectId: 'gone' }),
    todo('done', { projectId: 'research', completed: true }),
  ];
  const projects = [project('research', 'Research'), project('empty', 'Empty')];
  const ids = (category: { todos: { id: string }[] }) => category.todos.map(item => item.id);

  test("today's plan, all, each project with open todos, then the inbox", () => {
    const categories = planCategories(todos, projects, null, '2026-11-15');
    expect(categories.map(category => category.label)).toEqual([
      "Today's plan",
      'All',
      'Research',
      'Inbox',
    ]);
  });

  test('done todos are left out and due ones come first', () => {
    const [, all, research, inbox] = planCategories(todos, projects, null, '2026-11-15');
    expect(ids(all)).toEqual(['slides', 'paper', 'groceries', 'old']);
    expect(ids(research)).toEqual(['slides', 'paper']);
    expect(ids(inbox)).toEqual(['groceries', 'old']); // "gone" is no known project
  });

  test("today's plan keeps its order, but only for today", () => {
    const plan = { date: '2026-11-15', todoIds: ['groceries', 'paper', 'done', 'missing'] };
    expect(ids(planCategories(todos, projects, plan, '2026-11-15')[0])).toEqual([
      'groceries',
      'paper',
    ]);
    expect(ids(planCategories(todos, projects, plan, '2026-11-16')[0])).toEqual([]);
  });

  test('stored todos are read safely', () => {
    expect(normalizePlannableTodos([{ id: 'a', title: 'A' }, { title: 'no id' }, null])).toEqual([
      todo('a', { title: 'A' }),
    ]);
  });
});

describe('the block a todo becomes', () => {
  test('work stays work, admin is email and admin, the rest is life', () => {
    expect(todoBlockType('work')).toBe('work');
    expect(todoBlockType('')).toBe('work');
    expect(todoBlockType('admin')).toBe('email-admin');
    expect(todoBlockType('health')).toBe('life');
    expect(todoBlockType('home')).toBe('life');
  });
});

describe('the next free slot', () => {
  test('an empty day starts where the search starts', () => {
    expect(nextFreeSlot([], at('09:00'))).toBe(at('09:00'));
  });

  test('it skips what is booked, also several ranges in a row', () => {
    const day = [busy('09:00', '10:00'), busy('10:00', '11:30'), busy('13:00', '14:00')];
    expect(nextFreeSlot(day, at('09:00'))).toBe(at('11:30'));
  });

  test('a gap too short for an hour is skipped', () => {
    const day = [busy('09:00', '10:00'), busy('10:30', '12:00')];
    expect(nextFreeSlot(day, at('09:00'))).toBe(at('12:00'));
  });

  test('a range that started before the search still counts', () => {
    expect(nextFreeSlot([busy('08:30', '09:45')], at('09:00'))).toBe(at('09:45'));
  });

  test('ranges out of order are handled', () => {
    expect(nextFreeSlot([busy('10:00', '11:00'), busy('09:00', '10:00')], at('09:00'))).toBe(
      at('11:00')
    );
  });

  test('a full day has no slot', () => {
    expect(nextFreeSlot([busy('08:00', '22:00')], at('08:00'))).toBeNull();
    expect(nextFreeSlot([], at('21:30'))).toBeNull();
  });

  test('today starts from now, rounded up; other days from the morning', () => {
    expect(slotSearchStart('2026-11-15', '2026-11-15', at('10:07'))).toBe(at('10:15'));
    expect(slotSearchStart('2026-11-15', '2026-11-15', at('06:00'))).toBe(PLANNING_DAY_START);
    expect(slotSearchStart('2026-11-16', '2026-11-15', at('10:07'))).toBe(PLANNING_DAY_START);
  });
});

describe('the first free hour over the next days', () => {
  // Sunday 2026-11-15, Monday the 16th.
  const free = (overrides = {}) =>
    firstFreeSlot({
      from: '2026-11-15',
      todayKey: '2026-11-15',
      nowMinute: at('10:00'),
      busyOn: () => [],
      ...overrides,
    });

  test('today, from now on', () => {
    expect(free()).toEqual({ date: '2026-11-15', startMinute: at('10:00') });
  });

  test('late in the evening it is the next morning', () => {
    expect(free({ nowMinute: at('21:56') })).toEqual({
      date: '2026-11-16',
      startMinute: PLANNING_DAY_START,
    });
  });

  test('a full day is skipped', () => {
    const busyOn = (date: string) => (date === '2026-11-16' ? [busy('08:00', '22:00')] : []);
    expect(free({ from: '2026-11-16', busyOn })).toEqual({
      date: '2026-11-17',
      startMinute: PLANNING_DAY_START,
    });
  });

  test('days to skip are left out', () => {
    expect(free({ skipDay: (date: string) => date === '2026-11-15' })?.date).toBe('2026-11-16');
  });

  test('never before today, even when looking at an earlier week', () => {
    expect(free({ from: '2026-11-09' })).toEqual({ date: '2026-11-15', startMinute: at('10:00') });
  });

  test('a later week starts on its first day, in the morning', () => {
    expect(free({ from: '2026-11-23' })).toEqual({
      date: '2026-11-23',
      startMinute: PLANNING_DAY_START,
    });
  });

  test('nothing free at all', () => {
    expect(free({ busyOn: () => [busy('00:00', '24:00')], days: 3 })).toBeNull();
  });
});

describe('when a todo is on the calendar', () => {
  const block = (date: string, start: string, todoId = 'paper') =>
    ({ id: date + start, date, start, todoId } as TimeBlock);

  test('the next one from today on', () => {
    const blocks = [
      block('2026-11-10', '09:00'),
      block('2026-11-17', '14:00'),
      block('2026-11-16', '10:00'),
      block('2026-11-15', '08:00', 'other'),
    ];
    expect(nextScheduled(blocks, 'paper', '2026-11-15')).toEqual({
      date: '2026-11-16',
      start: '10:00',
    });
    expect(nextScheduled(blocks, 'nothing', '2026-11-15')).toBeNull();
  });

  test('as a short label', () => {
    expect(scheduledLabel({ date: '2026-11-15', start: '10:00' }, '2026-11-15')).toBe(
      'Today 10:00'
    );
    expect(scheduledLabel({ date: '2026-11-16', start: '10:00' }, '2026-11-15')).toBe(
      'Tomorrow 10:00'
    );
    expect(scheduledLabel({ date: '2026-11-18', start: '09:30' }, '2026-11-15')).toBe('Wed 09:30');
    expect(scheduledLabel({ date: '2026-12-01', start: '09:30' }, '2026-11-15')).toBe(
      'Dec 1 09:30'
    );
  });
});
