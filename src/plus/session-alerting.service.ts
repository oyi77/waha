import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';
import { WAHASessionStatus } from '@waha/structures/enums.dto';

interface AlertConfig {
  enabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
  emailSmtp?: string;
  emailTo?: string;
}

export interface Alert {
  id: string;
  session: string;
  type: 'FAILED' | 'RECOVERED' | 'QR_NEEDED' | 'CONNECTED';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

@Injectable()
export class SessionAlertingService implements OnModuleInit, OnModuleDestroy {
  private alertTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ALERT_CHECK_INTERVAL_MS = 30_000;
  private alerts: Alert[] = [];
  private sessionStatus: Map<string, WAHASessionStatus> = new Map();
  private config: AlertConfig = {
    enabled: true,
  };

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionAlertingService.name);
  }

  onModuleInit() {
    this.loadConfig();
    this.startAlertCheck();
  }

  onModuleDestroy() {
    this.stopAlertCheck();
  }

  private loadConfig() {
    this.config = {
      enabled: process.env.WAHA_ALERTS_ENABLED !== 'false',
      telegramBotToken: process.env.WAHA_ALERTS_TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.WAHA_ALERTS_TELEGRAM_CHAT_ID,
      webhookUrl: process.env.WAHA_ALERTS_WEBHOOK_URL,
    };
  }

  private startAlertCheck() {
    if (!this.config.enabled) return;

    this.log.info(
      `Starting alert check (interval: ${this.ALERT_CHECK_INTERVAL_MS}ms)`,
    );
    this.alertTimer = setInterval(
      () => this.checkForAlerts(),
      this.ALERT_CHECK_INTERVAL_MS,
    );
  }

  private stopAlertCheck() {
    if (this.alertTimer) {
      clearInterval(this.alertTimer);
      this.alertTimer = null;
    }
  }

  private async checkForAlerts() {
    try {
      const sessions = await this.manager.getSessions(false);

      for (const session of sessions) {
        const previousStatus = this.sessionStatus.get(session.name);
        const currentStatus = session.status;

        if (previousStatus && previousStatus !== currentStatus) {
          await this.handleStatusChange(
            session.name,
            previousStatus,
            currentStatus,
          );
        }

        this.sessionStatus.set(session.name, currentStatus);
      }
    } catch (error) {
      this.log.error({ error }, 'Alert check failed');
    }
  }

  private async handleStatusChange(
    session: string,
    previousStatus: WAHASessionStatus,
    currentStatus: WAHASessionStatus,
  ) {
    let alertType: Alert['type'];
    let message: string;

    if (currentStatus === WAHASessionStatus.FAILED) {
      alertType = 'FAILED';
      message = `Session ${session} failed (was ${previousStatus})`;
    } else if (
      previousStatus === WAHASessionStatus.FAILED &&
      currentStatus === WAHASessionStatus.WORKING
    ) {
      alertType = 'RECOVERED';
      message = `Session ${session} recovered and is now WORKING`;
    } else if (currentStatus === WAHASessionStatus.SCAN_QR_CODE) {
      alertType = 'QR_NEEDED';
      message = `Session ${session} needs QR code scan`;
    } else if (currentStatus === WAHASessionStatus.WORKING) {
      alertType = 'CONNECTED';
      message = `Session ${session} connected and working`;
    } else {
      return;
    }

    const alert: Alert = {
      id: `${session}-${Date.now()}`,
      session,
      type: alertType,
      message,
      timestamp: new Date(),
      acknowledged: false,
    };

    this.alerts.push(alert);
    this.log.info(`Alert: ${message}`);

    await this.sendNotification(alert);
  }

  private async sendNotification(alert: Alert) {
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      await this.sendTelegram(alert);
    }

    if (this.config.webhookUrl) {
      await this.sendWebhook(alert);
    }
  }

  private async sendTelegram(alert: Alert) {
    try {
      const emoji =
        alert.type === 'FAILED'
          ? '❌'
          : alert.type === 'RECOVERED'
            ? '✅'
            : alert.type === 'QR_NEEDED'
              ? '📱'
              : '✅';

      const text = `${emoji} WAHA Alert\n\n${alert.message}\n\nTime: ${alert.timestamp.toISOString()}`;

      const response = await fetch(
        `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.config.telegramChatId,
            text,
          }),
        },
      );

      if (!response.ok) {
        this.log.error(`Telegram notification failed: ${response.statusText}`);
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to send Telegram notification');
    }
  }

  private async sendWebhook(alert: Alert) {
    try {
      const response = await fetch(this.config.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        this.log.error(`Webhook notification failed: ${response.statusText}`);
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to send webhook notification');
    }
  }

  async getAlerts(session?: string, acknowledged?: boolean): Promise<Alert[]> {
    let filtered = this.alerts;

    if (session) {
      filtered = filtered.filter((a) => a.session === session);
    }

    if (acknowledged !== undefined) {
      filtered = filtered.filter((a) => a.acknowledged === acknowledged);
    }

    return filtered;
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  async clearAlerts(): Promise<void> {
    this.alerts = [];
  }
}
