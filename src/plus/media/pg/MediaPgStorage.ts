import {
  IMediaStorage,
  MediaData,
  MediaStorageData,
} from '@waha/core/media/IMediaStorage';
import { Pool } from 'pg';
import { Logger } from 'pino';
import { MediaPgStorageConfig } from './MediaPgStorageConfig';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS waha_media (
    id SERIAL PRIMARY KEY,
    session TEXT NOT NULL,
    message_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    extension TEXT,
    filename TEXT,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session, message_id, extension)
  );
`;

export class MediaPgStorage extends IMediaStorage {
  private pool: Pool;

  constructor(
    private log: Logger,
    private config: MediaPgStorageConfig,
  ) {
    super();
    this.pool = new Pool({ connectionString: config.connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(CREATE_TABLE_SQL);
    this.log.info('PostgreSQL media storage initialized');
  }

  private async getRow(data: MediaData): Promise<any> {
    const result = await this.pool.query(
      'SELECT id FROM waha_media WHERE session=$1 AND message_id=$2 AND extension=$3',
      [data.session, data.message.id, data.file.extension ?? ''],
    );
    return result.rows[0] ?? null;
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    await this.pool.query(
      `INSERT INTO waha_media (session, message_id, chat_id, extension, filename, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session, message_id, extension) DO UPDATE SET data = EXCLUDED.data`,
      [
        data.session,
        data.message.id,
        data.message.chatId,
        data.file.extension ?? '',
        data.file.filename ?? null,
        buffer,
      ],
    );
    return true;
  }

  async exists(data: MediaData): Promise<boolean> {
    const row = await this.getRow(data);
    return row !== null;
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const ext = data.file.extension ? `.${data.file.extension}` : '';
    const key = `${data.session}/${data.message.chatId}/${data.message.id}${ext}`;
    const baseUrl = process.env.WAHA_PUBLIC_URL ?? 'http://localhost:3000';
    return {
      url: `${baseUrl}/api/media/${encodeURIComponent(key)}`,
    };
  }

  async purge(): Promise<void> {
    const lifetimeDays = parseInt(
      process.env.WAHA_MEDIA_PG_LIFETIME_DAYS ?? '7',
      10,
    );
    if (lifetimeDays <= 0) return;
    await this.pool.query(
      "DELETE FROM waha_media WHERE created_at < NOW() - INTERVAL '1 day' * $1",
      [lifetimeDays],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
