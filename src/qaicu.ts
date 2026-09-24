// Ready-made Qaicu data access — import these helpers and call them. The app runs
// in a sandboxed iframe and the Qaicu host
// injects `window.QDB` before the app's code runs. `QDB.call(op, params)` names an
// operation ("rows.list", "rows.save", …) and the host runs it with the
// permissions of whoever has the app open, asking them first for any dataset the
// app has not been allowed yet. No token, URL or company id ever reaches the app.
//
// Data model: a Dataset (table) holds Rows. Each row has a stable `externalId`
// (your upsert key) and a `dimensionValues` map of { columnName: stringValue }.
// ALL values are strings — dates as "YYYY-MM-DD", numbers as plain strings
// like "12.5".

export interface QaicuRow {
  externalId: string;
  dimensionValues: Record<string, string>;
  /** Set by Qaicu on the rows it returns. */
  createdAt?: string;
  updatedAt?: string;
}

export type DimensionType = 'Date' | 'Number' | 'Text' | 'Select';

export interface DimensionSetting {
  name: string;
  type: DimensionType;
  /** Mark exactly one Date dimension as the main one for time-based datasets. */
  isMainDateDimension?: boolean;
  /** Allowed options for a Select dimension. */
  values?: { name: string }[];
  /** Unit hint for a Number dimension, e.g. 'Quantity' or 'Currency'. */
  unit?: string;
  /** Joins this dimension to another dataset, e.g. a Customer column to Partners.Name. */
  datasetLinks?: {
    linkedDatasetName: string;
    linkedDimensionName: string;
    bidirectional?: boolean;
  }[];
}

/** Where the dataset appears in Qaicu's navigation tree. */
export type NavigationPath =
  | 'Finance'
  | 'Purchases'
  | 'SalesAndMarketing'
  | 'Production'
  | 'HR'
  | 'Files'
  | 'Registers';

/** A position from `getLocation()`. */
export interface QaicuLocation {
  /** Degrees. */
  latitude: number;
  longitude: number;
  /** Metres, at 68 % confidence. Kilometres on a desktop (IP-based), metres on a phone. */
  accuracy: number;
  /** Metres, or null. */
  altitude: number | null;
  /** Degrees clockwise from north, or null. */
  heading: number | null;
  /** m/s, or null. */
  speed: number | null;
  /** Milliseconds since the epoch. */
  timestamp: number;
}

export interface LocationOptions {
  /** GPS precision at the cost of battery and delay. Default false. */
  highAccuracy?: boolean;
  /** Default 10000; the host clamps it to 1000–60000. */
  timeoutMs?: number;
}

/** Where the app is running: its own page, a dashboard widget, or filling the window. */
export type Placement = 'inapp' | 'widget' | 'fullscreen';

/** Who has the app open. */
export interface QaicuSession {
  user: { id: string; name: string; email: string } | null;
  company: { id: string; name: string } | null;
  language: string;
  /** Set by hosts that tell the app where it runs. */
  placement?: Placement;
}

export interface DatasetInfo {
  name: string;
  description: string;
  rowCount: number;
  dimensions: DimensionSetting[];
}

export type ReportPreset =
  | 'DateRange'
  | 'YearToDate'
  | 'CurrentMonth'
  | 'CurrentFiscalYear'
  | 'PreviousFiscalYear'
  | 'NextFiscalYear'
  | 'LockDate';

/** A saved report's period: `from`/`to` as YYYY-MM-DD, or a preset. */
export interface ReportPeriod {
  from?: string;
  to?: string;
  preset?: ReportPreset;
}

export interface ReportResult {
  id: string;
  name: string;
  /** Leaf period columns in order; `group` is the parent period (e.g. the year). */
  columns: { key: string; label: string; group: string }[];
  /** Rows depth-first; `level` 0 is the top. `values` is keyed by column key. */
  lines: {
    key: string;
    label: string;
    level: number;
    values: Record<string, number>;
    total: number;
    isFormula: boolean;
  }[];
}

interface QdbBridge {
  ready: boolean;
  /** Known before the app runs, unlike the session. Absent on older hosts. */
  placement?: Placement;
  session: QaicuSession;
  /** From a dashboard widget, opens the app's own page; resolves false elsewhere. */
  openApp?: () => Promise<boolean>;
  /** The viewer's position, asked by the host. Absent on older hosts. */
  getLocation?: (options?: LocationOptions) => Promise<QaicuLocation>;
  /** Shared by everyone in the company who uses the app. */
  settings: Record<string, unknown>;
  /** The viewer's own. */
  userSettings: Record<string, unknown>;
  call: (op: string, params?: Record<string, unknown>) => Promise<unknown>;
  putSettings: (value: object) => Promise<unknown>;
  putUserSettings: (value: object) => Promise<unknown>;
}

declare global {
  interface Window {
    QDB?: QdbBridge;
  }
}

const NO_SESSION: QaicuSession = { user: null, company: null, language: 'en' };

/** True once the host bridge is injected and ready (false during offline build). */
export function isQaicuAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.QDB?.ready;
}

/**
 * Run `cb` once the host bridge is ready. Fires immediately if it already is.
 * Prefer the `useQaicuReady` hook in React components.
 */
export function onQaicuReady(cb: () => void): void {
  if (typeof window === 'undefined') return;
  if (window.QDB?.ready) {
    cb();
    return;
  }
  window.addEventListener('qdb-ready', cb, { once: true });
}

/** Who has the app open. Empty until the bridge is ready. */
export function getSession(): QaicuSession {
  return (typeof window !== 'undefined' && window.QDB?.session) || NO_SESSION;
}

/**
 * Where the app is running, or null when the host does not say (an older Qaicu).
 * Available before the bridge is ready. An app loaded from its own address
 * gets it as the `qaicuPlacement` query parameter instead.
 */
export function getPlacement(): Placement | null {
  if (typeof window === 'undefined') return null;
  const placement =
    window.QDB?.placement ??
    new URLSearchParams(window.location.search).get('qaicuPlacement');
  return placement === 'inapp' || placement === 'widget' || placement === 'fullscreen'
    ? placement
    : null;
}

/** True where `openApp()` does something: in a dashboard widget, on a host that supports it. */
export function canOpenApp(): boolean {
  return getPlacement() === 'widget' && typeof window.QDB?.openApp === 'function';
}

/** From a dashboard widget, opens the app's own page. Resolves whether it did. */
export function openApp(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.QDB?.openApp) return Promise.resolve(false);
  return window.QDB.openApp();
}

/**
 * The viewer's position, asked through the host: the app's sandboxed frame has
 * no origin of its own, so the browser refuses it `navigator.geolocation`.
 *
 * Ask only where the person does something that needs it — the browser shows a
 * permission prompt the first time — and ALWAYS handle the rejection, which is
 * common: offer another way (an address or place search). `error.message` is
 * readable as is. One reading per call; ask again when a fresh one is needed,
 * never in a tight loop. Waits for the bridge to be ready.
 */
export function getLocation(options: LocationOptions = {}): Promise<QaicuLocation> {
  if (typeof window === 'undefined' || !window.QDB) {
    return Promise.reject(new Error('Qaicu bridge is not available yet'));
  }
  return new Promise<void>((resolve) => onQaicuReady(resolve)).then(() => {
    const bridge = window.QDB;
    if (!bridge?.getLocation) throw new Error('This Qaicu cannot tell the location yet.');
    return bridge.getLocation(options);
  });
}

/** The app's own settings, shared by everyone in the company who uses it; {} until set. */
export function getSettings<T extends object = Record<string, unknown>>(): T {
  return ((typeof window !== 'undefined' && window.QDB?.settings) || {}) as T;
}

/** The settings of whoever has the app open; {} until set. */
export function getUserSettings<T extends object = Record<string, unknown>>(): T {
  return ((typeof window !== 'undefined' && window.QDB?.userSettings) || {}) as T;
}

/** Replaces the app's shared settings with `value`, a JSON object of at most 64 kB. */
export function putSettings(value: object): Promise<void> {
  if (typeof window === 'undefined' || !window.QDB?.putSettings) {
    return Promise.reject(new Error('Qaicu bridge is not available yet'));
  }
  return window.QDB.putSettings(value).then(() => undefined);
}

/** Replaces the viewer's own settings with `value`, a JSON object of at most 64 kB. */
export function putUserSettings(value: object): Promise<void> {
  if (typeof window === 'undefined' || !window.QDB?.putUserSettings) {
    return Promise.reject(new Error('Qaicu bridge is not available yet'));
  }
  return window.QDB.putUserSettings(value).then(() => undefined);
}

function call<T>(op: string, params?: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined' || !window.QDB) {
    return Promise.reject(new Error('Qaicu bridge is not available yet'));
  }
  return window.QDB.call(op, params) as Promise<T>;
}

/** The datasets this app may read, with their schemas. */
export function listDatasets(): Promise<DatasetInfo[]> {
  return call<DatasetInfo[]>('datasets.list');
}

/**
 * Ensure a dataset with the given schema exists (idempotent). Call this once
 * before reading/writing a dataset your app owns. Qaicu merges dimension
 * settings, so re-running it with an added column keeps the existing ones.
 */
export function ensureDataset(
  name: string,
  dimensions: DimensionSetting[],
  description = '',
  options: { navigationPath?: NavigationPath } = {}
): Promise<void> {
  return call<void>('datasets.ensure', {
    dataset: name,
    dimensions,
    description,
    navigationPath: options.navigationPath,
  });
}

const PAGE_SIZE = 1000;

/** Every row of a dataset (or the first `limit`), newest first. */
export async function getRows(name: string, limit = Infinity): Promise<QaicuRow[]> {
  const rows: QaicuRow[] = [];
  const seen = new Set<string>();
  while (rows.length < limit) {
    const page =
      (await call<QaicuRow[]>('rows.list', {
        dataset: name,
        take: Math.min(PAGE_SIZE, limit - rows.length),
        skip: rows.length,
      })) ?? [];
    let added = 0;
    for (const row of page) {
      if (seen.has(row.externalId)) continue;
      seen.add(row.externalId);
      rows.push(row);
      added++;
    }
    // A short page is the last one; a page of repeats means the host ignores skip.
    if (page.length < PAGE_SIZE || added === 0) break;
  }
  return rows;
}

/**
 * Insert or update rows (upsert by `externalId`; existing rows with other ids
 * are kept). Build deterministic externalIds so re-saving updates in place.
 */
export function upsertRows(name: string, rows: QaicuRow[]): Promise<void> {
  return call<void>('rows.save', { dataset: name, rows });
}

/** Delete rows by `externalId`. */
export function deleteRows(name: string, externalIds: string[]): Promise<void> {
  return call<void>('rows.remove', { dataset: name, externalIds });
}

/** The company's saved reports. */
export function listReports(): Promise<{ id: string; name: string; description: string }[]> {
  return call('reports.list');
}

/** Runs a saved report, by id or name, optionally for another period. */
export function runReport(report: string, period: ReportPeriod = {}): Promise<ReportResult> {
  return call<ReportResult>('reports.run', { report, ...period });
}

// Re-export the React hooks here too, so importing them from either './qaicu'
// or './useQaicu' works (the two modules are easy to mix up).
export { useQaicuReady, useDataset, useCollection, useSettings } from './useQaicu';
export type { CollectionItem } from './useQaicu';
