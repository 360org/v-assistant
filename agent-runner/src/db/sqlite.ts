/**
 * SQLite database abstraction layer.
 *
 * Backed by `node:sqlite`, the SQLite that ships inside Node itself (stable
 * since Node 23.4; the desktop app bundles Node 24). Deliberately NOT a native
 * addon:
 *
 *  - `better-sqlite3` had to be compiled per platform *and* per Node ABI, so
 *    the release pipeline verified a matching `better_sqlite3.node` for every
 *    target and could only produce macOS builds.
 *  - When the host Node moved ahead of that compiled ABI the runner died on
 *    boot with NODE_MODULE_VERSION mismatch and restarted forever, which the
 *    UI could only surface as "Load failed".
 *
 * With `node:sqlite` the runner is pure JavaScript: one `dist/index.js` runs on
 * macOS, Windows and Linux, and the only per-platform artefact left is the Node
 * binary itself.
 */
import { DatabaseSync } from 'node:sqlite';

export interface PreparedStatement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DatabaseHandle {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  close(): void;
}

/** The value types SQLite can bind directly. */
type Bindable = null | number | bigint | string | Uint8Array;

/**
 * `node:sqlite` rejects anything outside its supported set, where
 * better-sqlite3 quietly coerced booleans and `undefined`. Normalise here so
 * call sites keep passing plain JS values.
 */
function toBindable(value: unknown): Bindable {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Uint8Array) return value;
  return String(value);
}

/**
 * `node:sqlite` hands back rows with a null prototype. They compare unequal to
 * plain object literals under `deepStrictEqual`, so give callers ordinary
 * objects — the shape better-sqlite3 used to return.
 */
function toPlainObject<T>(row: T): T {
  return row && typeof row === 'object' ? ({ ...row } as T) : row;
}

export function openDatabase(path: string, options?: { readonly?: boolean }): DatabaseHandle {
  const db = new DatabaseSync(path, { readOnly: options?.readonly ?? false });

  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params: unknown[]) => {
          stmt.run(...params.map(toBindable));
        },
        get: (...params: unknown[]) => toPlainObject(stmt.get(...params.map(toBindable))),
        all: (...params: unknown[]) => stmt.all(...params.map(toBindable)).map(toPlainObject),
      };
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}
