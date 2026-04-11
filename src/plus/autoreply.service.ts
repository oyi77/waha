import { Injectable, OnModuleInit } from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { generatePrefixedId } from '@waha/utils/ids';
import Knex from 'knex';

const TABLE = 'autoreply_rule';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    session TEXT NOT NULL,
    keyword TEXT NOT NULL,
    matchType TEXT NOT NULL DEFAULT 'contains',
    replyText TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt INTEGER NOT NULL
  )`,
];

export interface AutoReplyRule {
  id: string;
  session: string;
  keyword: string;
  matchType: string;
  replyText: string;
  isActive: boolean;
  createdAt: number;
}

interface AutoReplyRow {
  id: string;
  session: string;
  keyword: string;
  matchType: string;
  replyText: string;
  isActive: number;
  createdAt: number;
}

function rowToRule(row: AutoReplyRow): AutoReplyRule {
  return {
    id: row.id,
    session: row.session,
    keyword: row.keyword,
    matchType: row.matchType,
    replyText: row.replyText,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
  };
}

function matchesRule(rule: AutoReplyRule, text: string): boolean {
  const keyword = rule.keyword;
  switch (rule.matchType) {
    case 'exact':
      return text === keyword;
    case 'startsWith':
      return text.startsWith(keyword);
    case 'regex':
      try {
        return new RegExp(keyword, 'i').test(text);
      } catch {
        return false;
      }
    case 'contains':
    default:
      return text.toLowerCase().includes(keyword.toLowerCase());
  }
}

@Injectable()
export class AutoReplyService implements OnModuleInit {
  private knex: Knex.Knex;

  constructor(private manager: SessionManager) {
    this.knex = manager.store.getWAHADatabase();
  }

  async onModuleInit() {
    await this.knex.transaction(async (trx) => {
      for (const sql of MIGRATIONS) {
        await trx.raw(sql);
      }
    });
  }

  async create(dto: {
    session: string;
    keyword: string;
    matchType?: string;
    replyText: string;
    isActive?: boolean;
  }): Promise<AutoReplyRule> {
    const id = generatePrefixedId('rule');
    const row: AutoReplyRow = {
      id,
      session: dto.session,
      keyword: dto.keyword,
      matchType: dto.matchType ?? 'contains',
      replyText: dto.replyText,
      isActive: dto.isActive === false ? 0 : 1,
      createdAt: Date.now(),
    };
    await this.knex(TABLE).insert(row);
    return rowToRule(row);
  }

  async list(session?: string): Promise<AutoReplyRule[]> {
    let query = this.knex(TABLE).select('*').orderBy('createdAt', 'asc');
    if (session) {
      query = query.where({ session });
    }
    const rows: AutoReplyRow[] = await query;
    return rows.map(rowToRule);
  }

  async get(id: string): Promise<AutoReplyRule | null> {
    const row: AutoReplyRow | undefined = await this.knex(TABLE).where({ id }).first();
    return row ? rowToRule(row) : null;
  }

  async update(
    id: string,
    dto: Partial<{
      keyword: string;
      matchType: string;
      replyText: string;
      isActive: boolean;
    }>,
  ): Promise<AutoReplyRule | null> {
    const updates: Partial<AutoReplyRow> = {};
    if (dto.keyword !== undefined) updates.keyword = dto.keyword;
    if (dto.matchType !== undefined) updates.matchType = dto.matchType;
    if (dto.replyText !== undefined) updates.replyText = dto.replyText;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    await this.knex(TABLE).where({ id }).update(updates);
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.knex(TABLE).where({ id }).delete();
  }

  async processIncomingMessage(
    session: string,
    messageText: string,
  ): Promise<string | null> {
    const rules = await this.list(session);
    for (const rule of rules) {
      if (rule.isActive && matchesRule(rule, messageText)) {
        return rule.replyText;
      }
    }
    return null;
  }

  async getMatchingRules(session: string, text: string): Promise<AutoReplyRule[]> {
    const rules = await this.list(session);
    return rules.filter((rule) => rule.isActive && matchesRule(rule, text));
  }
}
