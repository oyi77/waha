import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Brute-force protection for POST /api/dashboard/login.
 * Counts every login ATTEMPT per client IP (Cloudflare-connecting-ip aware)
 * within a sliding window and answers 429 once the cap is exceeded.
 * Expired entries are pruned lazily on each request so the map stays small.
 */
@Injectable()
export class LoginRateLimitMiddleware implements NestMiddleware {
  private readonly WINDOW_MS = 60_000;
  private readonly MAX_ATTEMPTS = 10;
  private attempts: Map<string, RateLimitEntry> = new Map();

  use(req: Request, res: Response, next: NextFunction) {
    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
      req.socket?.remoteAddress ||
      'unknown';
    const now = Date.now();

    // Lazy prune
    for (const [key, entry] of this.attempts) {
      if (entry.resetTime <= now) this.attempts.delete(key);
    }

    const entry = this.attempts.get(ip);
    if (!entry || entry.resetTime <= now) {
      this.attempts.set(ip, { count: 1, resetTime: now + this.WINDOW_MS });
      return next();
    }

    entry.count += 1;
    if (entry.count > this.MAX_ATTEMPTS) {
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      return res.status(429).json({
        error: 'Too many login attempts. Try again later.',
      });
    }
    return next();
  }
}
