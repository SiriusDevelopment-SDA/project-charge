import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMITE_SENHA_PROVISORIA } from '../decorators/senha-provisoria.decorator';

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

    let payload: { mustChangePassword?: boolean };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Senha ainda e a INICIAL: o agente autentica, mas nao opera.
    //
    // A exigencia vive aqui, e nao so na tela, porque a senha inicial e a mesma
    // para todos os agentes criados pelo embed. Se a trava fosse apenas do
    // frontend, quem soubesse a senha e um e-mail chamaria a API direto e teria
    // acesso completo — a tela nao e barreira, e so a apresentacao.
    //
    // Quem ja trocou nao passa por aqui: `mustChangePassword` vira `false` em
    // TODO caminho que grava senha nova (troca pelo perfil, reset por admin,
    // hash importado do Maestro), e o proximo JWT ja sai sem a marca.
    if (payload?.mustChangePassword) {
      const permitido = this.reflector.getAllAndOverride<boolean>(
        PERMITE_SENHA_PROVISORIA,
        [context.getHandler(), context.getClass()],
      );

      if (!permitido) {
        throw new ForbiddenException(
          'Troque a senha inicial antes de continuar.',
        );
      }
    }

    return true;
  }

  private extractToken(request: { headers: Record<string, string> }): string | null {
    const auth = String(request.headers?.['authorization'] ?? '');
    const [type, token] = auth.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
