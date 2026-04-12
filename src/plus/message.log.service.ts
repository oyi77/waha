import { Injectable } from '@nestjs/common';
import { generatePrefixedId } from '@waha/utils/ids';

import { AbstractKnexService } from './AbstractKnexService';

const TABLE = 'message_log';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    session TEXT NOT NULL,
    chatId TEXT NOT NULL,
    direction TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    body TEXT,
    timestamp INTEGER NOT NULL,
    status TEXT DEFAULT 'sent',
    raw TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_message_log_session ON ${TABLE}(session)`,
  `CREATE INDEX IF NOT EXISTS idx_message_log_chat ON ${TABLE}(chatId)`,
  `CREATE INDEX IF NOT EXISTS idx_message_log_ts ON ${TABLE}(timestamp)`,
];

export type MessageDirection = 'incoming' | 'outgoing';

export interface MessageLogEntry {
  id: string;
  session: string;
  chatId: string;
  direction: MessageDirection;
  type: string;
  body: string | null;
  timestamp: number;
  status: string;
  raw: Record<string, any> | null;
}

interface MessageLogRow {
  id: string;
  session: string;
  chatId: string;
  direction: string;
  type: string;
  body: string | null;
  timestamp: number;
  status: string | null;
  raw: string | null;
}

function rowToEntry(row: MessageLogRow): MessageLogEntry {
  let raw: Record<string, any> | null = null;
  if (row.raw) {
    try {
      raw = JSON.parse(row.raw);
    } catch {
      raw = null;
    }
  }
  return {
    id: row.id,
    session: row.session,
    chatId: row.chatId,
    direction: row.direction as MessageDirection,
    type: row.type,
    body: row.body,
    timestamp: row.timestamp,
    status: row.status ?? 'sent',
    raw,
  };
}

@Injectable()
export class MessageLogService extends AbstractKnexService {
  protected get serviceName() {
    return 'MessageLogService';
  }

  protected get migrations() {
    return MIGRATIONS;
  }

  async log(entry: {
    session: string;
    chatId: string;
    direction: MessageDirection;
    type?: string;
    body?: string | null;
    timestamp?: number;
    status?: string;
    raw?: Record<string, any> | null;
  }): Promise<MessageLogEntry> {
    const knex = await this.db();
    const id = generatePrefixedId('msglog');
    const row: MessageLogRow = {
      id,
      session: entry.session,
      chatId: entry.chatId,
      direction: entry.direction,
      type: entry.type ?? 'text',
      body: entry.body ?? null,
      timestamp: entry.timestamp ?? Date.now(),
      status: entry.status ?? 'sent',
      raw: entry.raw ? JSON.stringify(entry.raw) : null,
    };
    await knex(TABLE).insert(row);
    return rowToEntry(row);
  }

  async list(
    session?: string,
    chatId?: string,
    limit = 50,
    offset = 0,
  ): Promise<MessageLogEntry[]> {
    const knex = await this.db();
    let query = knex(TABLE)
      .select('*')
      .orderBy('timestamp', 'desc')
      .limit(Math.min(Math.max(1, limit), 500))
      .offset(Math.max(0, offset));
    if (session) query = query.where({ session });
    if (chatId) query = query.where({ chatId });
    const rows: MessageLogRow[] = await query;
    return rows.map(rowToEntry);
  }

  async stats(
    session?: string,
  ): Promise<{
    total: number;
    incoming: number;
    outgoing: number;
    today: number;
  }> {
    const knex = await this.db();
    const baseWhere: Record<string, any> = {};
    if (session) baseWhere.session = session;

    const totalRow = await knex(TABLE)
      .where(baseWhere)
      .count<{ c: number }[]>({ c: '*' })
      .first();
    const incomingRow = await knex(TABLE)
      .where({ ...baseWhere, direction: 'incoming' })
      .count<{ c: number }[]>({ c: '*' })
      .first();
    const outgoingRow = await knex(TABLE)
      .where({ ...baseWhere, direction: 'outgoing' })
      .count<{ c: number }[]>({ c: '*' })
      .first();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayRow = await knex(TABLE)
      .where(baseWhere)
      .where('timestamp', '>=', startOfDay.getTime())
      .count<{ c: number }[]>({ c: '*' })
      .first();

    return {
      total: Number(totalRow?.c ?? 0),
      incoming: Number(incomingRow?.c ?? 0),
      outgoing: Number(outgoingRow?.c ?? 0),
      today: Number(todayRow?.c ?? 0),
    };
  }

  async cleanup(session?: string, olderThan?: number): Promise<number> {
    const knex = await this.db();
    let query = knex(TABLE).delete();
    if (session) query = query.where({ session });
    if (olderThan !== undefined) {
      query = query.where('timestamp', '<', olderThan);
    }
    const deleted = await query;
    return Number(deleted ?? 0);
  }
}
