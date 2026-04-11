import { ApiKey, IApiKeyRepository } from '@waha/core/storage/IApiKeyRepository';
import { LocalStore } from '@waha/core/storage/LocalStore';
import { SQLApiKeyMigrations } from '@waha/core/storage/sql/schemas';
import Knex from 'knex';

const TABLE = 'api_key';

interface ApiKeyRow {
  id: string;
  key: string;
  isActive: number; // SQLite stores booleans as integers
  session: string | null;
  data: string; // JSON: { isAdmin: boolean, rules: ... }
}

function rowToApiKey(row: ApiKeyRow): ApiKey {
  const data = JSON.parse(row.data || '{}');
  return {
    id: row.id,
    key: row.key,
    isActive: row.isActive === 1,
    session: row.session ?? null,
    isAdmin: data.isAdmin ?? false,
    rules: data.rules ?? null,
  };
}

function apiKeyToRow(key: ApiKey): ApiKeyRow {
  return {
    id: key.id,
    key: key.key,
    isActive: key.isActive ? 1 : 0,
    session: key.session ?? null,
    data: JSON.stringify({ isAdmin: key.isAdmin, rules: key.rules }),
  };
}

export class Sqlite3ApiKeyRepository implements IApiKeyRepository {
  private knex: Knex.Knex;

  constructor(store: LocalStore) {
    this.knex = store.getWAHADatabase();
  }

  async init(): Promise<void> {
    await this.knex.transaction(async (trx) => {
      for (const sql of SQLApiKeyMigrations) {
        await trx.raw(sql);
      }
    });
  }

  async list(): Promise<ApiKey[]> {
    const rows: ApiKeyRow[] = await this.knex(TABLE).select('*');
    return rows.map(rowToApiKey);
  }

  async upsert(key: ApiKey): Promise<ApiKey> {
    const row = apiKeyToRow(key);
    await this.knex(TABLE)
      .insert(row)
      .onConflict('id')
      .merge();
    // Return the persisted row rather than echoing the input.
    const persisted = await this.getById(key.id);
    return persisted ?? key;
  }

  async getActiveByKey(key: string): Promise<ApiKey | null> {
    const row: ApiKeyRow | undefined = await this.knex(TABLE)
      .where({ key, isActive: 1 })
      .first();
    return row ? rowToApiKey(row) : null;
  }

  async getById(id: string): Promise<ApiKey | null> {
    const row: ApiKeyRow | undefined = await this.knex(TABLE)
      .where({ id })
      .first();
    return row ? rowToApiKey(row) : null;
  }

  async getByKey(key: string): Promise<ApiKey | null> {
    const row: ApiKeyRow | undefined = await this.knex(TABLE)
      .where({ key })
      .first();
    return row ? rowToApiKey(row) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.knex(TABLE).where({ id }).delete();
  }

  async deleteBySession(session: string | null): Promise<void> {
    if (session === null) {
      await this.knex(TABLE).whereNull('session').delete();
    } else {
      await this.knex(TABLE).where({ session }).delete();
    }
  }
}
