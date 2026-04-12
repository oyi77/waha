import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { generatePrefixedId } from '@waha/utils/ids';

import { AbstractKnexService } from './AbstractKnexService';
import { MessageEventService } from './message.event.service';

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

function validateRegexKeyword(keyword: string): void {
  if (keyword.length > 500) {
    throw new BadRequestException(
      'Regex keyword must be 500 characters or fewer',
    );
  }
  try {
    new RegExp(keyword);
  } catch {
    throw new BadRequestException('Invalid regex pattern');
  }
}

@Injectable()
export class AutoReplyService extends AbstractKnexService {
  private _sessionManager: SessionManager | null = null;

  constructor(private eventService: MessageEventService) {
    super();
  }

  protected get serviceName() {
    return 'AutoReplyService';
  }

  protected get migrations() {
    return MIGRATIONS;
  }

  override setManager(m: SessionManager): void {
    super.setManager(m);
    this._sessionManager = m;
  }

  protected override async _runMigrations(): Promise<void> {
    await super._runMigrations();
    this.eventService.register(async (session, chatId, text, direction) => {
      if (direction !== 'incoming') return;
      const reply = await this.processIncomingMessage(session, text);
      if (reply && this._sessionManager) {
        const whatsapp = await this._sessionManager.getWorkingSession(session);
        await whatsapp.sendText({ session, chatId, text: reply } as any);
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
    if (dto.keyword.length > 500) {
      throw new BadRequestException('Keyword must be 500 characters or fewer');
    }
    if ((dto.matchType ?? 'contains') === 'regex') {
      validateRegexKeyword(dto.keyword);
    }
    const knex = await this.db();
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
    await knex(TABLE).insert(row);
    return rowToRule(row);
  }

  async list(session?: string): Promise<AutoReplyRule[]> {
    const knex = await this.db();
    let query = knex(TABLE).select('*').orderBy('createdAt', 'asc');
    if (session) {
      query = query.where({ session });
    }
    const rows: AutoReplyRow[] = await query;
    return rows.map(rowToRule);
  }

  async get(id: string): Promise<AutoReplyRule | null> {
    const knex = await this.db();
    const row: AutoReplyRow | undefined = await knex(TABLE)
      .where({ id })
      .first();
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
    if (dto.keyword !== undefined && dto.keyword.length > 500) {
      throw new BadRequestException('Keyword must be 500 characters or fewer');
    }
    const knex = await this.db();

    // Determine the effective matchType after the update is applied so we can
    // validate the keyword when the rule ends up as 'regex'.
    let effectiveMatchType = dto.matchType;
    if (effectiveMatchType === undefined || dto.keyword !== undefined) {
      const existing = await knex(TABLE).where({ id }).first();
      if (!existing) return null;
      if (effectiveMatchType === undefined) {
        effectiveMatchType = existing.matchType;
      }
    }
    const effectiveKeyword = dto.keyword;
    if (effectiveMatchType === 'regex' && effectiveKeyword !== undefined) {
      validateRegexKeyword(effectiveKeyword);
    }
    const updates: Partial<AutoReplyRow> = {};
    if (dto.keyword !== undefined) updates.keyword = dto.keyword;
    if (dto.matchType !== undefined) updates.matchType = dto.matchType;
    if (dto.replyText !== undefined) updates.replyText = dto.replyText;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive ? 1 : 0;

    await knex(TABLE).where({ id }).update(updates);
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    const knex = await this.db();
    await knex(TABLE).where({ id }).delete();
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

  async getMatchingRules(
    session: string,
    text: string,
  ): Promise<AutoReplyRule[]> {
    const rules = await this.list(session);
    return rules.filter((rule) => rule.isActive && matchesRule(rule, text));
  }
}
