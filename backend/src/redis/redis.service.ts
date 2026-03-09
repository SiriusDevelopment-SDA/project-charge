import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
    try {
      this.client = createClient({ url: redisUrl });
      this.client.on('error', (error) => {
        this.connected = false;
        this.logger.error(`Redis error: ${error?.message ?? error}`);
      });
      this.client.on('connect', () => {
        this.connected = true;
        this.logger.log('Redis connected');
      });
      await this.client.connect();
    } catch (error: any) {
      this.connected = false;
      this.client = null;
      this.logger.warn(`Redis disabled (connection failed): ${error?.message ?? error}`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  isReady() {
    return this.connected && !!this.client?.isOpen;
  }

  async ping() {
    if (!this.client || !this.isReady()) return 'OFFLINE';
    return this.client.ping();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isReady()) return null;
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 30) {
    if (!this.client || !this.isReady()) return;
    await this.client.set(key, JSON.stringify(value), {
      EX: Math.max(1, ttlSeconds),
    });
  }

  async del(key: string) {
    if (!this.client || !this.isReady()) return;
    await this.client.del(key);
  }

  async delByPrefix(prefix: string) {
    if (!this.client || !this.isReady()) return;
    let cursor = 0;
    do {
      const result = await this.client.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
      cursor = Number(result.cursor);
      const keys = result.keys ?? [];
      if (keys.length) {
        await this.client.del(keys);
      }
    } while (cursor !== 0);
  }
}
