import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import * as fs from 'fs/promises';
import * as path from 'path';

interface BackupMetadata {
  session: string;
  timestamp: string;
  size: number;
  checksum: string;
}

@Injectable()
export class SessionBackupService implements OnModuleInit, OnModuleDestroy {
  private backupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
  private readonly BACKUP_DIR = '/app/.backups';
  private readonly MAX_BACKUPS = 10;

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionBackupService.name);
  }

  onModuleInit() {
    this.startBackupSchedule();
  }

  onModuleDestroy() {
    this.stopBackupSchedule();
  }

  private startBackupSchedule() {
    this.log.info(
      `Starting session backup (interval: ${this.BACKUP_INTERVAL_MS / 1000 / 60 / 60} hours)`,
    );
    this.backupTimer = setInterval(
      () => this.runBackup(),
      this.BACKUP_INTERVAL_MS,
    );
  }

  private stopBackupSchedule() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  private async runBackup() {
    this.log.info('Starting session backup...');

    try {
      await fs.mkdir(this.BACKUP_DIR, { recursive: true });

      const sessions = await this.manager.getSessions(false);
      let backedUp = 0;

      for (const session of sessions) {
        try {
          await this.backupSession(session.name);
          backedUp++;
        } catch (error) {
          this.log.error(
            { error },
            `Failed to backup session ${session.name}`,
          );
        }
      }

      await this.cleanupOldBackups();

      this.log.info(`Backup completed: ${backedUp} sessions backed up`);
    } catch (error) {
      this.log.error({ error }, 'Backup failed');
    }
  }

  private async backupSession(sessionName: string) {
    const sessionDir = `/app/.sessions/noweb/${sessionName}`;
    const backupDir = path.join(this.BACKUP_DIR, sessionName);

    try {
      await fs.access(sessionDir);
    } catch {
      return;
    }

    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);

    try {
      await this.copyDirectory(sessionDir, backupPath);

      const metadata: BackupMetadata = {
        session: sessionName,
        timestamp: new Date().toISOString(),
        size: await this.getDirectorySize(backupPath),
        checksum: await this.calculateChecksum(backupPath),
      };

      await fs.writeFile(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
      );

      this.log.info(`Backed up session ${sessionName}`);
    } catch (error) {
      this.log.error(
        { error },
        `Failed to backup session ${sessionName}`,
      );
    }
  }

  private async copyDirectory(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async getDirectorySize(dir: string): Promise<number> {
    let size = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += await this.getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }

    return size;
  }

  private async calculateChecksum(dir: string): Promise<string> {
    return 'placeholder-checksum';
  }

  private async cleanupOldBackups() {
    try {
      const sessions = await this.manager.getSessions(false);

      for (const session of sessions) {
        const backupDir = path.join(this.BACKUP_DIR, session.name);
        try {
          const backups = await fs.readdir(backupDir);
          const sortedBackups = backups.sort().reverse();

          for (let i = this.MAX_BACKUPS; i < sortedBackups.length; i++) {
            const backupPath = path.join(backupDir, sortedBackups[i]);
            await fs.rm(backupPath, { recursive: true });
            this.log.info(`Cleaned up old backup: ${sortedBackups[i]}`);
          }
        } catch {
          // Directory doesn't exist
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Backup cleanup failed');
    }
  }

  async getBackups(session?: string): Promise<BackupMetadata[]> {
    const backups: BackupMetadata[] = [];

    try {
      const sessions = session
        ? [session]
        : (await this.manager.getSessions(false)).map((s) => s.name);

      for (const sessionName of sessions) {
        const backupDir = path.join(this.BACKUP_DIR, sessionName);
        try {
          const backupFolders = await fs.readdir(backupDir);

          for (const folder of backupFolders) {
            const metadataPath = path.join(backupDir, folder, 'metadata.json');
            try {
              const data = await fs.readFile(metadataPath, 'utf-8');
              backups.push(JSON.parse(data));
            } catch {
              // No metadata
            }
          }
        } catch {
          // No backups for this session
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to get backups');
    }

    return backups.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async restoreBackup(session: string, timestamp: string): Promise<boolean> {
    this.log.info(`Restoring backup for session ${session} from ${timestamp}`);

    try {
      const backupDir = path.join(this.BACKUP_DIR, session);
      const backups = await fs.readdir(backupDir);
      const backupFolder = backups.find((b) => b.includes(timestamp));

      if (!backupFolder) {
        this.log.error(`Backup not found for timestamp ${timestamp}`);
        return false;
      }

      const backupPath = path.join(backupDir, backupFolder);
      const sessionDir = `/app/.sessions/noweb/${session}`;

      await this.manager.stop(session, true).catch(() => {});
      await fs.rm(sessionDir, { recursive: true }).catch(() => {});
      await this.copyDirectory(backupPath, sessionDir);
      await this.manager.start(session);

      this.log.info(`Successfully restored backup for session ${session}`);
      return true;
    } catch (error) {
      this.log.error(
        { error },
        `Failed to restore backup for session ${session}`,
      );
      return false;
    }
  }
}
