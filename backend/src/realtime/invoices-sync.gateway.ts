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
  namespace: '/invoices',
  cors: { origin: '*' },
})
export class InvoicesSyncGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(InvoicesSyncGateway.name);

  handleConnection(client: Socket) {
    const account = String(client.handshake.query.account ?? '').trim();
    if (account) {
      client.join(this.getAccountRoom(account));
    }
  }

  @SubscribeMessage('invoices:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const account = String(payload?.account ?? '').trim();
    if (!account) return;
    client.join(this.getAccountRoom(account));
  }

  emitSyncUpdate(account: string, payload: Record<string, unknown>) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) return;

    this.server.to(this.getAccountRoom(safeAccount)).emit('invoices:sync', {
      account: safeAccount,
      ...payload,
    });

    this.logger.debug(`Invoice sync emitted for account ${safeAccount}`);
  }

  private getAccountRoom(account: string) {
    return `invoices:account:${account}`;
  }
}
