// Port of ActivityWatch's query2 language (aw-core/aw_query), including its
// parser quirks, so the queries FocusFrog's pages send keep the same meaning.
import { formatIso, parseIso } from './aw-time.mjs';
import {
  categorize,
  chunkEventsByKey,
  concat,
  filterKeyvals,
  filterKeyvalsRegex,
  filterPeriodIntersect,
  flood,
  limitEvents,
  mergeEventsByKeys,
  periodUnion,
  Rule,
  simplifyString,
  sortByDuration,
  sortByTimestamp,
  splitUrlEvents,
  sumDurations,
  tag,
  unionNoOverlap,
} from './aw-transforms.mjs';

export class QueryException extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
  }
}

const parseError = message => new QueryException('QueryParseException', message);
const interpretError = message => new QueryException('QueryInterpretException', message);
const functionError = message => new QueryException('QueryFunctionException', message);

const isAlpha = char => /^\p{L}$/u.test(char);
const isDigit = char => /^\p{Nd}$/u.test(char);

// --- Functions (aw_query/functions.py) -------------------------------------------------

const list = name => ({ name, type: 'list' });
const str = name => ({ name, type: 'str' });
const int = name => ({ name, type: 'int' });
const optional = name => ({ name, optional: true });

function verifyBucketExists(datastore, bucketId) {
  if (!datastore.hasBucket(bucketId)) throw functionError(`There's no bucket named '${bucketId}'`);
}

function namespaceRange(namespace) {
  try {
    return { start: parseIso(namespace.STARTTIME).us, end: parseIso(namespace.ENDTIME).us };
  } catch (err) {
    throw functionError('Unable to parse starttime/endtime for query_bucket');
  }
}

const toRules = classes => classes.map(([category, rule]) => [category, new Rule(rule)]);

export const FUNCTIONS = {
  find_bucket: {
    params: [str('filter_str'), optional('hostname')],
    run({ datastore }, filterStr, hostname = null) {
      for (const bucket of datastore.bucketList()) {
        if (bucket.id.includes(filterStr)) {
          if (!hostname || bucket.hostname === hostname) return bucket.id;
        }
      }
      throw functionError(
        `Unable to find bucket matching '${filterStr}' (hostname filter set to '${hostname}')`
      );
    },
  },
  query_bucket: {
    params: [str('bucketname')],
    run({ datastore, namespace }, bucketId) {
      verifyBucketExists(datastore, bucketId);
      return datastore.getEvents(bucketId, namespaceRange(namespace));
    },
  },
  query_bucket_eventcount: {
    params: [str('bucketname')],
    run({ datastore, namespace }, bucketId) {
      verifyBucketExists(datastore, bucketId);
      return datastore.getEventCount(bucketId, namespaceRange(namespace));
    },
  },
  filter_keyvals: {
    params: [list('events'), str('key'), list('vals')],
    run: (ctx, events, key, vals) => filterKeyvals(events, key, vals, false),
  },
  exclude_keyvals: {
    params: [list('events'), str('key'), list('vals')],
    run: (ctx, events, key, vals) => filterKeyvals(events, key, vals, true),
  },
  filter_keyvals_regex: {
    params: [list('events'), str('key'), str('regex')],
    run: (ctx, events, key, regex) => filterKeyvalsRegex(events, key, regex),
  },
  filter_period_intersect: {
    params: [list('events'), list('filterevents')],
    run: (ctx, events, filterEvents) => filterPeriodIntersect(events, filterEvents),
  },
  period_union: {
    params: [list('events1'), list('events2')],
    run: (ctx, events1, events2) => periodUnion(events1, events2),
  },
  limit_events: {
    params: [list('events'), int('count')],
    run: (ctx, events, count) => limitEvents(events, Number(count)),
  },
  merge_events_by_keys: {
    params: [list('events'), list('keys')],
    run: (ctx, events, keys) => mergeEventsByKeys(events, keys),
  },
  chunk_events_by_key: {
    params: [list('events'), str('key')],
    run: (ctx, events, key) => chunkEventsByKey(events, key),
  },
  sort_by_timestamp: { params: [list('events')], run: (ctx, events) => sortByTimestamp(events) },
  sort_by_duration: { params: [list('events')], run: (ctx, events) => sortByDuration(events) },
  sum_durations: { params: [list('events')], run: (ctx, events) => sumDurations(events) },
  concat: {
    params: [list('events1'), list('events2')],
    run: (ctx, events1, events2) => concat(events1, events2),
  },
  union_no_overlap: {
    params: [list('events1'), list('events2')],
    run: (ctx, events1, events2) => unionNoOverlap(events1, events2),
  },
  flood: { params: [list('events')], run: (ctx, events) => flood(events) },
  split_url_events: { params: [list('events')], run: (ctx, events) => splitUrlEvents(events) },
  simplify_window_titles: {
    params: [list('events'), str('key')],
    run: (ctx, events, key) => simplifyString(events, key),
  },
  nop: { params: [], run: () => 1 },
  categorize: {
    params: [list('events'), list('classes')],
    run: (ctx, events, classes) => categorize(events, toRules(classes)),
  },
  tag: {
    params: [list('events'), list('classes')],
    run: (ctx, events, classes) => tag(events, toRules(classes)),
  },
};

// --- Tokens ----------------------------------------------------------------------

const QString = {
  check(string) {
    const quote = string[0];
    if (quote !== '"' && quote !== "'") return ['', string];
    let token = quote;
    let prev = null;
    for (const char of string.slice(1)) {
      token += char;
      if (char === quote && prev !== '\\') break;
      prev = char;
    }
    if (token[token.length - 1] !== quote || token.length < 2)
      throw parseError('Failed to parse string');
    return [token, string.slice(token.length)];
  },
  parse(string) {
    const quote = string[0];
    const value = string.split(`\\${quote}`).join(quote).slice(1, -1);
    return { interpret: () => value, kind: 'string', value };
  },
};

const QInteger = {
  check(string) {
    let token = '';
    for (const char of string) {
      if (isDigit(char)) token += char;
      else break;
    }
    return [token, string.slice(token.length)];
  },
  parse(string) {
    const value = Number.parseInt(string, 10);
    return { interpret: () => value, kind: 'int' };
  },
};

const QVariable = {
  check(string) {
    let token = '';
    let index = 0;
    for (const char of string) {
      if (isAlpha(char) || char === '_') token += char;
      else if (index !== 0 && isDigit(char)) token += char;
      else break;
      index += 1;
    }
    return [token, string.slice(token.length)];
  },
  parse(string, namespace) {
    const name = string;
    const value = Object.prototype.hasOwnProperty.call(namespace, name) ? namespace[name] : null;
    return {
      kind: 'variable',
      name,
      interpret(datastore, ns) {
        if (!Object.prototype.hasOwnProperty.call(ns, name)) {
          throw interpretError(`Tried to reference variable '${name}' which is not defined`);
        }
        ns[name] = value;
        return value;
      },
    };
  },
};

// Scans a bracketed construct the way query2.py does (quote-aware depth count).
function scanBalanced(string, startIndex, open, close) {
  let i = startIndex;
  let depth = 1;
  let single = false;
  let double = false;
  let prev = null;
  while (i < string.length) {
    const char = string[i];
    i += 1;
    if (char === "'" && prev !== '\\' && !double) single = !single;
    else if (char === '"' && prev !== '\\' && !single) double = !double;
    else if (single || double) {
      // inside a string literal
    } else if (char === close) depth -= 1;
    else if (char === open) depth += 1;
    if (depth === 0) break;
    prev = char;
  }
  return { end: i, depth };
}

const QFunction = {
  check(string) {
    let i = 0;
    let found = false;
    while (i < string.length) {
      const char = string[i];
      if (isAlpha(char) || char === '_') i += 1;
      else if (i !== 0 && isDigit(char)) i += 1;
      else if (char === '(') {
        i += 1;
        found = true;
        break;
      } else break;
    }
    if (!found) return [null, string];
    const { end, depth } = scanBalanced(string, i, '(', ')');
    if (depth !== 0) return [null, string];
    // Like upstream, the character right after ')' is consumed as well.
    return [string.slice(0, end), string.slice(end + 1)];
  },
  parse(string, namespace) {
    const open = string.indexOf('(');
    const nameEnd = open === -1 ? string.length : open;
    const name = string.slice(0, nameEnd);
    const args = [];
    let argsStr = string.slice(nameEnd + 1, string.length - 1);
    while (argsStr) {
      const [[argType, arg], rest] = parseToken(argsStr, namespace);
      argsStr = rest;
      const comma = argsStr.indexOf(',');
      if (comma !== -1) argsStr = argsStr.slice(comma + 1);
      args.push(argType.parse(arg, namespace));
    }
    return {
      kind: 'function',
      interpret(datastore, ns) {
        const fn = FUNCTIONS[name];
        if (!fn) throw interpretError(`Tried to call function '${name}' which doesn't exist`);
        const values = args.map(arg => arg.interpret(datastore, ns));
        if (
          values.length < fn.params.filter(param => !param.optional).length ||
          values.length > fn.params.length
        ) {
          throw interpretError(`Tried to call function ${name} with invalid amount of arguments`);
        }
        fn.params.forEach((param, index) => {
          if (param.optional || !param.type) return;
          if (!matchesType(values[index], param.type)) {
            throw functionError(
              `Variable '${JSON.stringify(
                values[index]
              )}' passed to function call is of invalid type. Expected ${param.type}`
            );
          }
        });
        try {
          return fn.run({ datastore, namespace: ns }, ...values);
        } catch (err) {
          // Python reports any TypeError raised inside a query function this way.
          if (err instanceof TypeError) {
            throw interpretError(`Tried to call function ${name} with invalid amount of arguments`);
          }
          throw err;
        }
      },
    };
  },
};

const QDict = {
  check(string) {
    if (string[0] !== '{') return [null, string];
    const { end } = scanBalanced(string, 1, '{', '}');
    return [string.slice(0, end), string.slice(end + 1)];
  },
  parse(string, namespace) {
    let entries = string.slice(1, -1);
    const pairs = [];
    while (entries.length > 0) {
      entries = entries.trim();
      if (pairs.length > 0 && entries[0] === ',') entries = entries.slice(1);
      const [[keyType, keyStr], afterKey] = parseToken(entries, namespace);
      if (keyType !== QString) throw parseError('Key in dict is not a str');
      const key = QString.parse(keyStr).value;
      entries = afterKey.trim();
      if (entries[0] !== ':') throw parseError('Key in dict is not followed by a :');
      entries = entries.slice(1);
      const [[valueType, valueStr], afterValue] = parseToken(entries, namespace);
      if (!valueType) throw parseError('Dict expected a value, got nothing');
      pairs.push([key, valueType.parse(valueStr, namespace)]);
      entries = afterValue;
    }
    return {
      kind: 'dict',
      interpret(datastore, ns) {
        const result = {};
        for (const [key, value] of pairs) result[key] = value.interpret(datastore, ns);
        return result;
      },
    };
  },
};

const QList = {
  check(string) {
    if (string[0] !== '[') return [null, string];
    const { end } = scanBalanced(string, 1, '[', ']');
    return [string.slice(0, end), string.slice(end + 1)];
  },
  parse(string, namespace) {
    let entries = string.slice(1, -1);
    const items = [];
    while (entries.length > 0) {
      entries = entries.trim();
      if (items.length > 0 && entries[0] === ',') entries = entries.slice(1);
      const [[valueType, valueStr], rest] = parseToken(entries, namespace);
      if (!valueType) throw parseError('List expected a value, got nothing');
      items.push(valueType.parse(valueStr, namespace));
      entries = rest;
    }
    return {
      kind: 'list',
      interpret: (datastore, ns) => items.map(item => item.interpret(datastore, ns)),
    };
  },
};

const QTYPES = [QString, QInteger, QFunction, QDict, QList, QVariable];

function parseToken(input, namespace) {
  if (typeof input !== 'string') {
    throw parseError("Reached unreachable, cannot parse something that isn't a string");
  }
  if (input.length === 0) return [[null, ''], input];
  let string = input.trim();
  let token = null;
  let type = null;
  for (const candidate of QTYPES) {
    type = candidate;
    [token, string] = candidate.check(string);
    if (token) break;
  }
  if (!token) throw parseError(`Syntax error: ${string}`);
  return [[type, token], string];
}

function matchesType(value, type) {
  if (type === 'list') return Array.isArray(value);
  if (type === 'str') return typeof value === 'string';
  if (type === 'int') return Number.isInteger(value) || typeof value === 'boolean';
  return true;
}

// --- Statements -----------------------------------------------------------------------

function splitStatements(query) {
  const statements = [];
  let current = '';
  let single = false;
  let double = false;
  let prev = null;
  for (const char of query) {
    if (char === "'" && prev !== '\\' && !double) {
      single = !single;
      current += char;
    } else if (char === '"' && prev !== '\\' && !single) {
      double = !double;
      current += char;
    } else if (char === ';' && !single && !double) {
      statements.push(current);
      current = '';
    } else {
      current += char;
    }
    prev = char;
  }
  if (current) statements.push(current);
  return statements;
}

function parseStatement(line, namespace) {
  const separator = line.indexOf('=');
  const varStr = separator === -1 ? line.slice(0, -1) : line.slice(0, separator);
  const valStr = line.slice(separator + 1);
  if (!valStr) throw parseError('Nothing to assign');
  const [[varType, varToken], varRest] = parseToken(varStr, namespace);
  if (varRest.trim()) throw parseError('Invalid syntax for assignment variable');
  if (varType !== QVariable) throw parseError('Cannot assign to a non-variable');
  const [[valType, valToken], valRest] = parseToken(valStr, namespace);
  if (valRest) throw parseError('Invalid syntax for value to assign');
  return [QVariable.parse(varToken, namespace), valType.parse(valToken, namespace)];
}

// Runs one query over one time period, like aw_query.query2.query().
export function runQuery(name, queryText, start, end, datastore) {
  const namespace = {
    True: true,
    False: false,
    true: true,
    false: false,
    NAME: name,
    STARTTIME: formatIso(start.us, start.offsetMinutes),
    ENDTIME: formatIso(end.us, end.offsetMinutes),
  };
  for (const raw of splitStatements(queryText)) {
    const statement = raw.trim();
    if (!statement) continue;
    const [variable, value] = parseStatement(statement, namespace);
    namespace[variable.name] = value.interpret(datastore, namespace);
  }
  if (!Object.prototype.hasOwnProperty.call(namespace, 'RETURN')) {
    throw parseError("Query doesn't assign the RETURN variable, nothing to respond");
  }
  return namespace.RETURN;
}

// POST /api/0/query/ body handling (aw_server.api.query2).
export function runQueries(name, queryParts, timeperiods, datastore) {
  const queryText = Array.isArray(queryParts) ? queryParts.join('') : String(queryParts);
  return timeperiods.map(timeperiod => {
    const period = String(timeperiod).split('/').slice(0, 2);
    if (period.length !== 2) {
      throw new QueryException(
        'QueryException',
        `Invalid timeperiod '${timeperiod}': expected two ISO8601 datetimes separated by a slash (start/end)`
      );
    }
    let start;
    let end;
    try {
      start = parseIso(period[0]);
      end = parseIso(period[1]);
    } catch (err) {
      throw new QueryException(
        'QueryException',
        `Invalid timeperiod '${timeperiod}': ${err.message}`
      );
    }
    return runQuery(name, queryText, start, end, datastore);
  });
}
