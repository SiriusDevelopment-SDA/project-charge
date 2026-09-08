import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

type SubscribePayload = {
  account?: string;
};

@WebSocketGateway({
  namespace: '/campaigns',
  cors: { origin: '*' },
})
export class CampaignMetricsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CampaignMetricsGateway.name);

  async handleConnection(client: Socket) {
    const account = String(client.handshake.query.account ?? '').trim();
    if (account) {
      await this.entrarNaSalaDaConta(client, account);
    }
  }

  @SubscribeMessage('campaigns:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const account = String(payload?.account ?? '').trim();
    if (!account) return;
    await this.entrarNaSalaDaConta(client, account);
  }

  emitCampaignsSync(account: string) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) return;

    this.server.to(this.getAccountRoom(safeAccount)).emit('campaigns:sync', {
      account: safeAccount,
      at: new Date().toISOString(),
    });

    this.logger.debug(`Campaign metrics sync emitted for account ${safeAccount}`);
  }

  /**
   * `join` do socket.io e assincrono por contrato: com o adapter em memoria
   * resolve na hora, mas com adapter distribuido (Redis) vira ida a rede, que
   * falha. Sem `await` a falha vira rejeicao nao tratada e o cliente fica
   * conectado SEM receber nada — do lado de fora a conexao parece saudavel e a
   * tela simplesmente para de atualizar, sem uma linha de log dizendo por que.
   */
  private async entrarNaSalaDaConta(client: Socket, account: string) {
    const sala = this.getAccountRoom(account);
    try {
      await client.join(sala);
    } catch (error) {
      this.logger.error(
        `Cliente ${client.id} nao entrou na sala ${sala}: nao vai receber atualizacoes.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private getAccountRoom(account: string) {
    return `campaigns:account:${account}`;
  }
}
