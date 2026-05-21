import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
    error TEXT,
    retryCount INTEGER NOT NULL DEFAULT 0
  )`,
];

const MAX_RETRIES = 3;

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
  retryCount: number;
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
export class ScheduleService implements OnModuleDestroy {
  private readonly logger = new Logger(ScheduleService.name);
  private _knex: Knex.Knex | null = null;
  private _migrationPromise: Promise<void> | null = null;
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(private manager: SessionManager) {}

  private async db(): Promise<Knex.Knex> {
    if (!this._knex) {
      this._knex = this.manager.store.getWAHADatabase();
    }
    if (!this._migrationPromise) {
      this._migrationPromise = this._runMigrations();
    }
    await this._migrationPromise;
    return this._knex;
  }

  private async _runMigrations(): Promise<void> {
    await this._knex!.transaction(async (trx) => {
      for (const sql of MIGRATIONS) await trx.raw(sql);
    });
    this.startRunner();
  }

  onModuleDestroy() {
    if (this._timer) clearInterval(this._timer);
  }

  private startRunner() {
    this._timer = setInterval(
      () => this.runPending().catch((e) => this.logger.error(e)),
      10_000,
    );
  }

  private async runPending() {
    if (this._running) return;
    this._running = true;
    try {
      const knex = await this.db();
      const now = Date.now();
      const rows: ScheduledRow[] = await knex(TABLE)
        .where({ status: 'pending' })
        .where('scheduledAt', '<=', now)
        .limit(50)
        .orderBy('scheduledAt', 'asc')
        .select('*');

      for (const row of rows) {
        const msg = rowToMessage(row);
        // Atomically claim the row to prevent double-send
        const claimed = await knex(TABLE)
          .where({ id: msg.id, status: 'pending' })
          .update({ status: 'sending' });
        if (claimed === 0) continue;

        try {
          const whatsapp = await this.manager.getWorkingSession(msg.session);
          const req: any = {
            chatId: msg.chatId,
            session: msg.session,
            ...msg.payload,
          };

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
              throw new BadRequestException(`Unknown message type: ${msg.type}`);
          }

          await knex(TABLE).where({ id: msg.id }).update({
            status: 'sent',
            sentAt: Date.now(),
          });
          this.logger.log(`Scheduled message ${msg.id} sent`);
        } catch (err: any) {
          const retries = (row.retryCount ?? 0) + 1;
          if (retries < MAX_RETRIES) {
            await knex(TABLE)
              .where({ id: msg.id })
              .update({
                status: 'pending',
                retryCount: retries,
                error: err?.message ?? String(err),
              });
            this.logger.warn(
              `Scheduled message ${msg.id} retry ${retries}/${MAX_RETRIES}: ${err?.message}`,
            );
          } else {
            await knex(TABLE)
              .where({ id: msg.id })
              .update({
                status: 'failed',
                retryCount: retries,
                error: err?.message ?? String(err),
              });
            this.logger.error(
              `Scheduled message ${msg.id} failed after ${MAX_RETRIES} retries: ${err?.message}`,
            );
          }
        }
      }
    } finally {
      this._running = false;
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

    if (!Number.isFinite(scheduledAt)) {
      throw new BadRequestException(`Invalid scheduledAt date: ${dto.scheduledAt}`);
    }

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
      retryCount: 0,
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
    const row: ScheduledRow | undefined = await knex(TABLE)
      .where({ id })
      .first();
    return row ? rowToMessage(row) : null;
  }

  async cancel(id: string): Promise<void> {
    const knex = await this.db();
    await knex(TABLE).where({ id }).update({ status: 'cancelled' });
  }
}
