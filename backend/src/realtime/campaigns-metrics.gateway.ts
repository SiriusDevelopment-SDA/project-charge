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

  handleConnection(client: Socket) {
    const account = String(client.handshake.query.account ?? '').trim();
    if (account) {
      client.join(this.getAccountRoom(account));
    }
  }

  @SubscribeMessage('campaigns:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const account = String(payload?.account ?? '').trim();
    if (!account) return;
    client.join(this.getAccountRoom(account));
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

  private getAccountRoom(account: string) {
    return `campaigns:account:${account}`;
  }
}
