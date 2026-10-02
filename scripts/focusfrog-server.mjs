#!/usr/bin/env node

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDist = path.resolve(__dirname, '..', 'dist');

function getDefaultStoragePath() {
  if (process.platform === 'win32') {
    const base =
      process.env.APPDATA ||
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'FocusFrog', 'storage.json');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'FocusFrog', 'storage.json');
  }

  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'FocusFrog', 'storage.json');
}

const distDir = path.resolve(process.env.FOCUSFROG_DIST || defaultDist);
const port = Number.parseInt(process.env.FOCUSFROG_PORT || '27180', 10);
const awTarget = new URL(process.env.AW_API_TARGET || 'http://127.0.0.1:5600');
const storagePath = path.resolve(process.env.FOCUSFROG_STORAGE_PATH || getDefaultStoragePath());
const visionImageDir = path.join(path.dirname(storagePath), 'vision-board-images');
const manualWorkStorageKey = 'manualWork';
const dailyMeetingWorkMinutes = 60;
const dailyMeetingWorkStartTime = '12:00';
const storageKeys = new Set([
  'todos',
  'todoProjects',
  'todoDayPlan',
  'todoFrog',
  'timeBlocks',
  'visionBoard',
  manualWorkStorageKey,
]);
const visionImageMaxBytes = 8 * 1024 * 1024;
const visionImageIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const visionImageFormats = [
  {
    extension: '.jpg',
    mimeType: 'image/jpeg',
    matches: buffer =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    extension: '.png',
    mimeType: 'image/png',
    matches: buffer =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    extension: '.webp',
    mimeType: 'image/webp',
    matches: buffer =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];
const widgetSummaryRefreshSeconds = 5 * 60;
const afkGraceSeconds = 5 * 60;

const workColor = '#059669';
const notWorkColor = '#db2777';

const messageCallsCategory = 'Messages & Calls';
const programmingPattern =
  'ActivityWatch|aw-|Codex|GitHub|github|github\\.com|github\\.dev|githubusercontent\\.com|GitLab|gitlab\\.com|Bitbucket|Stack Overflow|stackoverflow|VS Code|VSCode|Visual Studio Code|Visual Studio|VSCodium|Cursor|PyCharm|Jupyter|JupyterLab|Jupyter Notebook|\\.ipynb\\b|ipynb|RStudio|Xcode|Terminal|Apple Terminal|iTerm|iTerm2|iTerm\\.app|iTerm2\\.app|com\\.apple\\.Terminal|com\\.googlecode\\.iterm2|vim|neovim|Spyder|Docker|npm|pnpm|yarn|conda|Python|TypeScript|JavaScript';
const planningPattern = 'FocusFrog|FrogFocus';
const writingPattern =
  'Overleaf|overleaf\\.com|arXiv|arxiv\\.org|LaTeX|TeXstudio|Texmaker|BibTeX|Zotero|reMarkable|remarkable|Google Docs|docs\\.google\\.com|Microsoft Word|Pages|Manuscript|paper draft';
const emailPattern =
  'Mail|Gmail|mail\\.google\\.com|Outlook|ifiChat|Thunderbird|Spark|Superhuman|mutt|alpine|Proton Mail|proton\\.me/mail|Fastmail';
const aiChatsPattern = 'ChatGPT|chatgpt\\.com|chat\\.openai\\.com|Claude|claude\\.ai|Anthropic';
const communicationPattern =
  'WhatsApp|Telegram|LinkedIn|linkedin\\.com|Messages|iMessage|Telephone|Phone|FaceTime|Signal|Slack|Microsoft Teams|Teams|Zoom|Google Meet|meet\\.google\\.com|Skype|Mattermost|Element|Discord';
const socialMediaPattern =
  'YouTube|youtu\\.be|youtube\\.com|Pinterest|pinterest|Netflix|Prime Video|Amazon Prime Video|Amazon Video|Amazon\\..*Prime Video|primevideo\\.com|Eurosport|tagesschau|tagesschau\\.de|TikTok|Instagram|Facebook|Threads|Twitter|X\\.com|Reddit|Snapchat|Tumblr|Mastodon|Bluesky|bsky\\.app|Twitch|WeChat|VK|VKontakte|Line|BeReal|Nextdoor|devRant';
const foodPattern =
  'food|recipe|restaurant|cooking|meal|lunch|dinner|breakfast|brunch|snack|bakery|cafe|pizza|burger|sushi|pasta|kitchen|chef|menu|delivery|takeaway|takeout|Uber Eats|UberEats|DoorDash|Grubhub|Deliveroo|Just Eat|Lieferando|Wolt|OpenTable|Yelp';
const notWorkRoots = new Set(['Media', 'Social Media', 'Food']);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function requestJson(requestPath, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(requestPath, awTarget);
    const payload = body === null ? null : JSON.stringify(body);
    const client = target.protocol === 'https:' ? https : http;
    const headers = {
      accept: 'application/json',
    };

    if (payload !== null) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }

    const req = client.request(target, { method, headers }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        responseBody += chunk;
      });
      response.on('end', () => {
        if ((response.statusCode || 500) >= 400) {
          reject(
            new Error(
              `ActivityWatch returned ${response.statusCode || 500} for ${target.pathname}`
            )
          );
          return;
        }

        try {
          resolve(responseBody ? JSON.parse(responseBody) : null);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out requesting ${target.href}`));
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function serveHealth(res) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      ok: true,
      app: 'FocusFrog',
      apiVersion: 2,
      pid: process.pid,
      capabilities: {
        visionBoardImages: true,
      },
      awTarget: awTarget.origin,
      distDir,
      storagePath,
    })
  );
}

function escapeAwString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function buildWorkSummaryQuery(hosts) {
  let query = '';
  hosts.forEach((hostname, index) => {
    const host = escapeAwString(hostname);
    query += `
            active_${index} = flood(query_bucket("aw-watcher-window_${host}"));
            raw_active_${index} = active_${index};
            not_afk_${index} = flood(query_bucket("aw-watcher-afk_${host}"));
            not_afk_${index} = filter_keyvals(not_afk_${index}, "status", ["not-afk"]);
            active_${index} = filter_period_intersect(active_${index}, not_afk_${index});
          `;
  });
  query += '\nactive = [];';
  query += '\nraw_active = [];';
  hosts.forEach((_hostname, index) => {
    query += `\nactive = union_no_overlap(active, active_${index});`;
    query += `\nraw_active = union_no_overlap(raw_active, raw_active_${index});`;
  });
  query += `
          active_duration = sum_durations(active);
          RETURN = {"activeDuration": active_duration, "activeEvents": active, "rawActiveEvents": raw_active};
        `;
  return query
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n');
}

function readStorage({ failOnError = false } = {}) {
  try {
    if (!fs.existsSync(storagePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('FocusFrog storage must contain a JSON object');
    }
    return parsed;
  } catch (error) {
    console.warn(`Could not read FocusFrog storage at ${storagePath}:`, error);
    if (failOnError) {
      throw requestBodyError('FocusFrog app storage is currently unreadable', 500);
    }
    return {};
  }
}

function writeStorage(storage) {
  const storageDir = path.dirname(storagePath);
  fs.mkdirSync(storageDir, { recursive: true });
  const temporaryPath = path.join(
    storageDir,
    `.${path.basename(storagePath)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(storage, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, storagePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function readRequestBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function requestBodyError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readRequestBuffer(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
      reject(requestBodyError('Image is larger than 8 MB', 413));
      req.resume();
      return;
    }

    const chunks = [];
    let byteLength = 0;
    let bodyError = null;
    req.on('data', chunk => {
      if (bodyError) return;
      byteLength += chunk.length;
      if (byteLength > limitBytes) {
        bodyError = requestBodyError('Image is larger than 8 MB', 413);
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (bodyError) {
        reject(bodyError);
        return;
      }
      resolve(Buffer.concat(chunks, byteLength));
    });
    req.on('error', reject);
  });
}

function isLoopbackHostname(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

function isAllowedLocalMutation(req) {
  try {
    const requestHost = new URL(`http://${req.headers.host || ''}`);
    if (!isLoopbackHostname(requestHost.hostname)) return false;

    const requestOrigin = req.headers.origin;
    if (!requestOrigin) return true;
    const originUrl = new URL(requestOrigin);
    const originPort = Number.parseInt(
      originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80'),
      10
    );
    return isLoopbackHostname(originUrl.hostname) && originPort === port;
  } catch (_error) {
    return false;
  }
}

function detectVisionImageFormat(buffer) {
  return visionImageFormats.find(format => format.matches(buffer)) || null;
}

function findVisionImage(imageId) {
  if (!visionImageIdPattern.test(imageId)) return null;
  for (const format of visionImageFormats) {
    const filePath = path.join(visionImageDir, `${imageId.toLowerCase()}${format.extension}`);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) return { ...format, filePath, size: stats.size };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

async function storeVisionImage(req, res) {
  if (!isAllowedLocalMutation(req)) {
    sendJson(res, 403, { error: 'Vision board image upload is only available inside FocusFrog' });
    return;
  }

  try {
    const buffer = await readRequestBuffer(req, visionImageMaxBytes);
    const format = detectVisionImageFormat(buffer);
    if (!format) {
      sendJson(res, 415, { error: 'Use a JPEG, PNG, or WebP image' });
      return;
    }

    const declaredType = String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
      .replace('image/jpg', 'image/jpeg');
    if (declaredType && declaredType !== format.mimeType) {
      sendJson(res, 415, { error: 'The selected file does not match its image type' });
      return;
    }

    fs.mkdirSync(visionImageDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') fs.chmodSync(visionImageDir, 0o700);
    const imageId = randomUUID();
    const filePath = path.join(visionImageDir, `${imageId}${format.extension}`);
    const temporaryPath = `${filePath}.uploading`;
    try {
      fs.writeFileSync(temporaryPath, buffer, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporaryPath, filePath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw error;
    }

    sendJson(res, 201, {
      id: imageId,
      url: `/focusfrog-vision-images/${imageId}`,
      mimeType: format.mimeType,
      size: buffer.length,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    sendJson(res, statusCode, {
      error:
        statusCode === 500
          ? 'FocusFrog could not store this image'
          : error instanceof Error
          ? error.message
          : 'Invalid image upload',
    });
  }
}

function serveVisionImage(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (requestUrl.pathname === '/focusfrog-vision-images') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    void storeVisionImage(req, res);
    return;
  }

  const match = requestUrl.pathname.match(/^\/focusfrog-vision-images\/([^/]+)$/);
  const imageId = match?.[1] || '';
  if (!visionImageIdPattern.test(imageId)) {
    sendJson(res, 404, { error: 'Vision board image not found' });
    return;
  }

  if (req.method === 'DELETE') {
    if (!isAllowedLocalMutation(req)) {
      sendJson(res, 403, {
        error: 'Vision board image deletion is only available inside FocusFrog',
      });
      return;
    }
    try {
      const image = findVisionImage(imageId);
      if (image) fs.unlinkSync(image.filePath);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      console.warn(`Could not delete FocusFrog vision image ${imageId}:`, error);
      sendJson(res, 500, { error: 'FocusFrog could not delete this image' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let image;
  try {
    image = findVisionImage(imageId);
  } catch (error) {
    console.warn(`Could not read FocusFrog vision image ${imageId}:`, error);
    sendJson(res, 500, { error: 'FocusFrog could not read this image' });
    return;
  }
  if (!image) {
    sendJson(res, 404, { error: 'Vision board image not found' });
    return;
  }

  const headers = {
    'content-type': image.mimeType,
    'content-length': image.size,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const imageStream = fs.createReadStream(image.filePath);
  imageStream.on('error', error => {
    console.warn(`Could not stream FocusFrog vision image ${imageId}:`, error);
    res.destroy(error);
  });
  imageStream.pipe(res);
}

async function serveStorage(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const match = requestUrl.pathname.match(/^\/focusfrog-storage\/([A-Za-z0-9_-]+)$/);
  const key = match?.[1];

  if (!key || !storageKeys.has(key)) {
    sendJson(res, 404, { error: 'Unknown FocusFrog storage key' });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const payload = { value: readStorage()[key] ?? null };
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end();
      return;
    }
    sendJson(res, 200, payload);
    return;
  }

  if (req.method !== 'PUT') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!isAllowedLocalMutation(req)) {
    sendJson(res, 403, { error: 'FocusFrog storage is only writable inside FocusFrog' });
    return;
  }

  const contentType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    sendJson(res, 415, { error: 'FocusFrog storage writes require application/json' });
    return;
  }

  let payload;
  try {
    const body = await readRequestBody(req);
    payload = body ? JSON.parse(body) : null;
    if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'value')) {
      throw new Error('Request body must contain a value');
    }
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
    return;
  }

  try {
    const storage = readStorage({ failOnError: true });
    storage[key] = payload.value ?? null;
    writeStorage(storage);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, Number(error?.statusCode) || 500, {
      error: error instanceof Error ? error.message : 'FocusFrog could not save app storage',
    });
  }
}

function eventInterval(event) {
  const startMs = new Date(event?.timestamp).getTime();
  const duration = Math.max(0, Number(event?.duration || 0));
  if (!Number.isFinite(startMs) || duration <= 0) return null;
  return {
    startMs,
    endMs: startMs + duration * 1000,
  };
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(interval => interval && interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const merged = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.startMs > previous.endMs) {
      merged.push({ ...interval });
    } else {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    }
  }

  return merged;
}

function intersectWithIntervals(interval, masks) {
  return masks
    .map(mask => ({
      startMs: Math.max(interval.startMs, mask.startMs),
      endMs: Math.min(interval.endMs, mask.endMs),
    }))
    .filter(overlap => overlap.endMs > overlap.startMs);
}

function subtractIntervals(intervals, blockers) {
  let remaining = intervals;

  for (const blocker of blockers) {
    remaining = remaining.flatMap(interval => {
      if (blocker.endMs <= interval.startMs || blocker.startMs >= interval.endMs) {
        return [interval];
      }

      const pieces = [];
      if (blocker.startMs > interval.startMs) {
        pieces.push({ startMs: interval.startMs, endMs: blocker.startMs });
      }
      if (blocker.endMs < interval.endMs) {
        pieces.push({ startMs: blocker.endMs, endMs: interval.endMs });
      }
      return pieces;
    });
    if (remaining.length === 0) break;
  }

  return remaining;
}

function addAfkGraceToActiveEvents(activeEvents = [], rawEvents = []) {
  if (activeEvents.length === 0 || rawEvents.length === 0 || afkGraceSeconds <= 0) {
    return activeEvents;
  }

  const activeIntervals = mergeIntervals(activeEvents.map(eventInterval).filter(Boolean));
  if (activeIntervals.length === 0) return activeEvents;

  const graceMs = afkGraceSeconds * 1000;
  const graceIntervals = mergeIntervals(
    activeIntervals.map(interval => ({
      startMs: interval.endMs,
      endMs: interval.endMs + graceMs,
    }))
  );

  const graceEvents = [];
  for (const event of rawEvents) {
    const rawInterval = eventInterval(event);
    if (!rawInterval) continue;

    const graceOverlaps = intersectWithIntervals(rawInterval, graceIntervals);
    const extraIntervals = subtractIntervals(graceOverlaps, activeIntervals);

    for (const interval of extraIntervals) {
      const duration = (interval.endMs - interval.startMs) / 1000;
      if (duration <= 0) continue;
      graceEvents.push({
        ...event,
        timestamp: new Date(interval.startMs).toISOString(),
        duration,
        data: { ...(event.data || {}), $afk_grace: true },
      });
    }
  }

  return [...activeEvents, ...graceEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function collectText(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(item => collectText(item));
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(item => collectText(item));
  }
  return [];
}

function matchesPattern(pattern, value) {
  return new RegExp(pattern, 'i').test(value);
}

function categorizeEvent(event) {
  const text = collectText(event?.data || {}).join(' ');

  if (matchesPattern(foodPattern, text)) return ['Food'];
  if (matchesPattern(writingPattern, text)) return ['Work', 'Writing'];
  if (matchesPattern(emailPattern, text)) return ['Work', 'Email'];
  if (matchesPattern(aiChatsPattern, text)) return ['Work', 'AI Chats'];
  if (matchesPattern(programmingPattern, text)) return ['Work', 'Programming'];
  if (matchesPattern(planningPattern, text)) return ['Work', 'Planning'];
  if (matchesPattern(communicationPattern, text)) return ['Work', messageCallsCategory];
  if (matchesPattern(socialMediaPattern, text)) return ['Social Media'];
  return ['Work'];
}

function isNotWorkCategory(category) {
  return notWorkRoots.has(category[0]);
}

function sumEventDurations(events) {
  return events.reduce((total, event) => total + Math.max(0, Number(event?.duration || 0)), 0);
}

function summarizeActiveEvents(events) {
  let notWorkDuration = 0;

  for (const event of events) {
    const duration = Math.max(0, Number(event.duration || 0));
    const category = categorizeEvent(event);
    if (isNotWorkCategory(category)) {
      notWorkDuration += duration;
    }
  }

  const activeSeconds = sumEventDurations(events);
  const boundedNotWork = Math.min(activeSeconds, notWorkDuration);
  return {
    activeSeconds,
    workSeconds: Math.max(0, activeSeconds - boundedNotWork),
    notWorkSeconds: boundedNotWork,
  };
}

function normalizeManualWorkEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const date = typeof entry.date === 'string' ? entry.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const minutes = Math.max(0, Math.round(Number(entry.minutes || 0)));
  if (minutes <= 0) return null;
  const startTime =
    typeof entry.startTime === 'string' && /^\d{2}:\d{2}$/.test(entry.startTime)
      ? entry.startTime
      : '';
  return {
    date,
    startTime,
    minutes,
  };
}

function manualWorkEntryStartMs(entry) {
  const startTime = entry.startTime || '12:00';
  const timestamp = new Date(`${entry.date}T${startTime}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function manualWorkEntrySecondsInRange(entry, rangeStartMs, rangeEndMs) {
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs <= rangeStartMs) {
    return 0;
  }

  if (!entry.startTime) {
    const entryStartMs = new Date(`${entry.date}T00:00:00`).getTime();
    const entryEndMs = entryStartMs + 24 * 60 * 60 * 1000;
    return entryEndMs > rangeStartMs && entryStartMs < rangeEndMs ? entry.minutes * 60 : 0;
  }

  const entryStartMs = manualWorkEntryStartMs(entry);
  if (!Number.isFinite(entryStartMs)) return 0;
  const entryEndMs = entryStartMs + entry.minutes * 60 * 1000;
  const clippedStart = Math.max(entryStartMs, rangeStartMs);
  const clippedEnd = Math.min(entryEndMs, rangeEndMs);
  return Math.max(0, (clippedEnd - clippedStart) / 1000);
}

function getManualWorkSecondsForTimeperiod(entries, timeperiod) {
  const [startIso, endIso] = String(timeperiod || '').split('/');
  const rangeStartMs = new Date(startIso).getTime();
  const rangeEndMs = new Date(endIso).getTime();
  return (Array.isArray(entries) ? entries : []).reduce((total, entry) => {
    const normalized = normalizeManualWorkEntry(entry);
    return normalized
      ? total + manualWorkEntrySecondsInRange(normalized, rangeStartMs, rangeEndMs)
      : total;
  }, 0);
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getDailyMeetingWorkSecondsForTimeperiod(timeperiod) {
  const [startIso, endIso] = String(timeperiod || '').split('/');
  const rangeStartMs = new Date(startIso).getTime();
  const rangeEndMs = new Date(endIso).getTime();
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs <= rangeStartMs) {
    return 0;
  }

  const date = localDateKey(new Date(rangeStartMs));
  const today = localDateKey(new Date());
  if (date > today) return 0;

  return manualWorkEntrySecondsInRange(
    {
      date,
      startTime: dailyMeetingWorkStartTime,
      minutes: dailyMeetingWorkMinutes,
    },
    rangeStartMs,
    rangeEndMs
  );
}

function getOffsetMinutes(offset) {
  const match = String(offset || '04:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 4 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getTodayTimeperiod(offset) {
  const offsetMs = getOffsetMinutes(offset) * 60 * 1000;
  const shiftedNow = new Date(Date.now() - offsetMs);
  const shiftedStart = new Date(shiftedNow);
  shiftedStart.setHours(0, 0, 0, 0);

  const start = new Date(shiftedStart.getTime() + offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const dayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(start);

  return {
    label: dayLabel,
    timeperiod: `${start.toISOString()}/${end.toISOString()}`,
  };
}

async function getStartOfDay() {
  try {
    const value = await requestJson('/api/0/settings/startOfDay');
    return typeof value === 'string' ? value : '04:00';
  } catch {
    return '04:00';
  }
}

async function getSupportedHosts() {
  const buckets = await requestJson('/api/0/buckets/');
  const bucketList = Object.values(buckets || {});
  const afkHosts = new Set(
    bucketList
      .filter(bucket => bucket.type === 'afkstatus')
      .map(bucket => bucket.hostname || bucket.data?.hostname)
      .filter(Boolean)
  );
  return [
    ...new Set(
      bucketList
        .filter(bucket => bucket.type === 'currentwindow')
        .map(bucket => bucket.hostname || bucket.data?.hostname)
        .filter(host => host && afkHosts.has(host))
    ),
  ];
}

async function serveWidgetSummary(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const sendWidgetJson = (statusCode, payload) => {
    if (req.method === 'HEAD') {
      res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end();
      return;
    }
    sendJson(res, statusCode, payload);
  };

  try {
    const hosts = await getSupportedHosts();
    const startOfDay = await getStartOfDay();
    const { label, timeperiod } = getTodayTimeperiod(startOfDay);
    const manualWorkSeconds = getManualWorkSecondsForTimeperiod(
      readStorage()[manualWorkStorageKey],
      timeperiod
    );
    const dailyMeetingWorkSeconds = getDailyMeetingWorkSecondsForTimeperiod(timeperiod);
    const extraWorkSeconds = manualWorkSeconds + dailyMeetingWorkSeconds;

    if (hosts.length === 0) {
      const extraWorkPercent = extraWorkSeconds > 0 ? 100 : 0;
      sendWidgetJson(200, {
        ok: true,
        app: 'FocusFrog',
        generatedAt: new Date().toISOString(),
        label,
        timeperiod,
        startOfDay,
        hosts,
        activeSeconds: extraWorkSeconds,
        workSeconds: extraWorkSeconds,
        notWorkSeconds: 0,
        workPercent: extraWorkPercent,
        notWorkPercent: 0,
        workColor,
        notWorkColor,
        refreshAfterSeconds: widgetSummaryRefreshSeconds,
      });
      return;
    }

    const queryResults = await requestJson('/api/0/query/', {
      method: 'POST',
      body: {
        query: [buildWorkSummaryQuery(hosts)],
        timeperiods: [timeperiod],
      },
      timeoutMs: 15000,
    });
    const result = queryResults?.[0] || {};
    const activeEvents = addAfkGraceToActiveEvents(
      result.activeEvents || [],
      result.rawActiveEvents || []
    );
    const summary = summarizeActiveEvents(activeEvents);
    summary.activeSeconds += extraWorkSeconds;
    summary.workSeconds += extraWorkSeconds;
    const workPercent =
      summary.activeSeconds > 0
        ? Math.round((summary.workSeconds / summary.activeSeconds) * 100)
        : 0;

    sendWidgetJson(200, {
      ok: true,
      app: 'FocusFrog',
      generatedAt: new Date().toISOString(),
      label,
      timeperiod,
      startOfDay,
      hosts,
      activeSeconds: summary.activeSeconds,
      workSeconds: summary.workSeconds,
      notWorkSeconds: summary.notWorkSeconds,
      workPercent,
      notWorkPercent: summary.activeSeconds > 0 ? 100 - workPercent : 0,
      workColor,
      notWorkColor,
      refreshAfterSeconds: widgetSummaryRefreshSeconds,
    });
  } catch (error) {
    sendWidgetJson(502, {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not load FocusFrog widget summary',
    });
  }
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/index.html';

  let filePath = path.normalize(path.join(distDir, pathname));
  if (!filePath.startsWith(distDir)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'content-type': contentTypes.get(ext) || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  };

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function proxyApi(req, res) {
  const headers = { ...req.headers, host: awTarget.host };
  const options = {
    protocol: awTarget.protocol,
    hostname: awTarget.hostname,
    port: awTarget.port || (awTarget.protocol === 'https:' ? 443 : 80),
    path: req.url,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', error => {
    sendText(res, 502, `ActivityWatch API is not reachable at ${awTarget.origin}: ${error.message}`);
  });

  req.pipe(proxyReq);
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(`FocusFrog build output not found: ${distDir}`);
  console.error('Run npm run build first.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/focusfrog-healthz')) {
    serveHealth(res);
    return;
  }
  if (req.url?.startsWith('/focusfrog-widget-summary')) {
    void serveWidgetSummary(req, res);
    return;
  }
  if (req.url?.startsWith('/focusfrog-vision-images')) {
    serveVisionImage(req, res);
    return;
  }
  if (req.url?.startsWith('/focusfrog-storage/')) {
    void serveStorage(req, res);
    return;
  }
  if (req.url?.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`FocusFrog is serving ${distDir}`);
  console.log(`Open http://127.0.0.1:${port}/#/home`);
  console.log(`Proxying ActivityWatch API to ${awTarget.origin}`);
});
