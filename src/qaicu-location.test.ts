import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocation } from './qaicu';

const HERE = {
  latitude: 60.1699,
  longitude: 24.9384,
  accuracy: 25,
  altitude: null,
  heading: null,
  speed: null,
  timestamp: 1789318800000,
};

function stubBridge(ready: boolean, hostGetLocation?: (options?: unknown) => Promise<unknown>) {
  const bridge = {
    ready,
    session: { user: null, company: null, language: 'en-US' },
    settings: {},
    userSettings: {},
    call: () => Promise.resolve(undefined),
    getLocation: hostGetLocation,
  };
  (window as unknown as { QDB: unknown }).QDB = bridge;
  return bridge;
}

afterEach(() => {
  delete (window as unknown as { QDB?: unknown }).QDB;
});

describe('getLocation', () => {
  it('asks the host for the position, with the options', async () => {
    const host = vi.fn(() => Promise.resolve(HERE));
    stubBridge(true, host);
    await expect(getLocation({ highAccuracy: true, timeoutMs: 15000 })).resolves.toEqual(HERE);
    expect(host).toHaveBeenCalledWith({ highAccuracy: true, timeoutMs: 15000 });
  });

  it('waits for the bridge to be ready', async () => {
    const host = vi.fn(() => Promise.resolve(HERE));
    const bridge = stubBridge(false, host);
    const pending = getLocation();
    await Promise.resolve();
    expect(host).not.toHaveBeenCalled();
    bridge.ready = true;
    window.dispatchEvent(new Event('qdb-ready'));
    await expect(pending).resolves.toEqual(HERE);
  });

  it('passes the refusal on as the error', async () => {
    stubBridge(true, () => Promise.reject(new Error('The person did not allow their location to be used.')));
    await expect(getLocation()).rejects.toThrow('did not allow');
  });

  it('rejects on a host that cannot tell the location', async () => {
    stubBridge(true);
    await expect(getLocation()).rejects.toThrow('cannot tell the location');
  });

  it('rejects when there is no host', async () => {
    await expect(getLocation()).rejects.toThrow('not available');
  });
});
