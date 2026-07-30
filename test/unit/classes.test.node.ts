import * as classes from '~/util/classes';
import { IEvent } from '~/util/interfaces';
import { Category } from '~/util/classes';

const testClasses: Category[] = [
  { name: ['Test', 'Subtest'], rule: { type: 'regex', regex: 'subtest' } },
  { name: ['Test', 'Subtest', 'Subsubtest'], rule: { type: 'regex', regex: 'subsubtest' } },
];

test('correctly builds hierarchy', () => {
  const result = classes.build_category_hierarchy(testClasses);
  expect(result).toHaveLength(1);
  const cat_root = result[0];
  expect(cat_root.subname).toEqual('Test');
  expect(cat_root.children).toHaveLength(1);
  expect(result[0].children[0].children).toHaveLength(1);
});

test('correctly flatten hierarchy', () => {
  const result = classes.flatten_category_hierarchy(classes.build_category_hierarchy(testClasses));
  expect(result).toHaveLength(3);
});

test('matches string to category', () => {
  const cat = classes.matchString('subsubtest', testClasses);
  expect(cat).toEqual(testClasses[1]);
});

test('matches events to category', () => {
  let events: IEvent[] = [
    { timestamp: new Date().toISOString(), duration: 0, data: { title: 'subsubtest' } },
    { timestamp: new Date().toISOString(), duration: 0, data: { title: 'subtest' } },
    { timestamp: new Date().toISOString(), duration: 0, data: { title: 'no matching' } },
  ];
  events = classes.classifyEvents(events, testClasses);
  expect(events[0].data.$category).toEqual(testClasses[1].name);
  expect(events[1].data.$category).toEqual(testClasses[0].name);
  expect(events[2].data.$category).toEqual(['Uncategorized']);
});

test('matches GitHub to programming in default categories', () => {
  expect(classes.matchString('GitHub Desktop', classes.defaultCategories)?.name).toEqual([
    'Work',
    'Programming',
  ]);
  expect(
    classes.matchString('github.com/juliawenkmann/focusfrog', classes.defaultCategories)?.name
  ).toEqual(['Work', 'Programming']);
});

test('matches FocusFrog and FrogFocus to planning in default categories', () => {
  expect(classes.matchString('FocusFrog - Todos', classes.defaultCategories)?.name).toEqual([
    'Work',
    'Planning',
  ]);
  expect(classes.matchString('FrogFocus - Plan day', classes.defaultCategories)?.name).toEqual([
    'Work',
    'Planning',
  ]);
});

test('normalizes legacy programming rules to include GitHub', () => {
  const normalized = classes.normalizeFocusFrogCategories([
    { name: ['Work', 'Programming'], rule: { type: 'regex', regex: 'Codex' } },
  ]);

  expect(normalized[0].rule.regex).toContain('GitHub');
  expect(classes.matchString('github.dev', normalized)?.name).toEqual(['Work', 'Programming']);
  expect(classes.matchString('exercise_10_solution.ipynb', normalized)?.name).toEqual([
    'Work',
    'Programming',
  ]);
});

test('normalizes legacy writing and email rules', () => {
  const normalized = classes.normalizeFocusFrogCategories([
    { name: ['Work', 'Writing'], rule: { type: 'regex', regex: 'Overleaf' } },
    { name: ['Work', 'Email'], rule: { type: 'regex', regex: 'Gmail' } },
  ]);

  expect(classes.matchString('reMarkable - XAI notes', normalized)?.name).toEqual([
    'Work',
    'Writing',
  ]);
  expect(classes.matchString('xai - ifiChat', normalized)?.name).toEqual(['Work', 'Email']);
});

test('matches Claude and ChatGPT to AI chats in default categories', () => {
  expect(classes.matchString('ChatGPT - Google Chrome', classes.defaultCategories)?.name).toEqual([
    'Work',
    'AI Chats',
  ]);
  expect(classes.matchString('claude.ai - Google Chrome', classes.defaultCategories)?.name).toEqual([
    'Work',
    'AI Chats',
  ]);
});

test('adds AI chats when normalizing legacy categories', () => {
  const normalized = classes.normalizeFocusFrogCategories([
    { name: ['Work', 'Programming'], rule: { type: 'regex', regex: 'Codex' } },
  ]);

  expect(classes.matchString('Claude - Google Chrome', normalized)?.name).toEqual([
    'Work',
    'AI Chats',
  ]);
  expect(classes.matchString('chat.openai.com', normalized)?.name).toEqual(['Work', 'AI Chats']);
});

test('adds planning when normalizing legacy categories', () => {
  const normalized = classes.normalizeFocusFrogCategories([
    { name: ['Work', 'Programming'], rule: { type: 'regex', regex: 'Codex' } },
  ]);

  expect(classes.matchString('FocusFrog - Home', normalized)?.name).toEqual([
    'Work',
    'Planning',
  ]);
  expect(classes.matchString('FrogFocus - Plan day', normalized)?.name).toEqual([
    'Work',
    'Planning',
  ]);
  expect(classes.matchString('github.com/juliawenkmann/focusfrog', normalized)?.name).toEqual([
    'Work',
    'Programming',
  ]);
});

test('normalizes legacy social media rules to include streaming and news', () => {
  const normalized = classes.normalizeFocusFrogCategories([
    { name: ['Social Media'], rule: { type: 'regex', regex: 'YouTube|Reddit' } },
  ]);

  expect(classes.matchString('Netflix', normalized)?.name).toEqual(['Social Media']);
  expect(classes.matchString('Amazon.de: Mayhem ansehen | Prime Video', normalized)?.name).toEqual([
    'Social Media',
  ]);
  expect(classes.matchString('Eurosport', normalized)?.name).toEqual(['Social Media']);
  expect(classes.matchString('tagesschau.de', normalized)?.name).toEqual(['Social Media']);
});
