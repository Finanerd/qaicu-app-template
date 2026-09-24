// Stands in for the Qaicu host while you run `npm run dev`.
//
// A deployed app never talks to Qaicu directly: it runs in a sandboxed iframe
// with no token, and `window.QDB.call(op, params)` asks the host to run a named
// operation — list datasets, ensure one, read, save or remove rows. The host runs
// it with the permissions of whoever has the app open. This plugin recreates that
// locally so the code you write in dev is the code that ships: the same
// `window.QDB`, the same operations and parameters, the same "not ready yet"
// moment at startup.
//
// Two backends sit behind the operations:
//
//   mock (default)  answered from .qaicu-dev-data.json in this folder. No Qaicu
//                   needed, data survives restarts, `npm run dev:reset` empties it.
//   live            Set QAICU_API_KEY in .env and the same operations run against
//                   Qaicu with that API key. Real datasets. (QAICU_URL overrides
//                   the address, https://app.qaicu.ai by default.)
//
// QDB.settings and QDB.userSettings are kept in .qaicu-dev-data.json in both
// modes. Not stood in: the consent prompt (the real host asks the person the
// first time the app touches a dataset) and reports.* (they need a signed-in session).
//
// Everything here is dev-only (`apply: 'serve'`); the production build never
// includes any of it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEV_DATA_FILE = resolve(process.cwd(), '.qaicu-dev-data.json');

const QDB_PATH = '/__qaicu/qdb';
const API_PREFIX = '/api/external/';
const DEFAULT_LATENCY_MS = 120;
const DEFAULT_URL = 'https://app.qaicu.ai';

/** @param {{url?: string, apiKey?: string, companyId?: string, latencyMs?: string, chrome?: string, title?: string}} options */
export function qaicuDev(options = {}) {
  const live = Boolean(options.apiKey);
  const url = options.url || DEFAULT_URL;
  const latencyMs = clampLatency(options.latencyMs);
  const showChrome = options.chrome !== '0' && options.chrome !== 'false';
  const title = options.title || readAppTitle();
  const session = {
    user: { id: 'dev-user', name: 'Dev User', email: 'dev@example.com' },
    company: { id: options.companyId || 'dev-company', name: 'Dev Company' },
    language: 'en-US',
  };

  // Datasets in mock mode, settings in both.
  let store = null;

  return {
    name: 'qaicu-dev',
    apply: 'serve',

    configureServer(server) {
      store = new MockStore(DEV_DATA_FILE);
      const send = live ? liveBackend(url, options.apiKey) : mockBackend(store);

      server.config.logger.info(
        live
          ? `\n  Qaicu bridge: LIVE -> ${url} (X-Api-Key from .env)\n`
          : `\n  Qaicu bridge: MOCK -> ${relativeToCwd(DEV_DATA_FILE)}  (npm run dev:reset to empty)\n`,
      );

      server.middlewares.use(QDB_PATH, async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        try {
          const { op, params } = parseJson(await readBody(req)) || {};
          json(res, 200, { value: await runOperation(op, params, send, store) });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          // First in the head, exactly like the host's bootstrap.
          injectTo: 'head-prepend',
          children: bridgeScript({ session, latencyMs, saved: store ? store.settings() : {} }),
        },
        ...(showChrome
          ? [
              { tag: 'style', injectTo: 'head', children: CHROME_CSS },
              {
                tag: 'script',
                injectTo: 'body',
                children: chromeScript({ title, live, url }),
              },
            ]
          : []),
      ];
    },
  };
}

// ---------------------------------------------------------------- the bridge

/**
 * The same `window.QDB` Qaicu's app frame injects, with the postMessage hop to
 * the host replaced by a same-origin request to this dev server. `ready` starts
 * false and flips a tick later, so an app that reads data before
 * `useQaicuReady()` is true breaks here as it would in Qaicu.
 */
function bridgeScript({ session, latencyMs, saved }) {
  const inline = (value) => JSON.stringify(value ?? {}).replace(/</g, '\\u003c');
  return `(function(){
  var LATENCY = ${latencyMs};
  // Where the app runs, as Qaicu tells it: ?qaicuPlacement=widget previews it as a dashboard widget.
  var PLACEMENT = new URLSearchParams(location.search).get("qaicuPlacement") || "inapp";
  var q = window.QDB = { ready: false, placement: PLACEMENT, session: { user: null, company: null, language: "en", placement: PLACEMENT }, settings: {}, userSettings: {} };
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  // From a widget, Qaicu opens the app's own page; here that is the app in a new tab.
  q.openApp = function(){
    if (PLACEMENT !== "widget") return Promise.resolve(false);
    window.open(location.pathname, "_blank");
    return Promise.resolve(true);
  };
  // Qaicu asks the browser for the position on the app's behalf (its sandboxed frame
  // has no origin to grant it to). The dev page is an ordinary page, so it asks itself.
  q.getLocation = function(options){
    options = options || {};
    var timeout = Math.min(Math.max(Number(options.timeoutMs) || 10000, 1000), 60000);
    return new Promise(function(resolve, reject){
      if (!navigator.geolocation) return reject(new Error("This browser cannot tell the location."));
      navigator.geolocation.getCurrentPosition(function(p){
        var c = p.coords;
        resolve({ latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, altitude: c.altitude, heading: c.heading, speed: c.speed, timestamp: p.timestamp });
      }, function(e){
        reject(new Error(
          e.code === 1 ? "The person did not allow their location to be used." :
          e.code === 3 ? "The location was not found in time." :
          "The location is not available."
        ));
      }, { enableHighAccuracy: !!options.highAccuracy, timeout: timeout, maximumAge: 0 });
    });
  };
  q.call = function(op, params){
    return wait(LATENCY).then(function(){
      return fetch(${JSON.stringify(QDB_PATH)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: String(op), params: params || {} })
      });
    }).then(function(res){
      return res.json().then(function(body){
        if (!res.ok) throw new Error(body.error || "Qaicu refused the request.");
        return body.value;
      });
    });
  };
  q.putSettings = function(value){
    return q.call("settings.put", { settings: value }).then(function(){ q.settings = value; return value; });
  };
  q.putUserSettings = function(value){
    return q.call("userSettings.put", { settings: value }).then(function(){ q.userSettings = value; return value; });
  };
  // The real host sends the session and settings when it answers the frame's handshake.
  setTimeout(function(){
    q.session = Object.assign(${JSON.stringify(session)}, { placement: PLACEMENT });
    q.settings = ${inline(saved.settings)};
    q.userSettings = ${inline(saved.userSettings)};
    q.ready = true;
    window.dispatchEvent(new Event("qdb-ready"));
  }, LATENCY);
})();`;
}

// ------------------------------------------------------------ the operations

// The same operations, parameters and checks as the host's
// (Client/src/app/apps/qdb/qdb-operations.ts in Qaicu).

const NAVIGATION_PATHS = ['Finance', 'Purchases', 'SalesAndMarketing', 'Production', 'HR', 'Files', 'Registers'];

const datasetPath = (name) => `${API_PREFIX}datasets/${encodeURIComponent(name)}`;

const OPERATIONS = {
  'datasets.list': async (_params, send) => {
    const datasets = (await send('GET', `${API_PREFIX}datasets`)) || [];
    return datasets.map((d) => ({
      name: d.name,
      description: d.description || '',
      rowCount: d.rowCount,
      dimensions: (d.dimensionSettings || []).map((dim) => ({
        name: dim.name,
        type: dim.type,
        isMainDateDimension: dim.isMainDateDimension,
        values: dim.values && dim.values.length ? dim.values : undefined,
      })),
    }));
  },

  'datasets.ensure': async (params, send) => {
    const dataset = text(params, 'dataset');
    const navigationPath = optionalText(params, 'navigationPath');
    if (navigationPath && !NAVIGATION_PATHS.includes(navigationPath)) {
      throw new Error(`"${navigationPath}" is not a navigation section. Use one of: ${NAVIGATION_PATHS.join(', ')}.`);
    }
    await send('PUT', datasetPath(dataset), {
      name: dataset,
      description: optionalText(params, 'description') || '',
      navigationPath,
      dimensionSettings: list(params, 'dimensions'),
    });
  },

  'rows.list': async (params, send) => {
    const dataset = text(params, 'dataset');
    const take = clamp(Number(params.take) || 1000, 1, 1000);
    const skip = Math.max(Math.floor(Number(params.skip)) || 0, 0);
    const data = await send('GET', `${datasetPath(dataset)}/rows?take=${take}&skip=${skip}`);
    return (data && data.rows) || [];
  },

  'rows.save': async (params, send) => {
    const dataset = text(params, 'dataset');
    await send('POST', `${datasetPath(dataset)}/rows`, { rows: list(params, 'rows'), filterLogic: 'ByModifiedDate' });
  },

  'rows.remove': async (params, send) => {
    const dataset = text(params, 'dataset');
    await send('POST', `${datasetPath(dataset)}/rows/delete`, { externalIds: list(params, 'externalIds') });
  },

  'settings.put': async (params, _send, store) => store.putSettings('settings', settingsObject(params)),

  'userSettings.put': async (params, _send, store) => store.putSettings('userSettings', settingsObject(params)),
};

const MAX_SETTINGS_BYTES = 64 * 1024;

function settingsObject(params) {
  const value = params.settings;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('"settings" must be an object.');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SETTINGS_BYTES) {
    throw new Error(`Settings must be at most ${MAX_SETTINGS_BYTES / 1024} kB.`);
  }
  return value;
}

function runOperation(op, params, send, store) {
  const operation = typeof op === 'string' ? OPERATIONS[op] : undefined;
  if (!operation) {
    if (typeof op === 'string' && op.startsWith('reports.')) {
      throw new Error(`${op} needs a signed-in Qaicu session and does not run in the dev stand-in.`);
    }
    throw new Error(
      `"${String(op)}" is not something a Qaicu app can do. Available: ${[
        ...Object.keys(OPERATIONS),
        'reports.list',
        'reports.run',
      ].join(', ')}.`,
    );
  }
  return operation(params && typeof params === 'object' ? params : {}, send, store);
}

function text(params, key) {
  const value = params[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`"${key}" is required.`);
  return value;
}

function optionalText(params, key) {
  const value = params[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function list(params, key) {
  const value = params[key];
  if (!Array.isArray(value)) throw new Error(`"${key}" must be a list.`);
  return value;
}

// ------------------------------------------------------------- the backends

function liveBackend(baseUrl, apiKey) {
  return async (method, path, body) => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        'X-Api-Key': apiKey,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Qaicu API ${response.status}: ${text}`);
    return text ? JSON.parse(text) : undefined;
  };
}

function mockBackend(store) {
  return async (method, path, body) => {
    const { status, body: payload } = store.request(method, path, body);
    if (status >= 400) {
      throw new Error(`Qaicu API ${status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
    }
    return payload;
  };
}

// ------------------------------------------------------------- the dev chrome

// A slim stand-in for the frame Qaicu draws around an app: it shows the app's
// name (which is why an app must not render its own title) and lets you flip the
// host theme, since the host injects its live theme over the app's defaults and
// a hardcoded colour only becomes visible when it does.
const CHROME_CSS = `
#qaicu-dev-bar {
  position: fixed; top: 0; left: 0; right: 0; height: 34px; z-index: 2147483000;
  display: flex; align-items: center; gap: .75rem; padding: 0 .75rem;
  background: var(--card); color: var(--card-foreground);
  border-bottom: 1px solid var(--border);
  font: 500 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
#qaicu-dev-bar .qd-title { font-weight: 650; }
#qaicu-dev-bar .qd-badge {
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px;
  color: var(--muted-foreground);
}
#qaicu-dev-bar .qd-spacer { flex: 1; }
#qaicu-dev-bar button {
  font: inherit; cursor: pointer; padding: 3px 10px; border-radius: 999px;
  background: var(--secondary); color: var(--secondary-foreground);
  border: 1px solid var(--border);
}
body { padding-top: 34px; }

/* Both palettes in full, like the host, which re-injects its complete theme over
   whatever the app shipped; overriding only one would leave apps whose own
   defaults are the other theme unable to switch. */
html[data-qaicu-theme="light"] {
  --background: hsl(220 14% 96%); --foreground: hsl(224 10% 10%);
  --card: hsl(0 0% 100%); --card-foreground: hsl(224 10% 10%);
  --popover: hsl(0 0% 100%); --popover-foreground: hsl(224 10% 10%);
  --primary: hsl(20.5 90.2% 48.2%); --primary-foreground: hsl(0 0% 99%);
  --secondary: hsl(220 13% 91%); --secondary-foreground: hsl(224 10% 10%);
  --muted: hsl(220 13% 89%); --muted-foreground: hsl(220 6% 40%);
  --accent: hsl(20 25% 95%); --accent-foreground: hsl(224 10% 10%);
  --destructive: hsl(0 84.2% 60.2%); --destructive-foreground: hsl(0 0% 98%);
  --border: hsl(220 13% 83%); --input: hsl(220 13% 83%);
  --ring: hsl(20.5 90.2% 48.2%);
  --chart-1: hsl(220 70% 50%); --chart-2: hsl(160 60% 45%);
  --chart-3: hsl(30 80% 55%); --chart-4: hsl(280 65% 60%);
  --chart-5: hsl(340 75% 55%);
}
html[data-qaicu-theme="dark"] {
  --background: hsl(220 14% 7%); --foreground: hsl(0 0% 95%);
  --card: hsl(220 14% 12%); --card-foreground: hsl(0 0% 95%);
  --popover: hsl(220 14% 14%); --popover-foreground: hsl(0 0% 95%);
  --primary: hsl(28 92% 54%); --primary-foreground: hsl(0 0% 95%);
  --secondary: hsl(220 12% 18%); --secondary-foreground: hsl(0 0% 95%);
  --muted: hsl(220 12% 18%); --muted-foreground: hsl(0 0% 85%);
  --accent: hsl(220 12% 18%); --accent-foreground: hsl(0 0% 95%);
  --destructive: hsl(0 72% 50%); --destructive-foreground: hsl(0 0% 95%);
  --border: hsl(220 10% 24%); --input: hsl(220 12% 18%);
  --ring: hsl(172 84% 45%);
  --chart-1: hsl(172 84% 45%); --chart-2: hsl(255 85% 60%);
  --chart-3: hsl(28 92% 54%); --chart-4: hsl(212 86% 55%);
  --chart-5: hsl(340 80% 60%);
}
html[data-qaicu-theme] body { background: var(--background); color: var(--foreground); }`;

function chromeScript({ title, live, url }) {
  const source = live ? `live · ${url}` : 'mock data';
  return `(function(){
  var KEY = "qaicu-dev-theme";
  var bar = document.createElement("div");
  bar.id = "qaicu-dev-bar";
  bar.innerHTML = ${JSON.stringify(
    `<span class="qd-title"></span><span class="qd-badge">${escapeHtml(source)}</span>` +
      '<span class="qd-spacer"></span><button type="button" id="qaicu-dev-theme"></button>',
  )};
  bar.querySelector(".qd-title").textContent = ${JSON.stringify(title)};
  document.body.appendChild(bar);
  var button = bar.querySelector("#qaicu-dev-theme");
  function apply(theme){
    document.documentElement.setAttribute("data-qaicu-theme", theme);
    button.textContent = theme === "light" ? "Light theme" : "Dark theme";
  }
  apply(localStorage.getItem(KEY) || "dark");
  button.addEventListener("click", function(){
    var next = document.documentElement.getAttribute("data-qaicu-theme") === "light" ? "dark" : "light";
    localStorage.setItem(KEY, next);
    apply(next);
  });
})();`;
}

// ------------------------------------------------------------------ mock mode

/**
 * The part of Qaicu's dataset API the operations use, backed by a JSON file.
 * The shapes and the error cases mirror ExternalDatasetEndpoints.cs — notably
 * that reading or writing a dataset that was never ensured is a 404, so an app
 * that forgets to declare its schema fails here rather than in production.
 */
class MockStore {
  constructor(file) {
    this.file = file;
    this.data = this.#load();
  }

  #load() {
    const empty = { datasets: {}, settings: {}, userSettings: {} };
    if (!existsSync(this.file)) return empty;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return parsed && typeof parsed === 'object' ? { ...empty, ...parsed } : empty;
    } catch {
      // A hand-edited file that no longer parses should not take the dev server
      // down; start clean and let the next write replace it.
      return empty;
    }
  }

  settings() {
    return { settings: this.data.settings, userSettings: this.data.userSettings };
  }

  putSettings(kind, value) {
    this.data[kind] = value;
    this.#save();
  }

  #save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  #find(name) {
    const key = Object.keys(this.data.datasets).find(
      (k) => k.toLowerCase() === String(name).toLowerCase(),
    );
    return key ? this.data.datasets[key] : null;
  }

  /** @returns {{ status: number, body?: unknown }} */
  request(method, path, body) {
    const url = new URL(path, 'http://localhost');
    const segments = url.pathname.slice(API_PREFIX.length).split('/').filter(Boolean);
    const name = segments[1] ? decodeURIComponent(segments[1]) : null;
    const tail = segments.slice(2).join('/');

    if (segments[0] === 'datasets') {
      if (!name && method === 'GET') {
        return { status: 200, body: Object.values(this.data.datasets).map(toDatasetResponse) };
      }
      if (name && !tail && method === 'PUT') return this.#putDataset(name, body);
      if (tail === 'rows' && method === 'GET') return this.#getRows(name, url.searchParams);
      if (tail === 'rows' && method === 'POST') return this.#upsertRows(name, body);
      if (tail === 'rows/delete' && method === 'POST') return this.#deleteRows(name, body);
    }
    return { status: 404, body: `The Qaicu dev mock does not implement ${method} ${url.pathname}` };
  }

  #putDataset(name, body) {
    if (!body || typeof body !== 'object') return { status: 400, body: 'Body is required' };

    const existing = this.#find(name);
    const incoming = Array.isArray(body.dimensionSettings) ? body.dimensionSettings : [];
    const invalid = incoming.find((d) => !d || !d.name || !DIMENSION_TYPES.includes(d.type));
    if (invalid) {
      return {
        status: 400,
        body: `Every dimension needs a name and a type of ${DIMENSION_TYPES.join(' | ')} (got ${JSON.stringify(invalid)})`,
      };
    }

    // Merge by name: dimensions the request omits are preserved, same as the
    // real endpoint, so a PUT can add a column without dropping the others.
    const dataset = existing || { name, description: '', dimensionSettings: [], rows: [] };
    dataset.description = body.description ?? dataset.description;
    for (const dimension of incoming) {
      const at = dataset.dimensionSettings.findIndex((d) => d.name === dimension.name);
      if (at === -1) dataset.dimensionSettings.push(dimension);
      else dataset.dimensionSettings[at] = { ...dataset.dimensionSettings[at], ...dimension };
    }

    this.data.datasets[dataset.name] = dataset;
    this.#save();
    return { status: existing ? 200 : 201, body: toDatasetResponse(dataset) };
  }

  #getRows(name, params) {
    const dataset = this.#find(name);
    if (!dataset) return { status: 404, body: `Dataset with name '${name}' not found` };

    const take = clamp(parseInt(params.get('take') || '100', 10) || 100, 1, 1000);
    const skip = Math.max(parseInt(params.get('skip') || '0', 10) || 0, 0);

    // Newest first, like the real endpoint — an app that assumes insertion order
    // should notice that here and not after deploying.
    const ordered = [...dataset.rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const page = ordered.slice(skip, skip + take);

    return {
      status: 200,
      body: {
        datasetName: dataset.name,
        totalCount: dataset.rows.length,
        returnedCount: page.length,
        offset: skip,
        rows: page,
      },
    };
  }

  #upsertRows(name, body) {
    const dataset = this.#find(name);
    if (!dataset) return { status: 404, body: `Dataset with name '${name}' not found` };
    if (!body || !Array.isArray(body.rows) || body.rows.length === 0) {
      return { status: 400, body: 'At least one row is required' };
    }

    const now = new Date().toISOString();
    for (const row of body.rows) {
      if (!row || !row.externalId) return { status: 400, body: 'Every row needs an externalId' };
      const values = stringifyValues(row.dimensionValues);
      const at = dataset.rows.findIndex((r) => r.externalId === row.externalId);
      if (at === -1) {
        dataset.rows.push({ externalId: row.externalId, dimensionValues: values, createdAt: now, updatedAt: now });
      } else {
        dataset.rows[at] = { ...dataset.rows[at], dimensionValues: values, updatedAt: now };
      }
    }

    this.#save();
    return { status: 200 };
  }

  #deleteRows(name, body) {
    const dataset = this.#find(name);
    if (!dataset) return { status: 404, body: `Dataset with name '${name}' not found` };
    const ids = body && Array.isArray(body.externalIds) ? body.externalIds : [];
    if (ids.length === 0) return { status: 400, body: 'At least one ExternalId is required' };

    dataset.rows = dataset.rows.filter((r) => !ids.includes(r.externalId));
    this.#save();
    return { status: 200 };
  }
}

const DIMENSION_TYPES = ['Date', 'Number', 'Text', 'Select'];

function toDatasetResponse(dataset) {
  return {
    name: dataset.name,
    description: dataset.description || '',
    dimensionSettings: dataset.dimensionSettings,
    rowCount: dataset.rows.length,
  };
}

/** Qaicu stores every dimension value as a string; the mock must not be laxer. */
function stringifyValues(values) {
  const out = {};
  for (const [key, value] of Object.entries(values || {})) out[key] = value == null ? '' : String(value);
  return out;
}

// ---------------------------------------------------------------- small utils

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampLatency(raw) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 5000) : DEFAULT_LATENCY_MS;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function relativeToCwd(file) {
  return file.startsWith(process.cwd()) ? file.slice(process.cwd().length + 1) : file;
}

/** The app name shown in the dev chrome. */
function readAppTitle() {
  try {
    const parsed = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    if (parsed.name) return String(parsed.name);
  } catch {
    // package.json is not required for `vite dev` to work.
  }
  return 'Qaicu app';
}
