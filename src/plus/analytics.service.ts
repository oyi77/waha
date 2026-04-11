import { Injectable } from '@nestjs/common';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { generatePrefixedId } from '@waha/utils/ids';
import Knex from 'knex';

const TABLE = 'analytics_counter';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    session TEXT NOT NULL,
    date TEXT NOT NULL,
    metric TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    UNIQUE(session, date, metric)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_session ON ${TABLE}(session)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_date ON ${TABLE}(date)`,
];

export type AnalyticsMetric =
  | 'messages_sent'
  | 'messages_received'
  | 'sessions_started';

export interface DailyStat {
  date: string;
  messages_sent: number;
  messages_received: number;
  sessions_started: number;
}

export interface AnalyticsSummary {
  messages_sent: number;
  messages_received: number;
  sessions_started: number;
}

interface CounterRow {
  id: string;
  session: string;
  date: string;
  metric: string;
  value: number;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

@Injectable()
export class AnalyticsService {
  private _knex: Knex.Knex | null = null;
  private _migrated = false;
  private _manager: SessionManager | null = null;

  constructor() {}

  setManager(m: SessionManager) {
    this._manager = m;
  }

  private async db(): Promise<Knex.Knex> {
    if (!this._knex) {
      if (!this._manager) {
        throw new Error('AnalyticsService: SessionManager not set');
      }
      this._knex = this._manager.store.getWAHADatabase();
    }
    if (!this._migrated) {
      this._migrated = true;
      await this._knex.transaction(async (trx) => {
        for (const sql of MIGRATIONS) await trx.raw(sql);
      });
    }
    return this._knex;
  }

  async increment(
    session: string,
    metric: AnalyticsMetric,
    amount = 1,
  ): Promise<void> {
    const knex = await this.db();
    const date = todayISO();
    // Try to update; if no row exists, insert.
    const updated = await knex(TABLE)
      .where({ session, date, metric })
      .increment('value', amount);
    if (!updated) {
      const row: CounterRow = {
        id: generatePrefixedId('ac'),
        session,
        date,
        metric,
        value: amount,
      };
      try {
        await knex(TABLE).insert(row);
      } catch {
        // Race condition — another writer inserted first. Retry update.
        await knex(TABLE)
          .where({ session, date, metric })
          .increment('value', amount);
      }
    }
  }

  async getDailyStats(session?: string, days = 30): Promise<DailyStat[]> {
    const knex = await this.db();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.max(1, days) + 1);
    cutoff.setHours(0, 0, 0, 0);
    const cutoffISO = (() => {
      const yyyy = cutoff.getFullYear();
      const mm = String(cutoff.getMonth() + 1).padStart(2, '0');
      const dd = String(cutoff.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    let query = knex(TABLE).select('*').where('date', '>=', cutoffISO);
    if (session) query = query.where({ session });
    const rows: CounterRow[] = await query;

    const map = new Map<string, DailyStat>();
    for (const row of rows) {
      const existing: DailyStat = map.get(row.date) ?? {
        date: row.date,
        messages_sent: 0,
        messages_received: 0,
        sessions_started: 0,
      };
      if (row.metric === 'messages_sent') existing.messages_sent += row.value;
      else if (row.metric === 'messages_received')
        existing.messages_received += row.value;
      else if (row.metric === 'sessions_started')
        existing.sessions_started += row.value;
      map.set(row.date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getSummary(session?: string): Promise<AnalyticsSummary> {
    const knex = await this.db();
    let query = knex(TABLE).select('metric').sum<{ metric: string; total: any }[]>({
      total: 'value',
    } as any);
    if (session) query = query.where({ session });
    query = query.groupBy('metric');
    const rows: { metric: string; total: number | string | null }[] = await query;

    const summary: AnalyticsSummary = {
      messages_sent: 0,
      messages_received: 0,
      sessions_started: 0,
    };
    for (const row of rows) {
      const total = Number(row.total ?? 0);
      if (row.metric === 'messages_sent') summary.messages_sent = total;
      else if (row.metric === 'messages_received') summary.messages_received = total;
      else if (row.metric === 'sessions_started') summary.sessions_started = total;
    }
    return summary;
  }
}
