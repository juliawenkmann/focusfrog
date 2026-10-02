export interface TodoProject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export const TODO_PROJECT_COLORS = [
  '#10b981',
  '#ec4899',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#ef4444',
  '#f97316',
  '#84cc16',
  '#64748b',
] as const;

export const INBOX_PROJECT_COLOR = '#94a3b8';

export function cleanProjectName(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeTodoProject(value: unknown): TodoProject | null {
  if (!value || typeof value !== 'object') return null;
  const project = value as Partial<TodoProject>;
  const id = typeof project.id === 'string' ? project.id.trim() : '';
  const name = cleanProjectName(project.name);
  if (!id || !name) return null;

  const color = isProjectColor(project.color) ? project.color : TODO_PROJECT_COLORS[0];
  const createdAt = typeof project.createdAt === 'string' ? project.createdAt : '';
  const updatedAt = typeof project.updatedAt === 'string' ? project.updatedAt : createdAt;

  return { id, name, color, createdAt, updatedAt };
}

export function normalizeTodoProjects(values: unknown): TodoProject[] {
  if (!Array.isArray(values)) return [];
  const byId = new Map<string, TodoProject>();
  values.forEach(value => {
    const project = normalizeTodoProject(value);
    if (project) byId.set(project.id, project);
  });
  return Array.from(byId.values());
}

export function mergeTodoProjects(
  localProjects: TodoProject[],
  serverProjects: TodoProject[]
): TodoProject[] {
  const byId = new Map<string, TodoProject>();
  [...serverProjects, ...localProjects].forEach(value => {
    const project = normalizeTodoProject(value);
    if (!project) return;
    const existing = byId.get(project.id);
    const projectTime = Date.parse(project.updatedAt || project.createdAt || '') || 0;
    const existingTime = existing
      ? Date.parse(existing.updatedAt || existing.createdAt || '') || 0
      : -1;
    if (!existing || projectTime >= existingTime) byId.set(project.id, project);
  });

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function findProjectByName(projects: TodoProject[], name: unknown): TodoProject | undefined {
  const cleanedName = cleanProjectName(name).toLocaleLowerCase();
  if (!cleanedName) return undefined;
  return projects.find(project => project.name.toLocaleLowerCase() === cleanedName);
}

export function isProjectColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
}

export function nextProjectColor(projects: TodoProject[]): string {
  const used = new Set(projects.map(project => project.color.toLowerCase()));
  const unused = TODO_PROJECT_COLORS.find(color => !used.has(color));
  return unused || TODO_PROJECT_COLORS[projects.length % TODO_PROJECT_COLORS.length];
}

export function projectTint(color: string, alpha: number): string {
  const hex = isProjectColor(color) ? color : INBOX_PROJECT_COLOR;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export interface ProjectShare {
  id: string;
  name: string;
  color: string;
  count: number;
}

// Splits todos into per-project groups (Inbox last) for color legends and filters.
export function projectShares(
  projects: TodoProject[],
  todos: Array<{ projectId: string }>
): ProjectShare[] {
  const counts = new Map<string, number>();
  todos.forEach(todo => {
    const key = projects.some(project => project.id === todo.projectId) ? todo.projectId : '';
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const shares: ProjectShare[] = projects
    .filter(project => counts.has(project.id))
    .map(project => ({
      id: project.id,
      name: project.name,
      color: project.color,
      count: counts.get(project.id) || 0,
    }));
  if (counts.has('')) {
    shares.push({
      id: 'inbox',
      name: 'Inbox',
      color: INBOX_PROJECT_COLOR,
      count: counts.get('') || 0,
    });
  }
  return shares;
}
