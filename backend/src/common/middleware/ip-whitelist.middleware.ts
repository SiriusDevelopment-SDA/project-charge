import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IpWhitelistMiddleware implements NestMiddleware {
    constructor(private configService: ConfigService) {}
  use(req: Request, res: Response, next: NextFunction) {
    const apiKeyHeader = req.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader)
    ? apiKeyHeader[0]
    : apiKeyHeader;
    const validApiKey = this.configService.get<string>('API_KEY');
    const isProd = this.configService.get<string>('NODE_ENV')

    if(isProd === 'production'){
        if (!apiKey || apiKey !== validApiKey) {
            return res.status(403).json({
            message: 'Invalid API Key',
            });
        }
    }
    
    next();
  }
}
