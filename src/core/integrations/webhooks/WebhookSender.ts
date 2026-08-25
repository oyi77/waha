import { SECOND } from '@waha/structures/enums.dto';
import {
  RetryPolicy,
  WebhookConfig,
} from '@waha/structures/webhooks.config.dto';
import { LoggerBuilder } from '@waha/utils/logging';
import { VERSION } from '@waha/version';
import axios, { AxiosInstance } from 'axios';
import axiosRetry, { retryAfter } from 'axios-retry';
import * as crypto from 'crypto';
import { Logger } from 'pino';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const uniqid = require('uniqid');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpAgent = require('agentkeepalive');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpsAgent = require('agentkeepalive').HttpsAgent;

const DEFAULT_RETRY_DELAY_SECONDS = 2;
const DEFAULT_RETRY_ATTEMPTS = 15;
const DEFAULT_HMAC_ALGORITHM = 'sha512';

function noDelay(_retryNumber = 0, error: any) {
  return Math.max(0, retryAfter(error));
}

function constantDelay(delayFactor: number) {
  return (_retryNumber = 0, error = undefined) => {
    return Math.max(delayFactor, retryAfter(error));
  };
}

export function exponentialDelay(delayFactor: number) {
  return (retryNumber = 0, error = undefined) => {
    const calculatedDelay = 2 ** retryNumber * delayFactor;
    const delay = Math.max(calculatedDelay, retryAfter(error));
    const randomSum = delay * 0.2 * Math.random(); // 0-20% of the delay
    return delay + randomSum;
  };
}

/** Shared HMAC header builder — used by real deliveries and the test-webhook probe. */
export function webhookHmacHeaders(
  body: string,
  key?: string | null,
): Record<string, string> {
  if (!key) {
    return {};
  }
  const hmac = crypto
    .createHmac(DEFAULT_HMAC_ALGORITHM, key)
    .update(body)
    .digest('hex');
  return {
    'X-Webhook-Hmac': hmac,
    'X-Webhook-Hmac-Algorithm': DEFAULT_HMAC_ALGORITHM,
  };
}

export class WebhookSender {
  protected static AGENTS = {
    http: new HttpAgent({}),
    https: new HttpsAgent({ rejectUnauthorized: false }),
  };

  protected url: string;
  protected logger: Logger;
  protected readonly config: WebhookConfig;

  protected axios: AxiosInstance;

  /** Delivery counters by event name — exposed via MetricsController (/metrics). */
  private static deliveries = new Map<string, { ok: number; failed: number }>();

  static recordDelivery(event: string, ok: boolean) {
    const key = event || 'unknown';
    const counters =
      WebhookSender.deliveries.get(key) ?? { ok: 0, failed: 0 };
    if (ok) {
      counters.ok++;
    } else {
      counters.failed++;
    }
    WebhookSender.deliveries.set(key, counters);
  }

  /** Prometheus text-exposition lines for webhook deliveries. */
  static metricsLines(): string[] {
    const escape = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const lines = [
      '# HELP waha_webhook_delivery_total Webhook deliveries by event and status',
      '# TYPE waha_webhook_delivery_total counter',
    ];
    for (const [event, counters] of WebhookSender.deliveries) {
      if (counters.ok) {
        lines.push(
          `waha_webhook_delivery_total{event="${escape(event)}",status="ok"} ${counters.ok}`,
        );
      }
      if (counters.failed) {
        lines.push(
          `waha_webhook_delivery_total{event="${escape(event)}",status="failed"} ${counters.failed}`,
        );
      }
    }
    return lines;
  }

  constructor(
    loggerBuilder: LoggerBuilder,
    protected webhookConfig: WebhookConfig,
  ) {
    this.url = webhookConfig.url;
    this.logger = loggerBuilder.child({ name: WebhookSender.name });
    this.config = webhookConfig;
    this.axios = this.buildAxiosInstance();
  }

  send(json: any) {
    const body = JSON.stringify(json);
    const headers = {
      'content-type': 'application/json',
    };
    Object.assign(headers, this.getWebhookHeader(json));
    Object.assign(headers, this.getHMACHeaders(body));
    const ctx = {
      id: headers['X-Webhook-Request-Id'],
      ['event.id']: json.id,
      event: json.event,
      url: this.url,
    };
    this.logger.info(ctx, `Sending POST...`);
    this.logger.debug(ctx, `POST DATA`);

    this.axios
      .post(this.url, body, { headers: headers })
      .then((response) => {
        WebhookSender.recordDelivery(String(json.event ?? 'unknown'), true);
        this.logger.info(
          ctx,
          `POST request was sent with status code: ${response.status}`,
        );
        this.logger.debug(
          {
            ...ctx,
            body: response.data,
          },
          `Response`,
        );
      })
      .catch((error) => {
        WebhookSender.recordDelivery(String(json.event ?? 'unknown'), false);
        this.logger.error(
          {
            ...ctx,
            error: error.message,
            data: error.response?.data,
          },
          `POST request failed: ${error.message}`,
        );
      });
  }

  protected buildAxiosInstance(): AxiosInstance {
    // configure headers
    const customHeaders = this.config.customHeaders || [];
    const headers = {
      'content-type': 'application/json',
      'User-Agent': `WAHA/${VERSION.version}`,
    };
    customHeaders.forEach((header) => {
      headers[header.name] = header.value;
    });

    // configure retry
    const attempts = this.config.retries?.attempts ?? DEFAULT_RETRY_ATTEMPTS;
    const delaySeconds =
      this.config.retries?.delaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS;
    const delayMs = delaySeconds * SECOND;
    const policy = this.config.retries?.policy;
    const retryDelay = this.buildRetryDelay(policy, delayMs);

    const instance = axios.create({
      headers: headers,
      httpAgent: WebhookSender.AGENTS.http,
      httpsAgent: WebhookSender.AGENTS.https,
    });
    axiosRetry(instance, {
      retries: attempts,
      retryDelay: retryDelay,
      retryCondition: (error) => true,
      onRetry: (retryCount, error, requestConfig) => {
        this.logger.warn(
          {
            id: requestConfig.headers['X-Webhook-Request-Id'],
          },
          `Error sending POST request: '${error.message}'. Retrying ${retryCount}/${attempts}...`,
        );
      },
    });
    return instance;
  }

  protected getHMACHeaders(body: string) {
    return webhookHmacHeaders(body, this.config.hmac?.key);
  }

  protected getWebhookHeader(json: any) {
    const timestamp = json.timestamp?.toString() || Date.now().toString();
    return {
      // UUID, no '-' in it
      'X-Webhook-Request-Id': uniqid(),
      // unix timestamp with ms
      'X-Webhook-Timestamp': timestamp,
    };
  }


  private buildRetryDelay(
    policy: RetryPolicy | null,
    ms: number,
  ): (retryNumber: number, error: any) => number {
    if (!ms) {
      this.logger.debug(`Using no delay, because delaySeconds set to 0`);
      return noDelay;
    }

    switch (policy) {
      case RetryPolicy.CONSTANT:
        this.logger.debug(`Using constant delay with '${ms}' ms factor`);
        return constantDelay(ms);

      case RetryPolicy.LINEAR:
        this.logger.debug(`Using linear delay with '${ms}' ms factor`);
        return axiosRetry.linearDelay(ms);

      case RetryPolicy.EXPONENTIAL:
        this.logger.debug(`Using exponential delay with '${ms}' ms factor`);
        return exponentialDelay(ms);

      default:
        this.logger.debug('No delay policy specified, using constant delay');
        return constantDelay(ms);
    }
  }
}
