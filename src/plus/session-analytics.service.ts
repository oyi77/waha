import { Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';

export interface SessionStats {
  session: string;
  messagesSent: number;
  messagesReceived: number;
  uptime: number;
  lastActivity: string;
  errors: number;
  restarts: number;
}

export interface AnalyticsSummary {
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  averageUptime: number;
  topSessions: SessionStats[];
  period: string;
}

@Injectable()
export class SessionAnalyticsService implements OnModuleInit {
  private stats: Map<string, SessionStats> = new Map();
  private sessionStartTimes: Map<string, number> = new Map();

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionAnalyticsService.name);
  }

  onModuleInit() {
    this.initializeStats();
  }

  private async initializeStats() {
    const sessions = await this.manager.getSessions(false);
    for (const session of sessions) {
      if (!this.stats.has(session.name)) {
        this.stats.set(session.name, {
          session: session.name,
          messagesSent: 0,
          messagesReceived: 0,
          uptime: 0,
          lastActivity: new Date().toISOString(),
          errors: 0,
          restarts: 0,
        });
      }
      if (!this.sessionStartTimes.has(session.name)) {
        this.sessionStartTimes.set(session.name, Date.now());
      }
    }
  }

  async recordMessage(session: string, direction: 'sent' | 'received') {
    let stats = this.stats.get(session);
    if (!stats) {
      stats = {
        session,
        messagesSent: 0,
        messagesReceived: 0,
        uptime: 0,
        lastActivity: new Date().toISOString(),
        errors: 0,
        restarts: 0,
      };
      this.stats.set(session, stats);
    }

    if (direction === 'sent') {
      stats.messagesSent++;
    } else {
      stats.messagesReceived++;
    }
    stats.lastActivity = new Date().toISOString();
  }

  async recordError(session: string) {
    let stats = this.stats.get(session);
    if (!stats) {
      stats = {
        session,
        messagesSent: 0,
        messagesReceived: 0,
        uptime: 0,
        lastActivity: new Date().toISOString(),
        errors: 0,
        restarts: 0,
      };
      this.stats.set(session, stats);
    }
    stats.errors++;
  }

  async recordRestart(session: string) {
    let stats = this.stats.get(session);
    if (!stats) {
      stats = {
        session,
        messagesSent: 0,
        messagesReceived: 0,
        uptime: 0,
        lastActivity: new Date().toISOString(),
        errors: 0,
        restarts: 0,
      };
      this.stats.set(session, stats);
    }
    stats.restarts++;
    this.sessionStartTimes.set(session, Date.now());
  }

  async getSessionStats(session: string): Promise<SessionStats | null> {
    const stats = this.stats.get(session);
    if (!stats) return null;

    const startTime = this.sessionStartTimes.get(session) || Date.now();
    stats.uptime = Math.round((Date.now() - startTime) / 1000 / 60 / 60);

    return stats;
  }

  async getAllStats(): Promise<SessionStats[]> {
    const allStats: SessionStats[] = [];

    for (const [session, stats] of this.stats.entries()) {
      const startTime = this.sessionStartTimes.get(session) || Date.now();
      stats.uptime = Math.round((Date.now() - startTime) / 1000 / 60 / 60);
      allStats.push(stats);
    }

    return allStats;
  }

  async getSummary(period: 'day' | 'week' | 'month' = 'day'): Promise<AnalyticsSummary> {
    const allStats = await this.getAllStats();
    const sessions = await this.manager.getSessions(false);

    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(
      (s) => s.status === 'WORKING',
    ).length;
    const totalMessages = allStats.reduce(
      (sum, s) => sum + s.messagesSent + s.messagesReceived,
      0,
    );
    const averageUptime =
      allStats.length > 0
        ? Math.round(
            allStats.reduce((sum, s) => sum + s.uptime, 0) / allStats.length,
          )
        : 0;

    const topSessions = allStats
      .sort(
        (a, b) =>
          b.messagesSent + b.messagesReceived - (a.messagesSent + a.messagesReceived),
      )
      .slice(0, 10);

    return {
      totalSessions,
      activeSessions,
      totalMessages,
      averageUptime,
      topSessions,
      period,
    };
  }

  async getSessionPerformance(session: string): Promise<{
    messagesPerHour: number;
    errorRate: number;
    uptimePercentage: number;
  }> {
    const stats = await this.getSessionStats(session);
    if (!stats) {
      return { messagesPerHour: 0, errorRate: 0, uptimePercentage: 0 };
    }

    const hours = Math.max(stats.uptime, 1);
    const messagesPerHour = Math.round(
      (stats.messagesSent + stats.messagesReceived) / hours,
    );
    const totalOperations =
      stats.messagesSent + stats.messagesReceived + stats.errors;
    const errorRate =
      totalOperations > 0
        ? Math.round((stats.errors / totalOperations) * 100)
        : 0;
    const uptimePercentage = stats.uptime > 0 ? 100 : 0;

    return { messagesPerHour, errorRate, uptimePercentage };
  }

  async resetStats(session?: string) {
    if (session) {
      this.stats.delete(session);
      this.sessionStartTimes.delete(session);
    } else {
      this.stats.clear();
      this.sessionStartTimes.clear();
    }
  }
}
