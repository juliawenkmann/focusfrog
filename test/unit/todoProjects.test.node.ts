import {
  cleanProjectName,
  findProjectByName,
  mergeTodoProjects,
  nextProjectColor,
  normalizeTodoProjects,
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
});
