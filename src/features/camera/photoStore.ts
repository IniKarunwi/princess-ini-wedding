/**
 * The photo roll, kept on the phone until each photograph is safely away.
 *
 * ── Why this exists, having previously refused to ──────────────────────────
 * photoService.ts used to say, deliberately: nothing persists, no
 * localStorage, no IndexedDB, no offline queue — close the tab and it is
 * gone. That was the honest behaviour for a flow that held ONE photograph for
 * a few seconds.
 *
 * It stops being honest when the guest holds a roll of up to ten for several
 * minutes, because of one specific thing: taking a photograph opens the OS
 * camera, and opening the OS camera BACKGROUNDS this page. iOS Safari
 * discards backgrounded tabs under memory pressure, and a five-photo roll
 * means surviving that five times. In memory, keeping the roll is a matter of
 * luck. That is not a reasonable thing to gamble with somebody's photographs
 * of a wedding.
 *
 * So the promise changes rather than being quietly broken. It is no longer
 * "nothing is stored"; it is "stored on your phone, and deleted the moment it
 * is sent". The guest can also discard the roll outright.
 *
 * ── What is stored ─────────────────────────────────────────────────────────
 * The prepared Blob and its dimensions. Nothing identifying: no name, no
 * location, no EXIF beyond what survives a canvas re-encode (which is none of
 * it — re-encoding through a canvas strips EXIF, including GPS). The session
 * id is a random UUID minted in the browser that identifies nobody.
 *
 * ── Deletion is the interesting part ───────────────────────────────────────
 * A record is deleted in exactly two cases: its upload was CONFIRMED, or the
 * guest removed it. Reaching a result screen is not one of them. A batch
 * where four of five succeeded must leave the fifth recoverable across a
 * reload, which is precisely when a guest is most likely to close the tab in
 * frustration and come back.
 *
 * ── Failing soft ───────────────────────────────────────────────────────────
 * Private Browsing, a full disk, and a Safari that has decided otherwise can
 * all make IndexedDB unavailable. Every function here resolves rather than
 * throwing, and the caller keeps its in-memory roll either way. Persistence
 * is a safety net; it is not load-bearing for a send that is happening now.
 */

const DB_NAME = 'wedding-camera';
const DB_VERSION = 1;
const STORE = 'roll';

/** A photograph as it survives a reload. Object URLs do not, so none is kept. */
export interface StoredPhoto {
  id: string;
  blob: Blob;
  contentType: string;
  width?: number;
  height?: number;
  takenAt: number;
  /** 'ready' or 'failed'. A sent photograph is deleted, never stored as sent. */
  status: 'ready' | 'failed';
}

/** Injectable so the tests can run against a real IndexedDB implementation. */
let factory: IDBFactory | null | undefined;

export function useIndexedDB(f: IDBFactory | null): void {
  factory = f;
}

function idb(): IDBFactory | null {
  if (factory !== undefined) return factory;
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;           // Safari throws rather than returning undefined
  }
}

let open: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (open) return open;
  open = new Promise((resolve) => {
    const f = idb();
    if (!f) return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = f.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return open;
}

/** Runs one transaction, resolving to `fallback` if anything at all goes wrong. */
async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (v: T) => void) => void,
  fallback: T,
): Promise<T> {
  const d = await db();
  if (!d) return fallback;
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (v: T) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const t = d.transaction(STORE, mode);
      t.onerror = () => finish(fallback);
      t.onabort = () => finish(fallback);
      run(t.objectStore(STORE), finish);
    } catch {
      finish(fallback);
    }
  });
}

/** Whether anything can be persisted at all. Used only to warn, never to block. */
export async function isAvailable(): Promise<boolean> {
  return (await db()) !== null;
}

export async function put(photo: StoredPhoto): Promise<void> {
  await tx<void>('readwrite', (store, done) => {
    const r = store.put(photo);
    r.onsuccess = () => done(undefined);
    r.onerror = () => done(undefined);
  }, undefined);
}

export async function setStatus(id: string, status: StoredPhoto['status']): Promise<void> {
  await tx<void>('readwrite', (store, done) => {
    const get = store.get(id);
    get.onsuccess = () => {
      const row = get.result as StoredPhoto | undefined;
      if (!row) return done(undefined);
      const w = store.put({ ...row, status });
      w.onsuccess = () => done(undefined);
      w.onerror = () => done(undefined);
    };
    get.onerror = () => done(undefined);
  }, undefined);
}

/**
 * Forgets one photograph.
 *
 * Called ONLY after a confirmed upload, or when the guest removes it. Not on
 * reaching a result screen, not on starting a new batch, not on navigating
 * away — see the header.
 */
export async function remove(id: string): Promise<void> {
  await tx<void>('readwrite', (store, done) => {
    const r = store.delete(id);
    r.onsuccess = () => done(undefined);
    r.onerror = () => done(undefined);
  }, undefined);
}

/** Everything still waiting, oldest first — the order they were taken in. */
export async function all(): Promise<StoredPhoto[]> {
  const rows = await tx<StoredPhoto[]>('readonly', (store, done) => {
    const r = store.getAll();
    r.onsuccess = () => done((r.result as StoredPhoto[]) ?? []);
    r.onerror = () => done([]);
  }, []);
  return rows.sort((a, b) => a.takenAt - b.takenAt);
}

/** The guest discarding the roll. The only bulk delete there is. */
export async function clear(): Promise<void> {
  await tx<void>('readwrite', (store, done) => {
    const r = store.clear();
    r.onsuccess = () => done(undefined);
    r.onerror = () => done(undefined);
  }, undefined);
}

/** Lets a test start from nothing without reaching into IndexedDB itself. */
export function resetForTests(): void {
  open = null;
}
