import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SessionManager } from '@waha/core/abc/manager.abc';

export interface SessionGroup {
  id: string;
  name: string;
  description: string;
  sessions: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SessionGroupsService {
  private groups: Map<string, SessionGroup> = new Map();

  constructor(
    private readonly manager: SessionManager,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(SessionGroupsService.name);
  }

  async createGroup(
    name: string,
    description: string = '',
    metadata: Record<string, any> = {},
  ): Promise<SessionGroup> {
    const id = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const group: SessionGroup = {
      id,
      name,
      description,
      sessions: [],
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.groups.set(id, group);
    this.log.info(`Created session group: ${name} (${id})`);

    return group;
  }

  async getGroup(groupId: string): Promise<SessionGroup | null> {
    return this.groups.get(groupId) || null;
  }

  async getGroups(): Promise<SessionGroup[]> {
    return Array.from(this.groups.values());
  }

  async updateGroup(
    groupId: string,
    updates: Partial<Pick<SessionGroup, 'name' | 'description' | 'metadata'>>,
  ): Promise<SessionGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;

    if (updates.name) group.name = updates.name;
    if (updates.description) group.description = updates.description;
    if (updates.metadata) group.metadata = updates.metadata;
    group.updatedAt = new Date().toISOString();

    this.groups.set(groupId, group);
    return group;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    return this.groups.delete(groupId);
  }

  async addSessionToGroup(
    groupId: string,
    sessionName: string,
  ): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) return false;

    if (!group.sessions.includes(sessionName)) {
      group.sessions.push(sessionName);
      group.updatedAt = new Date().toISOString();
      this.log.info(`Added session ${sessionName} to group ${group.name}`);
    }

    return true;
  }

  async removeSessionFromGroup(
    groupId: string,
    sessionName: string,
  ): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) return false;

    const index = group.sessions.indexOf(sessionName);
    if (index > -1) {
      group.sessions.splice(index, 1);
      group.updatedAt = new Date().toISOString();
      this.log.info(
        `Removed session ${sessionName} from group ${group.name}`,
      );
    }

    return true;
  }

  async getGroupSessions(groupId: string): Promise<string[]> {
    const group = this.groups.get(groupId);
    return group ? group.sessions : [];
  }

  async getSessionGroups(sessionName: string): Promise<SessionGroup[]> {
    return Array.from(this.groups.values()).filter((g) =>
      g.sessions.includes(sessionName),
    );
  }

  async getGroupHealth(groupId: string): Promise<{
    total: number;
    working: number;
    failed: number;
    healthScore: number;
  }> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { total: 0, working: 0, failed: 0, healthScore: 0 };
    }

    const sessions = await this.manager.getSessions(false);
    const groupSessions = sessions.filter((s) =>
      group.sessions.includes(s.name),
    );

    const total = groupSessions.length;
    const working = groupSessions.filter(
      (s) => s.status === 'WORKING',
    ).length;
    const failed = groupSessions.filter(
      (s) => s.status === 'FAILED',
    ).length;
    const healthScore = total > 0 ? Math.round((working / total) * 100) : 0;

    return { total, working, failed, healthScore };
  }

  async startGroupSessions(groupId: string): Promise<{
    started: number;
    failed: number;
  }> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { started: 0, failed: 0 };
    }

    let started = 0;
    let failed = 0;

    for (const sessionName of group.sessions) {
      try {
        await this.manager.start(sessionName);
        started++;
      } catch (error) {
        failed++;
        this.log.error(
          { error },
          `Failed to start session ${sessionName} in group ${group.name}`,
        );
      }
    }

    return { started, failed };
  }

  async stopGroupSessions(groupId: string): Promise<{
    stopped: number;
    failed: number;
  }> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { stopped: 0, failed: 0 };
    }

    let stopped = 0;
    let failed = 0;

    for (const sessionName of group.sessions) {
      try {
        await this.manager.stop(sessionName, true);
        stopped++;
      } catch (error) {
        failed++;
        this.log.error(
          { error },
          `Failed to stop session ${sessionName} in group ${group.name}`,
        );
      }
    }

    return { stopped, failed };
  }
}
