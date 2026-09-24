import { describe, expect, it, afterEach } from 'vitest';
import {
  deleteRows,
  ensureDataset,
  getRows,
  getSession,
  getSettings,
  getUserSettings,
  putSettings,
  putUserSettings,
  upsertRows,
} from './qaicu';

/**
 * Harness-owned tests for the data helpers (the model neither writes nor edits
 * these). They pin what the helpers send over the host bridge — the operation
 * names and parameters the Qaicu host accepts — and how rows are paged.
 */
type Call = { op: string; params: Record<string, unknown> };

function stubBridge(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  (window as unknown as { QDB: unknown }).QDB = {
    ready: true,
    session: {
      user: { id: 'u1', name: 'Jane Doe', email: 'jane@example.com' },
      company: { id: 'c1', name: 'Firma Oy' },
      language: 'en-US',
    },
    call: (op: string, params: Record<string, unknown> = {}) => {
      const call = { op, params };
      calls.push(call);
      try {
        return Promise.resolve(respond(call));
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
  return calls;
}

const rowsFrom = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    externalId: `r${from + i}`,
    dimensionValues: { N: String(from + i) },
  }));

afterEach(() => {
  delete (window as unknown as { QDB?: unknown }).QDB;
});

describe('qaicu data helpers', () => {
  it('saves rows through rows.save', async () => {
    const calls = stubBridge(() => undefined);
    await upsertRows('Tasks', [{ externalId: 'a', dimensionValues: { Title: 'x' } }]);
    expect(calls).toEqual([
      {
        op: 'rows.save',
        params: { dataset: 'Tasks', rows: [{ externalId: 'a', dimensionValues: { Title: 'x' } }] },
      },
    ]);
  });

  it('removes rows through rows.remove', async () => {
    const calls = stubBridge(() => undefined);
    await deleteRows('Tasks', ['a']);
    expect(calls[0]).toEqual({ op: 'rows.remove', params: { dataset: 'Tasks', externalIds: ['a'] } });
  });

  it('ensures a dataset with its schema and navigation section', async () => {
    const calls = stubBridge(() => undefined);
    await ensureDataset('Tasks', [{ name: 'Title', type: 'Text' }], 'To-dos', { navigationPath: 'HR' });
    expect(calls[0]).toEqual({
      op: 'datasets.ensure',
      params: {
        dataset: 'Tasks',
        dimensions: [{ name: 'Title', type: 'Text' }],
        description: 'To-dos',
        navigationPath: 'HR',
      },
    });
  });

  it('reads every page of a dataset', async () => {
    const calls = stubBridge(({ params }) =>
      params.skip === 0 ? rowsFrom(0, 1000) : rowsFrom(1000, 5)
    );
    const rows = await getRows('Tasks');
    expect(rows).toHaveLength(1005);
    expect(calls.map((c) => c.params.skip)).toEqual([0, 1000]);
  });

  it('stops when the host ignores skip instead of looping', async () => {
    stubBridge(() => rowsFrom(0, 1000));
    await expect(getRows('Tasks')).resolves.toHaveLength(1000);
  });

  it('passes the host refusal on as the error', async () => {
    stubBridge(() => {
      throw new Error('This app has not been allowed to read "Tasks".');
    });
    await expect(getRows('Tasks')).rejects.toThrow('not been allowed');
  });

  it('exposes who has the app open', () => {
    stubBridge(() => undefined);
    expect(getSession().user?.name).toBe('Jane Doe');
  });

  it('rejects when there is no host', async () => {
    await expect(getRows('Tasks')).rejects.toThrow('not available');
    await expect(putSettings({})).rejects.toThrow('not available');
  });
});

describe('qaicu settings', () => {
  function stubSettings() {
    const bridge = {
      ready: true,
      settings: { target: 37.5 } as object,
      userSettings: {} as object,
      putSettings: (value: object) => {
        bridge.settings = value;
        return Promise.resolve(value);
      },
      putUserSettings: (value: object) => {
        bridge.userSettings = value;
        return Promise.resolve(value);
      },
    };
    (window as unknown as { QDB: unknown }).QDB = bridge;
    return bridge;
  }

  it('hands out the app settings and the viewer’s own', () => {
    stubSettings();
    expect(getSettings()).toEqual({ target: 37.5 });
    expect(getUserSettings()).toEqual({});
  });

  it('replaces each through its own put', async () => {
    const bridge = stubSettings();
    await putSettings({ target: 40 });
    await putUserSettings({ week: 2 });
    expect(bridge.settings).toEqual({ target: 40 });
    expect(getUserSettings()).toEqual({ week: 2 });
  });

  it('is empty before the bridge is ready', () => {
    expect(getSettings()).toEqual({});
  });
});
