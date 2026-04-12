import { Injectable } from '@nestjs/common';
import { makeAuthToken } from '@waha/core/auth/dashboardCookieAuth';
import * as crypto from 'crypto';

import { AbstractKnexService } from './AbstractKnexService';

const TABLE = 'dashboard_settings';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

const SETTINGS_KEYS = {
  username: 'dashboard_username',
  passwordHash: 'dashboard_password_hash',
  authToken: 'dashboard_auth_token',
} as const;

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

@Injectable()
export class SettingsService extends AbstractKnexService {
  protected get serviceName() {
    return 'SettingsService';
  }

  protected get migrations() {
    return MIGRATIONS;
  }

  private async getSetting(key: string): Promise<string | null> {
    const knex = await this.db();
    const row = await knex(TABLE).where({ key: key }).first();
    return row ? row.value : null;
  }

  private async setSetting(key: string, value: string): Promise<void> {
    const knex = await this.db();
    await knex.raw(
      `INSERT INTO ${TABLE} (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  async getStoredCredentials(): Promise<{
    username: string;
    passwordHash: string;
  } | null> {
    const username = await this.getSetting(SETTINGS_KEYS.username);
    const passwordHash = await this.getSetting(SETTINGS_KEYS.passwordHash);
    if (!username || !passwordHash) {
      return null;
    }
    return { username, passwordHash };
  }

  async getStoredUsername(): Promise<string | null> {
    return this.getSetting(SETTINGS_KEYS.username);
  }

  async saveCredentials(username: string, password: string): Promise<void> {
    await this.setSetting(SETTINGS_KEYS.username, username);
    await this.setSetting(SETTINGS_KEYS.passwordHash, hashPassword(password));
    // Store the pre-computed HMAC token so raw password never persists to disk.
    // The token is re-computed and updated on every successful login, which keeps
    // it valid across server restarts even when WAHA_DASHBOARD_SECRET is ephemeral.
    await this.setSetting(SETTINGS_KEYS.authToken, makeAuthToken(username, password));
  }

  async verifyPassword(password: string): Promise<boolean> {
    const stored = await this.getSetting(SETTINGS_KEYS.passwordHash);
    if (!stored) {
      return false;
    }
    const hash = hashPassword(password);
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'utf8'),
      Buffer.from(stored, 'utf8'),
    );
  }

  async getStoredAuthToken(): Promise<string | null> {
    return this.getSetting(SETTINGS_KEYS.authToken);
  }

  async refreshAuthToken(username: string, password: string): Promise<void> {
    await this.setSetting(SETTINGS_KEYS.authToken, makeAuthToken(username, password));
  }
}
