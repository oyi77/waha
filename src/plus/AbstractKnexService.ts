import { Injectable } from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import Knex from 'knex';

/**
 * Base class for Plus services that need a Knex database connection via
 * SessionManager. Subclasses declare their migrations and the service name
 * (used in error messages); everything else — lazy init, migration guarding,
 * and the public setManager() hook — lives here.
 */
@Injectable()
export abstract class AbstractKnexService {
  private _knex: Knex.Knex | null = null;
  private _migrationPromise: Promise<void> | null = null;
  private _manager: SessionManager | null = null;

  protected abstract get serviceName(): string;
  protected abstract get migrations(): string[];

  setManager(m: SessionManager): void {
    this._manager = m;
  }

  protected async db(): Promise<Knex.Knex> {
    if (!this._knex) {
      if (!this._manager) {
        throw new Error(`${this.serviceName}: SessionManager not set`);
      }
      this._knex = this._manager.store.getWAHADatabase();
    }
    if (!this._migrationPromise) {
      this._migrationPromise = this._runMigrations();
    }
    await this._migrationPromise;
    return this._knex;
  }

  protected async _runMigrations(): Promise<void> {
    await this._knex!.transaction(async (trx) => {
      for (const sql of this.migrations) await trx.raw(sql);
    });
  }
}
