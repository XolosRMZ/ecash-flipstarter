// Store de facturas x402 (PR-3): SqliteAuthoritativeInvoiceStore del subpath `./sqlite` de
// @x402-xec/core 0f409de, en su archivo propio. Añade el cierre ordenado de TR-01: checkpoint
// WAL (TRUNCATE) y cierre, idempotente, para que no quede `-wal`/`-shm` residual (T-07).

import { SqliteAuthoritativeInvoiceStore } from '@x402-xec/core/sqlite';

export class X402InvoiceStore extends SqliteAuthoritativeInvoiceStore {
  #closed = false;

  get closed(): boolean {
    return this.#closed;
  }

  /** Checkpoint WAL (TRUNCATE) y cierre. Llamadas repetidas no hacen nada. */
  shutdown(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      this.close();
    }
  }
}
