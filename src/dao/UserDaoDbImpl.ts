import bcrypt from 'bcrypt';
import { UserDao } from './index.js';
import { IUser } from '../types/index.js';
import { UserRepository } from '../db/repositories/UserRepository.js';

/**
 * Database-backed implementation of UserDao
 */
export class UserDaoDbImpl implements UserDao {
  private repository: UserRepository;

  constructor() {
    this.repository = new UserRepository();
  }

  private mapToIUser(u: any): IUser {
    return {
      username: u.username,
      password: u.password,
      isAdmin: u.isAdmin,
      oauthProvider: u.oauthProvider,
      oauthSubject: u.oauthSubject,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    };
  }

  async findAll(): Promise<IUser[]> {
    const users = await this.repository.findAll();
    return users.map(this.mapToIUser);
  }

  async findById(username: string): Promise<IUser | null> {
    const user = await this.repository.findByUsername(username);
    if (!user) return null;
    return this.mapToIUser(user);
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return await this.findById(username);
  }

  async create(entity: Omit<IUser, 'id'>): Promise<IUser> {
    const user = await this.repository.create({
      username: entity.username,
      password: entity.password,
      isAdmin: entity.isAdmin || false,
      oauthProvider: entity.oauthProvider,
      oauthSubject: entity.oauthSubject,
      email: entity.email,
      displayName: entity.displayName,
      avatarUrl: entity.avatarUrl,
    });
    return this.mapToIUser(user);
  }

  async createWithHashedPassword(
    username: string,
    password: string,
    isAdmin: boolean,
  ): Promise<IUser> {
    const hashedPassword = await bcrypt.hash(password, 10);
    return await this.create({ username, password: hashedPassword, isAdmin });
  }

  async update(username: string, entity: Partial<IUser>): Promise<IUser | null> {
    const user = await this.repository.update(username, {
      password: entity.password,
      isAdmin: entity.isAdmin,
      oauthProvider: entity.oauthProvider,
      oauthSubject: entity.oauthSubject,
      email: entity.email,
      displayName: entity.displayName,
      avatarUrl: entity.avatarUrl,
    });
    if (!user) return null;
    return this.mapToIUser(user);
  }

  async delete(username: string): Promise<boolean> {
    return await this.repository.delete(username);
  }

  async exists(username: string): Promise<boolean> {
    return await this.repository.exists(username);
  }

  async count(): Promise<number> {
    return await this.repository.count();
  }

  async validateCredentials(username: string, password: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    if (!user) {
      return false;
    }
    return await bcrypt.compare(password, user.password);
  }

  async updatePassword(username: string, newPassword: string): Promise<boolean> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await this.update(username, { password: hashedPassword });
    return result !== null;
  }

  async findAdmins(): Promise<IUser[]> {
    const users = await this.repository.findAdmins();
    return users.map(this.mapToIUser);
  }
}
