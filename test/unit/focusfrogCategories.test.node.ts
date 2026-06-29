import { categorizeFocusFrogEvent } from '~/util/focusfrogCategories';

test('categorizes GitHub activity as programming', () => {
  expect(
    categorizeFocusFrogEvent({
      data: {
        app: 'Google Chrome',
        title: 'juliawenkmann/focusfrog: GitHub',
        url: 'https://github.com/juliawenkmann/focusfrog',
      },
    })
  ).toEqual(['Work', 'Programming']);

  expect(
    categorizeFocusFrogEvent({
      data: {
        app: 'GitHub Desktop',
        title: 'focusfrog',
      },
    })
  ).toEqual(['Work', 'Programming']);
});

test('categorizes notebooks as programming', () => {
  expect(
    categorizeFocusFrogEvent({
      data: {
        app: 'Code',
        title: 'exercise_10_solution.ipynb — xai-exercises',
      },
    })
  ).toEqual(['Work', 'Programming']);
});

test('categorizes reMarkable as writing', () => {
  expect(
    categorizeFocusFrogEvent({
      data: {
        app: 'reMarkable',
        title: 'reMarkable - XAI notes',
      },
    })
  ).toEqual(['Work', 'Writing']);
});

test('categorizes ifiChat as email', () => {
  expect(
    categorizeFocusFrogEvent({
      data: {
        app: 'Google Chrome',
        title: 'xai - ifiChat - Google Chrome - Julia',
      },
    })
  ).toEqual(['Work', 'Email']);
});

test('categorizes Claude and ChatGPT as AI chats', () => {
  const cases = [
    'ChatGPT - Google Chrome - Julia',
    'chat.openai.com - Google Chrome - Julia',
    'Building a healthier lifestyle plan - Claude - Google Chrome - Julia',
    'claude.ai - Google Chrome - Julia',
  ];

  for (const title of cases) {
    expect(
      categorizeFocusFrogEvent({
        data: {
          app: 'Google Chrome',
          title,
        },
      })
    ).toEqual(['Work', 'AI Chats']);
  }
});

test('categorizes streaming and news pages as social media', () => {
  const cases = [
    'Netflix - Audio playing - Google Chrome - Julia',
    'Amazon.de: The Man in the High Castle ansehen | Prime Video - Google Chrome - Julia',
    'Deutschlands Weg ins WM-Finale 2026 - Eurosport - Google Chrome - Julia',
    'Was tut die Politik für den Hitzeschutz? | tagesschau.de - Google Chrome - Julia',
  ];

  for (const title of cases) {
    expect(
      categorizeFocusFrogEvent({
        data: {
          app: 'Google Chrome',
          title,
        },
      })
    ).toEqual(['Social Media']);
  }
});
