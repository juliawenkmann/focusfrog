// Time handling that mirrors ActivityWatch's Python implementation exactly.
// All instants are integer microseconds since the Unix epoch (UTC) and all
// durations are integer microseconds, like Python's datetime/timedelta.

export const US_PER_MS = 1000;
export const US_PER_SECOND = 1_000_000;

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

// aw_core.models._timestamp_parse keeps millisecond resolution only.
export function truncateToMs(us) {
  return us - mod(us, US_PER_MS);
}

// C round(): halves away from zero.
function roundHalfAway(value) {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

// Python's timedelta(seconds=<float>) conversion to whole microseconds,
// including its round-half-to-even on the leftover fraction.
export function secondsToMicros(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) throw new TypeError(`Invalid duration: ${seconds}`);
  const intPart = Math.trunc(value);
  const fracPart = value - intPart;
  let micros = intPart * US_PER_SECOND;
  if (fracPart === 0) return micros;
  const scaled = fracPart * US_PER_SECOND;
  const scaledInt = Math.trunc(scaled);
  const leftover = scaled - scaledInt;
  micros += scaledInt;
  if (leftover === 0) return micros;
  let whole = roundHalfAway(leftover);
  if (Math.abs(whole - leftover) === 0.5) {
    const isOdd = Math.abs(mod(micros, 2)) === 1 ? 1 : 0;
    whole = 2 * roundHalfAway((leftover + isOdd) * 0.5) - isOdd;
  }
  return micros + whole;
}

// timedelta.total_seconds()
export function microsToSeconds(us) {
  return us / US_PER_SECOND;
}

// Subset of pyiso8601's grammar used by ActivityWatch clients.
const ISO_PATTERN =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2})(?::?(\d{2}))?(?::?(\d{1,2})(?:[.,](\d+))?)?(Z|([-+])(\d{2}):?(\d{2})?)?)?$/i;

// Returns the UTC instant in microseconds plus the original UTC offset in minutes
// (pyiso8601 defaults to UTC when no zone is given).
export function parseIso(value) {
  const match = ISO_PATTERN.exec(String(value).trim());
  if (!match) throw new RangeError(`Unable to parse timestamp: ${value}`);
  const [
    ,
    year,
    month,
    day,
    hour = '0',
    minute = '0',
    second = '0',
    fraction,
    zone,
    sign,
    tzHour,
    tzMinute,
  ] = match;
  const micros = fraction ? Number(fraction.slice(0, 6).padEnd(6, '0')) : 0;
  let offsetMinutes = 0;
  if (zone && zone.toUpperCase() !== 'Z') {
    offsetMinutes = (Number(tzHour) * 60 + Number(tzMinute || 0)) * (sign === '-' ? -1 : 1);
  }
  const localMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  if (!Number.isFinite(localMs)) throw new RangeError(`Unable to parse timestamp: ${value}`);
  return { us: localMs * US_PER_MS + micros - offsetMinutes * 60 * US_PER_SECOND, offsetMinutes };
}

export function parseIsoMicros(value) {
  return parseIso(value).us;
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

// datetime.isoformat() for an aware datetime: fraction only when non-zero.
export function formatIso(us, offsetMinutes = 0) {
  const localUs = us + offsetMinutes * 60 * US_PER_SECOND;
  const ms = Math.floor(localUs / US_PER_MS);
  const date = new Date(ms);
  const micros = mod(localUs, US_PER_SECOND);
  const base =
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  const fraction = micros === 0 ? '' : `.${pad(micros, 6)}`;
  const offsetSign = offsetMinutes < 0 ? '-' : '+';
  const absOffset = Math.abs(offsetMinutes);
  return `${base}${fraction}${offsetSign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
}
