import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

export interface WebhookDelivery {
  id: string;
  url: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  maxAttempts: number;
  nextRetry: number;
  lastError?: string;
  createdAt: string;
  deliveredAt?: string;
}

@Injectable()
export class WebhookReliabilityService implements OnModuleInit, OnModuleDestroy {
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private readonly PROCESS_INTERVAL_MS = 5_000;
  private readonly MAX_ATTEMPTS = 5;
  private readonly RETRY_DELAYS = [1000, 5000, 15000, 60000, 300000];
  private deliveryQueue: WebhookDelivery[] = [];

  constructor(private readonly log: PinoLogger) {
    this.log.setContext(WebhookReliabilityService.name);
  }

  onModuleInit() {
    this.startProcessing();
  }

  onModuleDestroy() {
    this.stopProcessing();
  }

  private startProcessing() {
    this.log.info(
      `Starting webhook delivery processor (interval: ${this.PROCESS_INTERVAL_MS}ms)`,
    );
    this.processTimer = setInterval(
      () => this.processQueue(),
      this.PROCESS_INTERVAL_MS,
    );
  }

  private stopProcessing() {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
  }

  private async processQueue() {
    const now = Date.now();
    const pending = this.deliveryQueue.filter(
      (d) => d.status === 'pending' && d.nextRetry <= now,
    );

    for (const delivery of pending) {
      await this.deliverWebhook(delivery);
    }

    this.cleanupOldDeliveries();
  }

  private async deliverWebhook(delivery: WebhookDelivery) {
    try {
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        delivery.status = 'delivered';
        delivery.deliveredAt = new Date().toISOString();
        this.log.info(
          `Webhook delivered: ${delivery.id} to ${delivery.url}`,
        );
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      delivery.attempts++;
      delivery.lastError = error instanceof Error ? error.message : 'Unknown error';

      if (delivery.attempts >= delivery.maxAttempts) {
        delivery.status = 'failed';
        this.log.error(
          `Webhook delivery failed after ${delivery.attempts} attempts: ${delivery.id}`,
        );
      } else {
        const delayIndex = Math.min(
          delivery.attempts - 1,
          this.RETRY_DELAYS.length - 1,
        );
        delivery.nextRetry = Date.now() + this.RETRY_DELAYS[delayIndex];
        this.log.warn(
          `Webhook delivery retry ${delivery.attempts}/${delivery.maxAttempts}: ${delivery.id}`,
        );
      }
    }
  }

  async queueWebhook(url: string, payload: any): Promise<string> {
    const delivery: WebhookDelivery = {
      id: `wh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
      nextRetry: Date.now(),
      createdAt: new Date().toISOString(),
    };

    this.deliveryQueue.push(delivery);
    this.log.info(`Webhook queued: ${delivery.id} to ${url}`);

    return delivery.id;
  }

  async getDeliveryStatus(deliveryId: string): Promise<WebhookDelivery | null> {
    return this.deliveryQueue.find((d) => d.id === deliveryId) || null;
  }

  async getDeliveries(
    status?: WebhookDelivery['status'],
  ): Promise<WebhookDelivery[]> {
    if (status) {
      return this.deliveryQueue.filter((d) => d.status === status);
    }
    return this.deliveryQueue;
  }

  async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveryQueue.find((d) => d.id === deliveryId);
    if (delivery && delivery.status === 'failed') {
      delivery.status = 'pending';
      delivery.attempts = 0;
      delivery.nextRetry = Date.now();
      return true;
    }
    return false;
  }

  private cleanupOldDeliveries() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.deliveryQueue = this.deliveryQueue.filter(
      (d) =>
        d.status === 'pending' ||
        new Date(d.createdAt).getTime() > oneDayAgo,
    );
  }

  getStats() {
    const total = this.deliveryQueue.length;
    const pending = this.deliveryQueue.filter(
      (d) => d.status === 'pending',
    ).length;
    const delivered = this.deliveryQueue.filter(
      (d) => d.status === 'delivered',
    ).length;
    const failed = this.deliveryQueue.filter(
      (d) => d.status === 'failed',
    ).length;

    return {
      total,
      pending,
      delivered,
      failed,
      successRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    };
  }
}
