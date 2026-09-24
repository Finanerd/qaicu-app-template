import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteRows,
  ensureDataset,
  getRows,
  getSettings,
  getUserSettings,
  isQaicuAvailable,
  onQaicuReady,
  putSettings,
  putUserSettings,
  upsertRows,
  type DimensionSetting,
  type QaicuRow,
} from './qaicu';
import { uid } from './format';

// Re-export the data helpers here too, so importing them from either
// './useQaicu' or './qaicu' works (the two modules are easy to mix up).
export {
  getRows,
  ensureDataset,
  upsertRows,
  deleteRows,
  onQaicuReady,
  isQaicuAvailable,
  getSession,
  getPlacement,
  canOpenApp,
  openApp,
  getLocation,
  listDatasets,
  listReports,
  runReport,
  getSettings,
  getUserSettings,
  putSettings,
  putUserSettings,
} from './qaicu';
export type {
  QaicuRow,
  DimensionSetting,
  DimensionType,
  NavigationPath,
  Placement,
  LocationOptions,
  QaicuLocation,
  QaicuSession,
  DatasetInfo,
  ReportPeriod,
  ReportPreset,
  ReportResult,
} from './qaicu';

/**
 * React hook: returns true once the Qaicu host bridge is ready. Gate data calls
 * on it so the app renders an empty/loading state during offline build/preview
 * (when `window.QDB` is absent) and loads real data at runtime.
 *
 *   const ready = useQaicuReady();
 *   useEffect(() => { if (ready) getRows('MyData').then(setRows); }, [ready]);
 */
export function useQaicuReady(): boolean {
  const [ready, setReady] = useState<boolean>(isQaicuAvailable());
  useEffect(() => {
    if (!ready) onQaicuReady(() => setReady(true));
  }, [ready]);
  return ready;
}

/**
 * The app's shared settings ('app', the default) or the viewer's own ('user')
 * as state, with a save that replaces them whole.
 *
 *   const [settings, saveSettings] = useSettings<{ target: number }>();
 *   await saveSettings({ ...settings, target: 40 });
 */
export function useSettings<T extends object = Record<string, unknown>>(scope: 'app' | 'user' = 'app') {
  const ready = useQaicuReady();
  const read = () => (scope === 'app' ? getSettings<T>() : getUserSettings<T>());
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    if (ready) setValue(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scope]);
  const save = useCallback(
    async (next: T) => {
      await (scope === 'app' ? putSettings(next) : putUserSettings(next));
      setValue(next);
    },
    [scope],
  );
  return [value, save] as const;
}

/**
 * Declarative data access — the easy, mistake-proof way to READ a dataset.
 * Handles the async loading, ensures the dataset (if you pass its dimensions)
 * and re-loads on demand. NEVER call the async getRows/ensureDataset yourself
 * from a component; use this instead.
 *
 *   const { rows, loading, error, reload } = useDataset('Sales', [
 *     { name: 'Month', type: 'Text' },
 *     { name: 'Amount', type: 'Number' },
 *   ]);
 *   // ...render rows. To WRITE: await upsertRows('Sales', [...]); reload();
 *
 * During offline build/preview (no host bridge) it simply returns empty rows
 * with loading=false, so your component should render an empty state.
 */
export function useDataset(name: string, dimensions?: DimensionSetting[]) {
  const ready = useQaicuReady();
  const [rows, setRows] = useState<QaicuRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Which dataset's schema has already been ensured. The PUT is idempotent, so
  // it only has to run once per dataset — repeating it before every read would
  // put an extra schema write on top of every add/update/remove's refresh.
  const ensured = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!ready) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (dimensions && dimensions.length > 0 && ensured.current !== name) {
        await ensureDataset(name, dimensions);
        ensured.current = name;
      }
      setRows(await getRows(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
    // `dimensions` is treated as a stable shape; re-run only on name/ready change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, name]);

  useEffect(() => {
    reload();
  }, [reload]);

  // setRows is returned so a writer that already knows the new row can apply it
  // locally instead of re-reading the whole dataset over the host bridge.
  return { rows, setRows, loading, error, reload, ready };
}

/** A dataset row flattened for easy use: the externalId as `id` plus every
 *  column as a string field. `{ id: "abc", Title: "Buy milk", Done: "no" }`. */
export interface CollectionItem {
  id: string;
  [field: string]: string;
}

function toStringMap(values: Record<string, string | number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(values)) out[k] = String(values[k]);
  return out;
}

/**
 * The easiest, most reliable way to build a CRUD app over ONE dataset. Wraps
 * useDataset and gives you flattened items plus add/update/remove that handle
 * ids, string conversion and reloading for you — you write almost no data code.
 *
 *   const { items, loading, add, update, remove } = useCollection('Tasks', [
 *     { name: 'Title', type: 'Text' },
 *     { name: 'Done',  type: 'Text' },
 *   ]);
 *   // items: [{ id, Title, Done }, ...]
 *   await add({ Title: 'Buy milk', Done: 'no' });   // generates the id
 *   await update(item.id, { Done: 'yes' });          // merges into that row
 *   await remove(item.id);
 *
 * Offline (build/preview, no host bridge) items is [] — but the mutators
 * REJECT, because there is no host to carry the write. Render an empty state,
 * and only call add/update/remove from a user action, never on mount.
 */
export function useCollection(name: string, dimensions: DimensionSetting[]) {
  const { rows, setRows, loading, error, reload, ready } = useDataset(name, dimensions);
  // A write already knows the row it wrote, so the list is updated from it rather
  // than by re-reading the whole dataset through the bridge after every change —
  // ticking 20 checkboxes cost 20 writes AND 20 full table reads. The ref lets the
  // mutators read the current rows without depending on them, so add/update/remove
  // keep a stable identity (generated apps put them in dependency arrays).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Memoised so `items` keeps a stable identity between renders — generated apps
  // routinely put it in a dependency array or behind React.memo.
  const items: CollectionItem[] = useMemo(
    () => rows.map((r) => ({ id: r.externalId, ...r.dimensionValues })),
    [rows],
  );

  const add = useCallback(
    async (values: Record<string, string | number>): Promise<string> => {
      const id = uid();
      const dimensionValues = toStringMap(values);
      await upsertRows(name, [{ externalId: id, dimensionValues }]);
      setRows((prev) => [...prev, { externalId: id, dimensionValues }]);
      return id;
    },
    [name, setRows],
  );

  const update = useCallback(
    async (id: string, values: Record<string, string | number>): Promise<void> => {
      const existing = rowsRef.current.find((r) => r.externalId === id);
      const dimensionValues = { ...(existing?.dimensionValues ?? {}), ...toStringMap(values) };
      await upsertRows(name, [{ externalId: id, dimensionValues }]);
      setRows((prev) => prev.map((r) => (r.externalId === id ? { ...r, dimensionValues } : r)));
    },
    [name, setRows],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteRows(name, [id]);
      setRows((prev) => prev.filter((r) => r.externalId !== id));
    },
    [name, setRows],
  );

  return { items, loading, error, add, update, remove, reload, ready };
}
