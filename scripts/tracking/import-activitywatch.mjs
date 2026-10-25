#!/usr/bin/env node
// Copies ActivityWatch's buckets, events, settings and device id into FocusFrog's
// own tracking store. Read-only towards ActivityWatch.
//
//   node import-activitywatch.mjs --dest <dir> [--aw-dir <dir>] [--overwrite]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseIsoMicros, secondsToMicros } from './aw-time.mjs';
import { AwEvent } from './aw-transforms.mjs';
import { TrackingStore } from './aw-store.mjs';

const DEFAULT_AW_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'activitywatch',
  'aw-server'
);
const SQLITE = fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';

function sqliteJson(dbPath, sql) {
  const output = execFileSync(SQLITE, ['-readonly', '-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  return output.trim() ? JSON.parse(output) : [];
}

export function importActivityWatch({
  awDir = DEFAULT_AW_DIR,
  dest,
  overwrite = false,
  log = console,
}) {
  const dbPath = path.join(awDir, 'peewee-sqlite.v2.db');
  if (!fs.existsSync(dbPath)) throw new Error(`ActivityWatch database not found: ${dbPath}`);
  if (fs.existsSync(path.join(dest, 'buckets.json')) && !overwrite) {
    throw new Error(`${dest} already contains tracking data (use --overwrite to replace it)`);
  }
  fs.rmSync(path.join(dest, 'events'), { recursive: true, force: true });
  for (const file of ['buckets.json', 'open.json', 'settings.json', 'device_id']) {
    fs.rmSync(path.join(dest, file), { force: true });
  }
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });

  const store = new TrackingStore({ dir: dest, log });
  store.load();

  const buckets = sqliteJson(
    dbPath,
    'SELECT key, id, created, name, type, client, hostname, datastr FROM bucketmodel ORDER BY key'
  );
  for (const bucket of buckets) {
    store.createBucket(bucket.id, {
      type: bucket.type,
      client: bucket.client,
      hostname: bucket.hostname,
      created: parseIsoMicros(bucket.created),
      name: bucket.name,
      data: bucket.datastr ? JSON.parse(bucket.datastr) : {},
    });
  }

  // Durations are read at full precision so they convert exactly like aw-core does.
  const rows = sqliteJson(
    dbPath,
    `SELECT b.id AS bucket, e.id AS id, e.timestamp AS timestamp,
            CASE typeof(e.duration) WHEN 'real' THEN printf('%.17g', e.duration)
                 ELSE CAST(e.duration AS TEXT) END AS duration,
            e.datastr AS datastr
       FROM eventmodel e JOIN bucketmodel b ON b.key = e.bucket_id
      ORDER BY e.id`
  );
  const byBucket = new Map();
  for (const row of rows) {
    const list = byBucket.get(row.bucket) || [];
    list.push(
      new AwEvent({
        id: row.id,
        timestamp: parseIsoMicros(row.timestamp),
        duration: secondsToMicros(Number.parseFloat(row.duration)),
        data: JSON.parse(row.datastr),
      })
    );
    byBucket.set(row.bucket, list);
  }
  for (const [bucketId, events] of byBucket) store.insertEvents(bucketId, events);
  store.compact();
  store.close();

  const settingsPath = path.join(awDir, 'settings.json');
  if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, path.join(dest, 'settings.json'));
  const deviceIdPath = path.join(awDir, 'device_id');
  if (fs.existsSync(deviceIdPath)) fs.copyFileSync(deviceIdPath, path.join(dest, 'device_id'));

  return { buckets: buckets.length, events: rows.length };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const value = flag => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const dest = value('--dest');
  if (!dest) {
    console.error('Usage: import-activitywatch.mjs --dest <dir> [--aw-dir <dir>] [--overwrite]');
    process.exit(2);
  }
  const result = importActivityWatch({
    awDir: value('--aw-dir') || DEFAULT_AW_DIR,
    dest: path.resolve(dest),
    overwrite: args.includes('--overwrite'),
  });
  console.log(`Imported ${result.buckets} buckets and ${result.events} events into ${dest}`);
}
