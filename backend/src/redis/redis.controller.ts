import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RedisService } from './redis.service';

@ApiTags('Health')
@Controller('health')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('redis')
  @ApiOperation({ summary: 'Redis health check' })
  async redisHealth() {
    const ping = await this.redisService.ping();
    return {
      status: ping === 'PONG' ? 'UP' : 'DOWN',
      ping,
    };
  }
}
