import { Logger } from '@nestjs/common';

/**
 * Outbound send rate limiting (anti-ban).
 *
 * WhatsApp bans accounts that blast messages with no human-like pacing.
 * Every method starting with "send" on a working-session facade is routed
 * through a per-session serial queue that enforces a minimum spacing between
 * sends plus random jitter, so bursts from automation (bulk outreach,
 * notifications, auto-replies) never leave in a tight packet.
 *
 * Configuration (environment):
 * - WHATSAPP_SEND_QUEUE_ENABLED       default "true"
 * - WHATSAPP_SEND_QUEUE_MIN_DELAY_MS  minimum ms between send starts (default 800)
 * - WHATSAPP_SEND_QUEUE_JITTER_MS     random extra delay 0..N ms   (default 400)
 */

const ENV_ENABLED = 'WHATSAPP_SEND_QUEUE_ENABLED';
const ENV_MIN_DELAY_MS = 'WHATSAPP_SEND_QUEUE_MIN_DELAY_MS';
const ENV_JITTER_MS = 'WHATSAPP_SEND_QUEUE_JITTER_MS';

const DEFAULT_MIN_DELAY_MS = 800;
const DEFAULT_JITTER_MS = 400;

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return !['false', '0', 'off', 'no'].includes(raw.toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function isSendQueueEnabled(): boolean {
  return envBool(ENV_ENABLED, true);
}

function minDelayMs(): number {
  return envInt(ENV_MIN_DELAY_MS, DEFAULT_MIN_DELAY_MS);
}

function jitterMs(): number {
  return envInt(ENV_JITTER_MS, DEFAULT_JITTER_MS);
}

function sleep(ms: number): Promise<void> {
  // Project TS lib target predates ES2024 — Promise.withResolvers unavailable.
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Serial gate: one send at a time per session, spaced by
 * minDelay + random(0..jitter) measured between send STARTS.
 */
class SendGate {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStartAt = 0;

  constructor(private readonly log: Logger) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const exec = this.chain.then(async () => {
      const minDelay = minDelayMs();
      const jitter = jitterMs();
      const waitMs =
        this.lastStartAt === 0
          ? 0
          : this.lastStartAt + minDelay + Math.random() * jitter - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.lastStartAt = Date.now();
      if (waitMs > minDelay) {
        this.log.debug(`Send queued ${Math.round(waitMs)}ms behind previous`);
      }
      return fn();
    });
    // Keep the chain alive regardless of individual failures.
    this.chain = exec.catch(() => undefined);
    return exec;
  }
}

const gates = new Map<string, SendGate>();
let loggerRef: Logger | null = null;

function gateFor(sessionName: string): SendGate {
  let gate = gates.get(sessionName);
  if (!gate) {
    if (!loggerRef) {
      loggerRef = new Logger('SendRateGate');
    }
    gate = new SendGate(loggerRef);
    gates.set(sessionName, gate);
  }
  return gate;
}

const SEND_METHOD_RE = /^send[A-Z_$]/;

/**
 * Wrap a working session so every public `sendXxx(...)` call is paced by the
 * per-session gate. All other members are passed through untouched.
 */
export function rateLimitSessionSends<T extends object>(
  sessionName: string,
  session: T,
): T {
  if (!isSendQueueEnabled()) {
    return session;
  }
  return new Proxy(session, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (
        typeof prop === 'string' &&
        typeof value === 'function' &&
        SEND_METHOD_RE.test(prop)
      ) {
        const gate = gateFor(sessionName);
        return (...args: unknown[]) =>
          gate.run(() =>
            (value as (...a: unknown[]) => unknown).apply(target, args),
          );
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Test/introspection helper. */
export function resetSendGates(): void {
  gates.clear();
}
