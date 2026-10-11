/**
 * The slice of Node's built-in SQLite (Node 22.5+) that liveStore uses. The
 * project's @types/node targets Node 20, which predates the module.
 */
declare module "node:sqlite" {
  export interface StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  }
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
