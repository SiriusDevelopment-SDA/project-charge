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

export type ChatSyncMessage = {
  id: string;
  content: string;
  senderType: string;
  senderName: string | null;
  createdAt: string;
};

export type ChatSyncExtra = {
  conversationId?: number;
  message?: ChatSyncMessage;
};

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  handleConnection(client: Socket) {
    const account = String(client.handshake.query.account ?? '').trim();
    if (account) {
      client.join(this.getAccountRoom(account));
    }
  }

  @SubscribeMessage('chat:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const account = String(payload?.account ?? '').trim();
    if (!account) return;
    client.join(this.getAccountRoom(account));
  }

  emitChatSync(account: string, extra?: ChatSyncExtra) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) return;

    this.server.to(this.getAccountRoom(safeAccount)).emit('chat:sync', {
      account: safeAccount,
      at: new Date().toISOString(),
      ...extra,
    });

    this.logger.debug(`Chat sync emitted for account ${safeAccount} conversationId=${extra?.conversationId ?? '-'}`);
  }

  private getAccountRoom(account: string) {
    return `chat:account:${account}`;
  }
}
