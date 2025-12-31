import { Repository, FindOptionsWhere, ILike, Between } from 'typeorm';
import { ToolCallActivity } from '../entities/ToolCallActivity.js';
import { getAppDataSource } from '../connection.js';

/**
 * Search parameters for filtering tool call activities
 */
export interface ToolCallActivitySearchParams {
  serverName?: string;
  toolName?: string;
  keyId?: string;
  status?: 'pending' | 'success' | 'error';
  groupName?: string;
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}

/**
 * Pagination result for tool call activities
 */
export interface ToolCallActivityPage {
  items: ToolCallActivity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Repository for ToolCallActivity entity
 */
export class ToolCallActivityRepository {
  private repository: Repository<ToolCallActivity>;

  constructor() {
    this.repository = getAppDataSource().getRepository(ToolCallActivity);
  }

  /**
   * Create a new tool call activity
   */
  async create(
    activity: Omit<ToolCallActivity, 'id' | 'createdAt'>,
  ): Promise<ToolCallActivity> {
    const newActivity = this.repository.create(activity);
    return await this.repository.save(newActivity);
  }

  /**
   * Find activity by ID
   */
  async findById(id: string): Promise<ToolCallActivity | null> {
    return await this.repository.findOne({ where: { id } });
  }

  /**
   * Update an existing activity
   */
  async update(
    id: string,
    updates: Partial<ToolCallActivity>,
  ): Promise<ToolCallActivity | null> {
    const activity = await this.findById(id);
    if (!activity) {
      return null;
    }
    const updated = this.repository.merge(activity, updates);
    return await this.repository.save(updated);
  }

  /**
   * Delete an activity
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  /**
   * Find activities with pagination and filtering
   */
  async findWithPagination(
    page: number = 1,
    pageSize: number = 20,
    params: ToolCallActivitySearchParams = {},
  ): Promise<ToolCallActivityPage> {
    const where: FindOptionsWhere<ToolCallActivity>[] = [];
    const baseWhere: FindOptionsWhere<ToolCallActivity> = {};

    // Add filters
    if (params.serverName) {
      baseWhere.serverName = params.serverName;
    }
    if (params.toolName) {
      baseWhere.toolName = params.toolName;
    }
    if (params.keyId) {
      baseWhere.keyId = params.keyId;
    }
    if (params.status) {
      baseWhere.status = params.status;
    }
    if (params.groupName) {
      baseWhere.groupName = params.groupName;
    }
    if (params.startDate && params.endDate) {
      baseWhere.createdAt = Between(params.startDate, params.endDate);
    }

    // Handle search query - search across multiple fields
    if (params.searchQuery) {
      const searchPattern = `%${params.searchQuery}%`;
      where.push(
        { ...baseWhere, serverName: ILike(searchPattern) },
        { ...baseWhere, toolName: ILike(searchPattern) },
        { ...baseWhere, keyName: ILike(searchPattern) },
        { ...baseWhere, groupName: ILike(searchPattern) },
      );
    } else {
      where.push(baseWhere);
    }

    const [items, total] = await this.repository.findAndCount({
      where: where.length > 0 ? where : undefined,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get recent activities
   */
  async findRecent(limit: number = 10): Promise<ToolCallActivity[]> {
    return await this.repository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get activity statistics
   */
  async getStats(): Promise<{
    total: number;
    success: number;
    error: number;
    pending: number;
    avgDurationMs: number;
  }> {
    const stats = await this.repository
      .createQueryBuilder('activity')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN status = \'success\' THEN 1 ELSE 0 END) as success',
        'SUM(CASE WHEN status = \'error\' THEN 1 ELSE 0 END) as error',
        'SUM(CASE WHEN status = \'pending\' THEN 1 ELSE 0 END) as pending',
        'AVG(duration_ms) as avgDurationMs',
      ])
      .getRawOne();

    return {
      total: parseInt(stats?.total || '0', 10),
      success: parseInt(stats?.success || '0', 10),
      error: parseInt(stats?.error || '0', 10),
      pending: parseInt(stats?.pending || '0', 10),
      avgDurationMs: parseFloat(stats?.avgDurationMs || '0'),
    };
  }

  /**
   * Delete old activities (cleanup)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('created_at < :date', { date })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Count total activities
   */
  async count(): Promise<number> {
    return await this.repository.count();
  }
}

export default ToolCallActivityRepository;
