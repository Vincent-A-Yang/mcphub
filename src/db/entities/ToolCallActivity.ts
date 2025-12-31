import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tool call activity entity for logging tool invocations (DB mode only)
 */
@Entity({ name: 'tool_call_activities' })
export class ToolCallActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'server_name' })
  serverName: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'tool_name' })
  toolName: string;

  @Index()
  @Column({ type: 'varchar', length: 255, name: 'key_id', nullable: true })
  keyId?: string;

  @Column({ type: 'varchar', length: 255, name: 'key_name', nullable: true })
  keyName?: string;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'success' | 'error';

  @Column({ type: 'text', nullable: true })
  request?: string;

  @Column({ type: 'text', nullable: true })
  response?: string;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage?: string;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  durationMs?: number;

  @Column({ type: 'varchar', length: 100, name: 'client_ip', nullable: true })
  clientIp?: string;

  @Column({ type: 'varchar', length: 255, name: 'session_id', nullable: true })
  sessionId?: string;

  @Column({ type: 'varchar', length: 255, name: 'group_name', nullable: true })
  groupName?: string;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

export default ToolCallActivity;
