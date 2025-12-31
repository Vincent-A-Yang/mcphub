import {
  IToolCallActivity,
  IToolCallActivitySearchParams,
  IToolCallActivityPage,
  IToolCallActivityStats,
} from '../types/index.js';
import { ToolCallActivityRepository } from '../db/repositories/ToolCallActivityRepository.js';

/**
 * Tool Call Activity DAO interface (DB mode only)
 */
export interface ToolCallActivityDao {
  /**
   * Create a new tool call activity
   */
  create(activity: Omit<IToolCallActivity, 'id' | 'createdAt'>): Promise<IToolCallActivity>;

  /**
   * Find activity by ID
   */
  findById(id: string): Promise<IToolCallActivity | null>;

  /**
   * Update an existing activity
   */
  update(id: string, updates: Partial<IToolCallActivity>): Promise<IToolCallActivity | null>;

  /**
   * Delete an activity
   */
  delete(id: string): Promise<boolean>;

  /**
   * Find activities with pagination and filtering
   */
  findWithPagination(
    page: number,
    pageSize: number,
    params?: IToolCallActivitySearchParams,
  ): Promise<IToolCallActivityPage>;

  /**
   * Get recent activities
   */
  findRecent(limit: number): Promise<IToolCallActivity[]>;

  /**
   * Get activity statistics
   */
  getStats(): Promise<IToolCallActivityStats>;

  /**
   * Delete old activities (cleanup)
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Count total activities
   */
  count(): Promise<number>;
}

/**
 * Database-backed implementation of ToolCallActivityDao
 */
export class ToolCallActivityDaoDbImpl implements ToolCallActivityDao {
  private repository: ToolCallActivityRepository;

  constructor() {
    this.repository = new ToolCallActivityRepository();
  }

  async create(activity: Omit<IToolCallActivity, 'id' | 'createdAt'>): Promise<IToolCallActivity> {
    const created = await this.repository.create({
      serverName: activity.serverName,
      toolName: activity.toolName,
      keyId: activity.keyId,
      keyName: activity.keyName,
      status: activity.status,
      request: activity.request,
      response: activity.response,
      errorMessage: activity.errorMessage,
      durationMs: activity.durationMs,
      clientIp: activity.clientIp,
      sessionId: activity.sessionId,
      groupName: activity.groupName,
    });
    return this.mapToInterface(created);
  }

  async findById(id: string): Promise<IToolCallActivity | null> {
    const activity = await this.repository.findById(id);
    return activity ? this.mapToInterface(activity) : null;
  }

  async update(
    id: string,
    updates: Partial<IToolCallActivity>,
  ): Promise<IToolCallActivity | null> {
    const updated = await this.repository.update(id, {
      serverName: updates.serverName,
      toolName: updates.toolName,
      keyId: updates.keyId,
      keyName: updates.keyName,
      status: updates.status,
      request: updates.request,
      response: updates.response,
      errorMessage: updates.errorMessage,
      durationMs: updates.durationMs,
      clientIp: updates.clientIp,
      sessionId: updates.sessionId,
      groupName: updates.groupName,
    });
    return updated ? this.mapToInterface(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    return await this.repository.delete(id);
  }

  async findWithPagination(
    page: number = 1,
    pageSize: number = 20,
    params: IToolCallActivitySearchParams = {},
  ): Promise<IToolCallActivityPage> {
    const result = await this.repository.findWithPagination(page, pageSize, params);
    return {
      items: result.items.map((item) => this.mapToInterface(item)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  }

  async findRecent(limit: number = 10): Promise<IToolCallActivity[]> {
    const activities = await this.repository.findRecent(limit);
    return activities.map((activity) => this.mapToInterface(activity));
  }

  async getStats(): Promise<IToolCallActivityStats> {
    return await this.repository.getStats();
  }

  async deleteOlderThan(date: Date): Promise<number> {
    return await this.repository.deleteOlderThan(date);
  }

  async count(): Promise<number> {
    return await this.repository.count();
  }

  private mapToInterface(activity: {
    id: string;
    serverName: string;
    toolName: string;
    keyId?: string;
    keyName?: string;
    status: 'pending' | 'success' | 'error';
    request?: string;
    response?: string;
    errorMessage?: string;
    durationMs?: number;
    clientIp?: string;
    sessionId?: string;
    groupName?: string;
    createdAt: Date;
  }): IToolCallActivity {
    return {
      id: activity.id,
      serverName: activity.serverName,
      toolName: activity.toolName,
      keyId: activity.keyId,
      keyName: activity.keyName,
      status: activity.status,
      request: activity.request,
      response: activity.response,
      errorMessage: activity.errorMessage,
      durationMs: activity.durationMs,
      clientIp: activity.clientIp,
      sessionId: activity.sessionId,
      groupName: activity.groupName,
      createdAt: activity.createdAt,
    };
  }
}
