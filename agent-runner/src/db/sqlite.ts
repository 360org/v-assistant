/**
 * SQLite database abstraction layer.
 *
 * Uses better-sqlite3 via createRequire (ESM → CJS interop).
 * better-sqlite3 is a native addon, dynamic import() doesn't work with it.
 *
 * @ref NanoClaw/container/agent-runner/src/db/connection.ts
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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

/**
 * Open a SQLite database using better-sqlite3.
 */
export function openDatabase(path: string, options?: { readonly?: boolean }): DatabaseHandle {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(path, { readonly: options?.readonly ?? false });

  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params: unknown[]) => stmt.run(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
      };
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}
