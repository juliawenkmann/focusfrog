// ActivityWatch-compatible REST API (/api/0/...) served by FocusFrog itself, so the
// web UI and the tracker work without the ActivityWatch server.
import fs from 'node:fs';
import path from 'node:path';
import { formatIso, parseIsoMicros } from './aw-time.mjs';
import { QueryException, runQueries } from './aw-query.mjs';
import { eventFromJson, eventToJson, toJsonValue, TrackingStore } from './aw-store.mjs';

const JSON_LIMIT_BYTES = 8 * 1024 * 1024;
const IMPORT_LIMIT_BYTES = 256 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, type, message) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

// aw-server's settings.json behaviour: setting a falsy value removes the key.
class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
  }

  get(key) {
    if (!key) return this.data;
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  }

  set(key, value) {
    if (value) this.data[key] = value;
    else delete this.data[key];
    this.save();
  }

  save() {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 4), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'PayloadTooLarge', 'Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limitBytes = JSON_LIMIT_BYTES) {
  const body = (await readBody(req, limitBytes)).toString('utf8');
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new HttpError(400, 'BadRequest', 'Request body is not valid JSON');
  }
}

// Extracts the uploaded JSON file from the web UI's multipart import form.
function jsonFromMultipart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundary) throw new HttpError(400, 'BadRequest', 'Missing multipart boundary');
  const marker = `--${boundary[1] || boundary[2]}`;
  for (const part of buffer.toString('utf8').split(marker)) {
    const split = part.indexOf('\r\n\r\n');
    if (split < 0) continue;
    const body = part.slice(split + 4).replace(/\r\n$/, '');
    if (body.trim().startsWith('{')) return JSON.parse(body);
  }
  throw new HttpError(400, 'BadRequest', 'No JSON file found in upload');
}

export class NativeActivityApi {
  constructor({ dir, hostname, version, deviceId, log = console }) {
    this.dir = dir;
    this.hostname = hostname;
    this.version = version;
    this.log = log;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const deviceIdPath = path.join(dir, 'device_id');
    if (!fs.existsSync(deviceIdPath)) fs.writeFileSync(deviceIdPath, deviceId, { mode: 0o600 });
    this.deviceId = fs.readFileSync(deviceIdPath, 'utf8').trim();
    this.store = new TrackingStore({ dir, log });
    this.store.load();
    this.settings = new SettingsStore(path.join(dir, 'settings.json'));
  }

  close() {
    this.store.close();
  }

  info() {
    return {
      hostname: this.hostname,
      version: this.version,
      testing: false,
      device_id: this.deviceId,
    };
  }

  bucketsJson() {
    const result = {};
    for (const bucket of this.store.bucketList()) {
      const metadata = this.store.bucketMetadata(bucket.id);
      const newest = this.store.getEvents(bucket.id, { limit: 1 })[0];
      if (newest) metadata.last_updated = formatIso(newest.timestamp + newest.duration);
      result[bucket.id] = metadata;
    }
    return result;
  }

  requireBucket(bucketId) {
    if (!this.store.hasBucket(bucketId)) {
      throw new HttpError(404, 'NoSuchBucket', `There's no bucket named ${bucketId}`);
    }
  }

  exportBucket(bucketId) {
    const bucket = this.store.bucketMetadata(bucketId);
    bucket.events = this.store.getEvents(bucketId).map(event => {
      const json = eventToJson(event);
      delete json.id;
      return json;
    });
    return bucket;
  }

  importBuckets(buckets) {
    for (const [bucketId, bucket] of Object.entries(buckets || {})) {
      if (this.store.hasBucket(bucketId)) {
        throw new HttpError(409, 'BucketExists', `Bucket ${bucketId} already exists`);
      }
      this.store.createBucket(bucketId, {
        type: bucket.type,
        client: bucket.client,
        hostname: bucket.hostname,
        created: bucket.created ? parseIsoMicros(bucket.created) : null,
        name: bucket.name ?? null,
        data: bucket.data ?? {},
      });
      this.store.insertEvents(
        bucketId,
        (bucket.events || []).map(json => eventFromJson({ ...json, id: null }))
      );
    }
  }

  async route(req, url) {
    const segments = url.pathname
      .replace(/^\/api\/0\/?/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const method = req.method || 'GET';
    const params = url.searchParams;
    const [root, bucketId, sub, eventId] = segments;

    if (root === 'info' && method === 'GET') return [200, this.info()];
    if (root === 'log') return [200, []];

    if (root === 'settings') {
      const key = segments[1] || '';
      if (method === 'GET') return [200, this.settings.get(key)];
      if (!key) throw new HttpError(400, 'MissingParameter', 'Missing required parameter key');
      if (method === 'POST') {
        const value = await readJson(req);
        this.settings.set(key, value);
        return [200, value];
      }
      if (method === 'DELETE') {
        this.settings.set(key, null);
        return [200, {}];
      }
    }

    if (root === 'query' && method === 'POST') {
      const body = await readJson(req);
      if (!body || !body.query || !body.timeperiods) {
        throw new HttpError(400, 'BadRequest', 'Expected query and timeperiods');
      }
      try {
        return [
          200,
          toJsonValue(
            runQueries(params.get('name') || '', body.query, body.timeperiods, this.store)
          ),
        ];
      } catch (err) {
        if (err instanceof QueryException) return [400, { type: err.type, message: err.message }];
        throw err;
      }
    }

    if (root === 'export' && method === 'GET') {
      const buckets = {};
      for (const bucket of this.store.bucketList())
        buckets[bucket.id] = this.exportBucket(bucket.id);
      return [
        200,
        { buckets },
        { 'content-disposition': 'attachment; filename=aw-buckets-export.json' },
      ];
    }

    if (root === 'import' && method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      const payload = contentType.startsWith('multipart/')
        ? jsonFromMultipart(await readBody(req, IMPORT_LIMIT_BYTES), contentType)
        : await readJson(req, IMPORT_LIMIT_BYTES);
      this.importBuckets(payload?.buckets);
      return [200, null];
    }

    if (root !== 'buckets') throw new HttpError(404, 'NotFound', 'Not found');
    if (!bucketId) {
      if (method === 'GET') return [200, this.bucketsJson()];
      throw new HttpError(405, 'MethodNotAllowed', 'Method not allowed');
    }

    if (!sub) {
      if (method === 'GET') {
        this.requireBucket(bucketId);
        return [200, this.store.bucketMetadata(bucketId)];
      }
      if (method === 'POST') {
        const body = (await readJson(req)) || {};
        let hostname = body.hostname;
        let data = null;
        if (hostname === '!local') {
          hostname = this.hostname;
          data = { device_id: this.deviceId };
        }
        const created = this.store.createBucket(bucketId, {
          type: body.type,
          client: body.client,
          hostname,
          data,
        });
        return created ? [200, {}] : [304, null];
      }
      if (method === 'PUT') {
        this.requireBucket(bucketId);
        const body = (await readJson(req)) || {};
        this.store.updateBucket(bucketId, body);
        return [200, {}];
      }
      if (method === 'DELETE') {
        this.requireBucket(bucketId);
        if (params.get('force') !== '1') {
          throw new HttpError(
            401,
            'DeleteBucketUnauthorized',
            'Deleting buckets is only permitted if aw-server is running in testing mode or if ?force=1'
          );
        }
        this.store.deleteBucket(bucketId);
        return [200, {}];
      }
    }

    this.requireBucket(bucketId);
    const range = {
      start: params.has('start') ? parseIsoMicros(params.get('start')) : null,
      end: params.has('end') ? parseIsoMicros(params.get('end')) : null,
    };

    if (sub === 'export' && method === 'GET') {
      return [
        200,
        { buckets: { [bucketId]: this.exportBucket(bucketId) } },
        { 'content-disposition': `attachment; filename=aw-bucket-export_${bucketId}.json` },
      ];
    }

    if (sub === 'heartbeat' && method === 'POST') {
      if (!params.has('pulsetime')) {
        throw new HttpError(400, 'MissingParameter', 'Missing required parameter pulsetime');
      }
      const heartbeat = eventFromJson((await readJson(req)) || {});
      const pulsetime = Number.parseFloat(params.get('pulsetime'));
      if (!Number.isFinite(pulsetime)) throw new HttpError(400, 'BadRequest', 'Invalid pulsetime');
      return [200, eventToJson(this.store.heartbeat(bucketId, heartbeat, pulsetime))];
    }

    if (sub === 'events') {
      if (eventId === 'count' && method === 'GET')
        return [200, this.store.getEventCount(bucketId, range)];
      if (eventId !== undefined) {
        const id = Number.parseInt(eventId, 10);
        if (method === 'GET') {
          const event = this.store.getEvent(bucketId, id);
          return event ? [200, eventToJson(event)] : [404, null];
        }
        if (method === 'DELETE') return [200, { success: this.store.deleteEvent(bucketId, id) }];
      } else if (method === 'GET') {
        const limit = params.has('limit') ? Number.parseInt(params.get('limit'), 10) : -1;
        return [200, this.store.getEvents(bucketId, { limit, ...range }).map(eventToJson)];
      } else if (method === 'POST') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object')
          throw new HttpError(400, 'BadRequest', 'Invalid POST data');
        const events = (Array.isArray(body) ? body : [body]).map(eventFromJson);
        this.store.insertEvents(bucketId, events);
        return [200, null];
      }
    }

    throw new HttpError(405, 'MethodNotAllowed', 'Method not allowed');
  }

  async handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let status = 500;
    let payload = null;
    let headers = {};
    try {
      [status, payload, headers = {}] = await this.route(req, url);
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        payload = { type: err.type, message: err.message };
      } else {
        this.log.error('FocusFrog tracking API error:', err);
        status = 500;
        payload = { type: err?.name || 'Error', message: err?.message || String(err) };
      }
    }
    if (status === 304) {
      res.writeHead(304);
      res.end();
      return;
    }
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(JSON.stringify(payload));
  }
}
