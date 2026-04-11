import { Injectable, Logger } from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { generatePrefixedId } from '@waha/utils/ids';
import Knex from 'knex';

const TABLE = 'scheduled_message';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    session TEXT NOT NULL,
    chatId TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    scheduledAt INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL,
    sentAt INTEGER,
    error TEXT
  )`,
];

export interface ScheduledMessage {
  id: string;
  session: string;
  chatId: string;
  type: string;
  payload: Record<string, any>;
  scheduledAt: number;
  status: string;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

interface ScheduledRow {
  id: string;
  session: string;
  chatId: string;
  type: string;
  payload: string;
  scheduledAt: number;
  status: string;
  createdAt: number;
  sentAt: number | null;
  error: string | null;
}

function rowToMessage(row: ScheduledRow): ScheduledMessage {
  return {
    id: row.id,
    session: row.session,
    chatId: row.chatId,
    type: row.type,
    payload: JSON.parse(row.payload),
    scheduledAt: row.scheduledAt,
    status: row.status,
    createdAt: row.createdAt,
    sentAt: row.sentAt ?? undefined,
    error: row.error ?? undefined,
  };
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private _knex: Knex.Knex | null = null;
  private _migrated = false;

  constructor(private manager: SessionManager) {}

  private async db(): Promise<Knex.Knex> {
    if (!this._knex) {
      this._knex = this.manager.store.getWAHADatabase();
    }
    if (!this._migrated) {
      this._migrated = true;
      await this._knex.transaction(async (trx) => {
        for (const sql of MIGRATIONS) await trx.raw(sql);
      });
      this.startRunner();
    }
    return this._knex;
  }

  private startRunner() {
    setInterval(() => this.runPending().catch((e) => this.logger.error(e)), 10_000);
  }

  private async runPending() {
    const knex = await this.db();
    const now = Date.now();
    const rows: ScheduledRow[] = await knex(TABLE)
      .where({ status: 'pending' })
      .where('scheduledAt', '<=', now)
      .select('*');

    for (const row of rows) {
      const msg = rowToMessage(row);
      try {
        const whatsapp = await this.manager.getWorkingSession(msg.session);
        const req: any = { chatId: msg.chatId, session: msg.session, ...msg.payload };

        switch (msg.type) {
          case 'text':
            await whatsapp.sendText(req);
            break;
          case 'image':
            await whatsapp.sendImage(req);
            break;
          case 'file':
            await whatsapp.sendFile(req);
            break;
          case 'video':
            await whatsapp.sendVideo(req);
            break;
          case 'voice':
            await whatsapp.sendVoice(req);
            break;
          default:
            throw new Error(`Unknown message type: ${msg.type}`);
        }

        await knex(TABLE).where({ id: msg.id }).update({
          status: 'sent',
          sentAt: Date.now(),
        });
        this.logger.log(`Scheduled message ${msg.id} sent`);
      } catch (err: any) {
        await knex(TABLE).where({ id: msg.id }).update({
          status: 'failed',
          error: err?.message ?? String(err),
        });
        this.logger.error(`Scheduled message ${msg.id} failed: ${err?.message}`);
      }
    }
  }

  async create(dto: {
    session: string;
    chatId: string;
    type: string;
    payload: Record<string, any>;
    scheduledAt: string;
  }): Promise<ScheduledMessage> {
    const knex = await this.db();
    const id = generatePrefixedId('sched');
    const now = Date.now();
    const scheduledAt = new Date(dto.scheduledAt).getTime();

    const row: ScheduledRow = {
      id,
      session: dto.session,
      chatId: dto.chatId,
      type: dto.type,
      payload: JSON.stringify(dto.payload),
      scheduledAt,
      status: 'pending',
      createdAt: now,
      sentAt: null,
      error: null,
    };

    await knex(TABLE).insert(row);
    return rowToMessage(row);
  }

  async list(session?: string): Promise<ScheduledMessage[]> {
    const knex = await this.db();
    let query = knex(TABLE).select('*').orderBy('scheduledAt', 'asc');
    if (session) {
      query = query.where({ session });
    }
    const rows: ScheduledRow[] = await query;
    return rows.map(rowToMessage);
  }

  async get(id: string): Promise<ScheduledMessage | null> {
    const knex = await this.db();
    const row: ScheduledRow | undefined = await knex(TABLE).where({ id }).first();
    return row ? rowToMessage(row) : null;
  }

  async cancel(id: string): Promise<void> {
    const knex = await this.db();
    await knex(TABLE).where({ id }).update({ status: 'cancelled' });
  }
}
