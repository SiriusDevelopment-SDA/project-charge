import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token não informado');
    }

    try {
      await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    return true;
  }

  private extractToken(request: { headers: Record<string, string> }): string | null {
    const auth = String(request.headers?.['authorization'] ?? '');
    const [type, token] = auth.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
