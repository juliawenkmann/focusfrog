// Planning todos into the Time blocking calendar: which todos to offer, in which
// categories, and where a new block fits. Pure functions, so they can be tested alone.
import moment from 'moment';
import type { TimeBlock, TimeBlockType } from '~/util/calendarBlocks';
import type { TodoProject } from '~/util/todoProjects';
import { INBOX_PROJECT_COLOR } from '~/util/todoProjects';

// The fields of a todo the calendar needs (todos are kept by the Todos page).
export interface PlannableTodo {
  id: string;
  title: string;
  projectId: string;
  area: string;
  dueDate: string;
  dueTime: string;
  completed: boolean;
}

export interface DayPlan {
  date: string;
  todoIds: string[];
}

export interface PlanCategory {
  id: string;
  label: string;
  color: string;
  todos: PlannableTodo[];
}

// A todo becomes an hour on the calendar; drag its edge to change that.
export const TODO_BLOCK_MINUTES = 60;
// Without a time of day to start from, free slots are looked for from here.
export const PLANNING_DAY_START = 8 * 60;
export const PLANNING_DAY_END = 22 * 60;
const STEP = 15;

export function normalizePlannableTodos(value: unknown): PlannableTodo[] {
  return (Array.isArray(value) ? value : [])
    .filter(todo => todo && typeof todo.id === 'string' && typeof todo.title === 'string')
    .map(todo => ({
      id: todo.id,
      title: todo.title,
      projectId: typeof todo.projectId === 'string' ? todo.projectId : '',
      area: typeof todo.area === 'string' ? todo.area : 'work',
      dueDate: typeof todo.dueDate === 'string' ? todo.dueDate : '',
      dueTime: typeof todo.dueTime === 'string' ? todo.dueTime : '',
      completed: Boolean(todo.completed),
    }));
}

// Work stays work, admin is email and admin, everything else is life.
export function todoBlockType(area: string): TimeBlockType {
  if (area === 'admin') return 'email-admin';
  return !area || area === 'work' ? 'work' : 'life';
}

// Due first (soonest first), then the rest, each by title.
function byDue(a: PlannableTodo, b: PlannableTodo): number {
  if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
  const due = (todo: PlannableTodo) => `${todo.dueDate} ${todo.dueTime || '99:99'}`;
  return due(a).localeCompare(due(b)) || a.title.localeCompare(b.title);
}

// Today's plan, all open todos, then one category per project that has open todos, and
// the Inbox for todos without a (known) project. Done todos are left out.
export function planCategories(
  todos: PlannableTodo[],
  projects: TodoProject[],
  dayPlan: DayPlan | null,
  todayKey: string
): PlanCategory[] {
  const openTodos = todos.filter(todo => !todo.completed).sort(byDue);
  const byId = new Map(openTodos.map(todo => [todo.id, todo]));
  const planned =
    dayPlan && dayPlan.date === todayKey
      ? dayPlan.todoIds.map(id => byId.get(id)).filter((todo): todo is PlannableTodo => !!todo)
      : [];
  const known = new Set(projects.map(project => project.id));
  const categories: PlanCategory[] = [
    { id: 'plan', label: "Today's plan", color: '#10b981', todos: planned },
    { id: 'all', label: 'All', color: '#64748b', todos: openTodos },
  ];
  projects.forEach(project => {
    const inProject = openTodos.filter(todo => todo.projectId === project.id);
    if (inProject.length) {
      categories.push({
        id: project.id,
        label: project.name,
        color: project.color,
        todos: inProject,
      });
    }
  });
  const inbox = openTodos.filter(todo => !known.has(todo.projectId));
  if (inbox.length) {
    categories.push({ id: 'inbox', label: 'Inbox', color: INBOX_PROJECT_COLOR, todos: inbox });
  }
  return categories;
}

// Where looking for a free slot starts: now (rounded up to a quarter hour) on today,
// otherwise the start of the planning day.
export function slotSearchStart(date: string, todayKey: string, nowMinute: number): number {
  if (date !== todayKey) return PLANNING_DAY_START;
  return Math.max(PLANNING_DAY_START, Math.ceil(nowMinute / STEP) * STEP);
}

type BusyRange = { startMinute: number; endMinute: number };

// The first start from `from` at which `duration` minutes fit between the busy ranges,
// ending by `until`; null when the day is full.
export function nextFreeSlot(
  busy: BusyRange[],
  from: number,
  duration = TODO_BLOCK_MINUTES,
  until = PLANNING_DAY_END
): number | null {
  let cursor = from;
  [...busy]
    .sort((a, b) => a.startMinute - b.startMinute)
    .forEach(range => {
      if (range.endMinute <= cursor || range.startMinute >= cursor + duration) return;
      cursor = Math.ceil(range.endMinute / STEP) * STEP;
    });
  // A later range may still overlap after the cursor moved: check again from there.
  const overlaps = busy.some(
    range => range.startMinute < cursor + duration && range.endMinute > cursor
  );
  if (overlaps) return nextFreeSlot(busy, cursor, duration, until);
  return cursor + duration <= until ? cursor : null;
}

// The first free hour from `from` on, looking up to `days` days ahead and never before
// today: today from now on, later days from the morning. Days `skipDay` says no to are left
// out (the weekend and Feiertage for work).
export function firstFreeSlot(options: {
  from: string;
  todayKey: string;
  nowMinute: number;
  busyOn: (date: string) => BusyRange[];
  skipDay?: (date: string) => boolean;
  days?: number;
}): { date: string; startMinute: number } | null {
  const { todayKey, nowMinute, busyOn, skipDay = () => false, days = 14 } = options;
  const first = moment(options.from > todayKey ? options.from : todayKey, 'YYYY-MM-DD');
  for (let offset = 0; offset < days; offset++) {
    const date = first.clone().add(offset, 'days').format('YYYY-MM-DD');
    if (skipDay(date)) continue;
    const start = nextFreeSlot(busyOn(date), slotSearchStart(date, todayKey, nowMinute));
    if (start !== null) return { date, startMinute: start };
  }
  return null;
}

// When a todo is next on the calendar (today or later), for a small label on its card.
export function nextScheduled(
  blocks: TimeBlock[],
  todoId: string,
  todayKey: string
): { date: string; start: string } | null {
  const upcoming = blocks
    .filter(block => block.todoId === todoId && block.date >= todayKey)
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  return upcoming.length ? { date: upcoming[0].date, start: upcoming[0].start } : null;
}

export function scheduledLabel(slot: { date: string; start: string }, todayKey: string): string {
  const day = moment(slot.date, 'YYYY-MM-DD');
  const today = moment(todayKey, 'YYYY-MM-DD');
  const diff = day.diff(today, 'days');
  const when =
    diff === 0
      ? 'Today'
      : diff === 1
      ? 'Tomorrow'
      : diff < 7
      ? day.format('ddd')
      : day.format('MMM D');
  return `${when} ${slot.start}`;
}
