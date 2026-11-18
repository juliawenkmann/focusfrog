import {
  cleanProjectName,
  findProjectByName,
  mergeTodoProjects,
  nextProjectColor,
  normalizeTodoProjects,
  projectNamed,
  projectProgressShares,
  projectShares,
  projectTint,
  TodoProject,
  TODO_PROJECT_COLORS,
} from '../../src/util/todoProjects';

const project = (overrides: Partial<TodoProject> = {}): TodoProject => ({
  id: 'project-focusfrog',
  name: 'FocusFrog',
  color: '#10b981',
  createdAt: '2026-08-08T08:00:00.000Z',
  updatedAt: '2026-08-08T08:00:00.000Z',
  ...overrides,
});

describe('todo projects', () => {
  test('a name makes a new project, or picks the one that has it', () => {
    const now = '2026-11-16T09:00:00.000Z';
    const made = projectNamed([project()], '  Thesis ', '#ec4899', now);
    expect(made?.created).toBe(true);
    expect(made?.project).toMatchObject({
      name: 'Thesis',
      color: '#ec4899',
      createdAt: now,
      updatedAt: now,
    });
    expect(made?.project.id).toMatch(/^project-/);

    expect(projectNamed([project()], 'focusfrog', '#ec4899', now)).toEqual({
      project: project(),
      created: false,
    });
    expect(projectNamed([project()], '   ', '#ec4899', now)).toBeNull();
    // A colour that is not one gets the next free colour.
    expect(projectNamed([project()], 'Home', 'red', now)?.project.color).toBe(
      nextProjectColor([project()])
    );
  });

  test('cleans project names for consistent categorization', () => {
    expect(cleanProjectName('  Focus   Frog  ')).toBe('Focus Frog');
  });

  test('normalizes valid projects and rejects incomplete records', () => {
    expect(normalizeTodoProjects([project(), { id: '', name: 'Missing id' }, null])).toEqual([
      project(),
    ]);
  });

  test('uses the newest project record when local and server data overlap', () => {
    const server = project({ name: 'Old name' });
    const local = project({
      name: 'New name',
      updatedAt: '2026-08-08T09:00:00.000Z',
    });

    expect(mergeTodoProjects([local], [server])).toEqual([local]);
  });

  test('matches existing projects without case sensitivity', () => {
    expect(findProjectByName([project()], 'focusfrog')?.id).toBe('project-focusfrog');
  });

  test('picks the first palette color that no project uses yet', () => {
    const used = [
      project({ color: TODO_PROJECT_COLORS[0] }),
      project({ id: 'b', color: '#EC4899' }),
    ];
    expect(nextProjectColor(used)).toBe(TODO_PROJECT_COLORS[2]);
  });

  test('turns project colors into translucent tints', () => {
    expect(projectTint('#10b981', 0.2)).toBe('rgba(16, 185, 129, 0.2)');
    expect(projectTint('not-a-color', 1)).toBe('rgba(148, 163, 184, 1)');
  });

  test('groups todos by project with unknown projects counted as inbox', () => {
    const thesis = project({ id: 'thesis', name: 'Thesis', color: '#3b82f6' });
    const shares = projectShares(
      [project(), thesis],
      [
        { projectId: 'thesis' },
        { projectId: '' },
        { projectId: 'deleted' },
        { projectId: 'thesis' },
      ]
    );
    expect(shares).toEqual([
      { id: 'thesis', name: 'Thesis', color: '#3b82f6', count: 2 },
      { id: 'inbox', name: 'Inbox', color: '#94a3b8', count: 2 },
    ]);
  });

  test('counts done todos per project for the progress line', () => {
    const thesis = project({ id: 'thesis', name: 'Thesis', color: '#3b82f6' });
    const shares = projectProgressShares(
      [project(), thesis],
      [
        { projectId: 'thesis', done: true },
        { projectId: 'thesis', done: false },
        { projectId: 'project-focusfrog', done: false },
        { projectId: 'deleted', done: true },
      ]
    );
    expect(shares).toEqual([
      { id: 'project-focusfrog', name: 'FocusFrog', color: '#10b981', count: 1, done: 0 },
      { id: 'thesis', name: 'Thesis', color: '#3b82f6', count: 2, done: 1 },
      { id: 'inbox', name: 'Inbox', color: '#94a3b8', count: 1, done: 1 },
    ]);
  });
});
