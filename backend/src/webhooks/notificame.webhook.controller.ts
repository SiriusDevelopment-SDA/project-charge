import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { NotificaMeWebhookService } from './notificame.webhook.service';
import type { NotificaMeWebhookPayload } from './notificame.webhook.rules';

@Controller('webhooks')
export class NotificaMeWebhookController {
  constructor(private readonly webhookService: NotificaMeWebhookService) {}

  @Public()
  @Post('notificame')
  async handleNotificaMeEvent(@Body() body: NotificaMeWebhookPayload) {
    await this.webhookService.processarEvento(body);

    // A NotificaMe reenvia o evento quando a resposta nao e 2xx. Todo caminho
    // do service — inclusive "ignorado" — significa evento ja considerado, e
    // por isso a resposta e sempre a mesma. Excecao nao tratada continua
    // virando 5xx de proposito: ai a reentrega e desejada.
    return { received: true };
  }
}
