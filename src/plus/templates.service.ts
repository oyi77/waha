import { Injectable } from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { generatePrefixedId } from '@waha/utils/ids';
import Knex from 'knex';

const TABLE = 'message_template';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    tags TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )`,
];

export interface MessageTemplate {
  id: string;
  name: string;
  type: string;
  payload: Record<string, any>;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface TemplateRow {
  id: string;
  name: string;
  type: string;
  payload: string;
  tags: string | null;
  createdAt: number;
  updatedAt: number;
}

function rowToTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    payload: JSON.parse(row.payload),
    tags: row.tags ? JSON.parse(row.tags) : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class TemplatesService {
  private _knex: Knex.Knex | null = null;
  private _migrationPromise: Promise<void> | null = null;

  constructor(private manager: SessionManager) {}

  private async db(): Promise<Knex.Knex> {
    if (!this._knex) {
      this._knex = this.manager.store.getWAHADatabase();
    }
    if (!this._migrationPromise) {
      this._migrationPromise = this._knex.transaction(async (trx) => {
        for (const sql of MIGRATIONS) await trx.raw(sql);
      });
    }
    await this._migrationPromise;
    return this._knex;
  }

  async create(dto: {
    name: string;
    type: string;
    payload: Record<string, any>;
    tags?: string[];
  }): Promise<MessageTemplate> {
    const knex = await this.db();
    const id = generatePrefixedId('tmpl');
    const now = Date.now();
    const row: TemplateRow = {
      id,
      name: dto.name,
      type: dto.type,
      payload: JSON.stringify(dto.payload),
      tags: dto.tags ? JSON.stringify(dto.tags) : null,
      createdAt: now,
      updatedAt: now,
    };
    await knex(TABLE).insert(row);
    return rowToTemplate(row);
  }

  async list(): Promise<MessageTemplate[]> {
    const knex = await this.db();
    const rows: TemplateRow[] = await knex(TABLE)
      .select('*')
      .orderBy('createdAt', 'asc');
    return rows.map(rowToTemplate);
  }

  async get(id: string): Promise<MessageTemplate | null> {
    const knex = await this.db();
    const row: TemplateRow | undefined = await knex(TABLE)
      .where({ id })
      .first();
    return row ? rowToTemplate(row) : null;
  }

  async getByName(name: string): Promise<MessageTemplate | null> {
    const knex = await this.db();
    const row: TemplateRow | undefined = await knex(TABLE)
      .where({ name })
      .first();
    return row ? rowToTemplate(row) : null;
  }

  async update(
    id: string,
    dto: Partial<{
      name: string;
      type: string;
      payload: Record<string, any>;
      tags: string[];
    }>,
  ): Promise<MessageTemplate | null> {
    const knex = await this.db();
    const updates: Partial<TemplateRow> = { updatedAt: Date.now() };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.type !== undefined) updates.type = dto.type;
    if (dto.payload !== undefined)
      updates.payload = JSON.stringify(dto.payload);
    if (dto.tags !== undefined) updates.tags = JSON.stringify(dto.tags);

    await knex(TABLE).where({ id }).update(updates);
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    const knex = await this.db();
    await knex(TABLE).where({ id }).delete();
  }
}
