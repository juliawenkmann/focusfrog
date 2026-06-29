import { Rule } from '~/util/classes';

export const MESSAGE_CALLS_CATEGORY = 'Messages & Calls';
export const WORK_COLOR = '#059669';
export const NOT_WORK_COLOR = '#db2777';

const PROGRAMMING_PATTERN =
  'ActivityWatch|aw-|Codex|GitHub|github|github\\.com|github\\.dev|githubusercontent\\.com|GitLab|gitlab\\.com|Bitbucket|Stack Overflow|stackoverflow|VS Code|VSCode|Visual Studio Code|Visual Studio|VSCodium|Cursor|PyCharm|Jupyter|JupyterLab|Jupyter Notebook|\\.ipynb\\b|ipynb|RStudio|Xcode|Terminal|Apple Terminal|iTerm|iTerm2|iTerm\\.app|iTerm2\\.app|com\\.apple\\.Terminal|com\\.googlecode\\.iterm2|vim|neovim|Spyder|Docker|npm|pnpm|yarn|conda|Python|TypeScript|JavaScript';

const WRITING_PATTERN =
  'Overleaf|overleaf\\.com|arXiv|arxiv\\.org|LaTeX|TeXstudio|Texmaker|BibTeX|Zotero|reMarkable|remarkable|Google Docs|docs\\.google\\.com|Microsoft Word|Pages|Manuscript|paper draft';

const EMAIL_PATTERN =
  'Mail|Gmail|mail\\.google\\.com|Outlook|ifiChat|Thunderbird|Spark|Superhuman|mutt|alpine|Proton Mail|proton\\.me/mail|Fastmail';

const AI_CHATS_PATTERN = 'ChatGPT|chatgpt\\.com|chat\\.openai\\.com|Claude|claude\\.ai|Anthropic';

const COMMUNICATION_PATTERN =
  'WhatsApp|Telegram|LinkedIn|linkedin\\.com|Messages|iMessage|Telephone|Phone|FaceTime|Signal|Slack|Microsoft Teams|Teams|Zoom|Google Meet|meet\\.google\\.com|Skype|Mattermost|Element|Discord';

const SOCIAL_MEDIA_PATTERN =
  'YouTube|youtu\\.be|youtube\\.com|Pinterest|pinterest|Netflix|Prime Video|Amazon Prime Video|Amazon Video|Amazon\\..*Prime Video|primevideo\\.com|Eurosport|tagesschau|tagesschau\\.de|TikTok|Instagram|Facebook|Threads|Twitter|X\\.com|Reddit|Snapchat|Tumblr|Mastodon|Bluesky|bsky\\.app|Twitch|WeChat|VK|VKontakte|Line|BeReal|Nextdoor|devRant';

const FOOD_PATTERN =
  'food|recipe|restaurant|cooking|meal|lunch|dinner|breakfast|brunch|snack|bakery|cafe|pizza|burger|sushi|pasta|kitchen|chef|menu|delivery|takeaway|takeout|Uber Eats|UberEats|DoorDash|Grubhub|Deliveroo|Just Eat|Lieferando|Wolt|OpenTable|Yelp';

const NOT_WORK_ROOTS = new Set(['Media', 'Social Media', 'Food']);

const CATEGORY_COLORS: Record<string, string> = {
  [JSON.stringify(['Work'])]: WORK_COLOR,
  [JSON.stringify(['Work', 'Programming'])]: '#2563eb',
  [JSON.stringify(['Work', 'Writing'])]: '#14b8a6',
  [JSON.stringify(['Work', 'Email'])]: '#f59e0b',
  [JSON.stringify(['Work', 'AI Chats'])]: '#38bdf8',
  [JSON.stringify(['Work', MESSAGE_CALLS_CATEGORY])]: '#8b5cf6',
  [JSON.stringify(['Work', 'Image'])]: '#ec4899',
  [JSON.stringify(['Work', 'Video'])]: '#f97316',
  [JSON.stringify(['Work', 'Audio'])]: '#06b6d4',
  [JSON.stringify(['Work', '3D'])]: '#a855f7',
  [JSON.stringify(['Social Media'])]: '#e11d48',
  [JSON.stringify(['Food'])]: '#f97316',
  [JSON.stringify(['Media'])]: '#0ea5e9',
  [JSON.stringify(['Media', 'Music'])]: '#22c55e',
  [JSON.stringify(['Media', 'Video'])]: '#ef4444',
  [JSON.stringify(['Media', 'Games'])]: '#a855f7',
};

const FALLBACK_CATEGORY_COLORS = [
  '#2563eb',
  '#14b8a6',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#06b6d4',
  '#22c55e',
  '#ef4444',
  '#a855f7',
  '#0ea5e9',
  '#84cc16',
];

export type CategoryRuleTuple = [string[], Rule];

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(item => collectText(item));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(item => collectText(item));
  }
  return [];
}

function matchesPattern(pattern: string, value: string): boolean {
  return new RegExp(pattern, 'i').test(value);
}

export function eventSearchText(event: any): string {
  return collectText(event?.data || {}).join(' ');
}

export function categoryLabel(category: string[]): string {
  if (category.length === 0) return 'Work';
  if (category.length === 2 && category[0] === category[1]) return category[0];
  return category.join(' > ');
}

export function normalizeWorkCategory(category: string[]): string[] {
  if (category[0] === 'Work' && category[1] === 'Communication') {
    return ['Work', MESSAGE_CALLS_CATEGORY, ...category.slice(2)];
  }
  return category;
}

export function workSubcategoryLabel(category: string[]): string {
  const normalized = normalizeWorkCategory(category);
  if (normalized[0] !== 'Work') return categoryLabel(normalized);
  return normalized.length > 1 ? normalized.slice(1).join(' > ') : 'Uncategorized';
}

export function categoryKey(category: string[]): string {
  return JSON.stringify(category);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function isNotWorkCategory(category: string[]): boolean {
  return NOT_WORK_ROOTS.has(category[0]);
}

export function categorizeFocusFrogEvent(
  event: any,
  categoryRules: CategoryRuleTuple[] = []
): string[] {
  const text = eventSearchText(event);

  if (matchesPattern(FOOD_PATTERN, text)) return ['Food'];
  if (matchesPattern(WRITING_PATTERN, text)) return ['Work', 'Writing'];
  if (matchesPattern(EMAIL_PATTERN, text)) return ['Work', 'Email'];
  if (matchesPattern(AI_CHATS_PATTERN, text)) return ['Work', 'AI Chats'];
  if (matchesPattern(PROGRAMMING_PATTERN, text)) return ['Work', 'Programming'];
  if (matchesPattern(COMMUNICATION_PATTERN, text)) return ['Work', MESSAGE_CALLS_CATEGORY];
  if (matchesPattern(SOCIAL_MEDIA_PATTERN, text)) return ['Social Media'];

  let bestCategory: string[] = ['Work'];
  for (const [category, rule] of categoryRules) {
    if (!rule || rule.type !== 'regex' || !rule.regex) continue;
    try {
      const flags = rule.ignore_case ? 'i' : '';
      if (new RegExp(rule.regex, flags).test(text) && category.length >= bestCategory.length) {
        bestCategory = category;
      }
    } catch (err) {
      console.warn('Skipping invalid category regex:', rule.regex, err);
    }
  }

  if (bestCategory[0] === 'Uncategorized') return ['Work'];
  if (
    bestCategory[0] === 'Work' &&
    bestCategory[1] === 'Programming' &&
    bestCategory[2] === 'ActivityWatch'
  ) {
    return ['Work', 'Programming'];
  }
  if (bestCategory[0] === 'Comms' && bestCategory[1] === 'Email') return ['Work', 'Email'];
  if (bestCategory[0] === 'Comms') return ['Work', MESSAGE_CALLS_CATEGORY];
  if (bestCategory[0] === 'Media' && bestCategory[1] === 'Social Media') {
    return ['Social Media'];
  }
  return normalizeWorkCategory(bestCategory);
}

export function categoryColor(category: string[]): string {
  const normalized = normalizeWorkCategory(category);
  const exactColor = CATEGORY_COLORS[categoryKey(normalized)];
  if (exactColor) return exactColor;

  const rootColor = CATEGORY_COLORS[categoryKey([normalized[0]])];
  if (normalized.length === 1 && rootColor) return rootColor;

  return FALLBACK_CATEGORY_COLORS[
    hashString(categoryKey(normalized)) % FALLBACK_CATEGORY_COLORS.length
  ];
}
