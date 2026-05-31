import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private readonly WINDOW_MS = 60 * 1000;
  private readonly MAX_REQUESTS = 100;

  use(req: Request, res: Response, next: NextFunction) {
    const clientId = this.getClientId(req);
    const now = Date.now();

    let entry = this.rateLimits.get(clientId);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.WINDOW_MS,
      };
      this.rateLimits.set(clientId, entry);
    }

    entry.count++;

    const remaining = Math.max(0, this.MAX_REQUESTS - entry.count);
    const resetTime = Math.ceil((entry.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', this.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (entry.count > this.MAX_REQUESTS) {
      res.status(429).json({
        message: 'Too many requests',
        retryAfter: resetTime,
      });
      return;
    }

    next();
  }

  private getClientId(req: Request): string {
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      return `api:${apiKey}`;
    }

    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0] : req.ip;

    return `ip:${ip}`;
  }
}
