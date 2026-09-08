import { Test } from '@nestjs/testing';
import { NotificaMeWebhookController } from './notificame.webhook.controller';
import { NotificaMeWebhookService } from './notificame.webhook.service';
import type { NotificaMeWebhookPayload } from './notificame.webhook.rules';

/**
 * O controller ficou fino de proposito, e este teste tranca isso.
 *
 * O contrato com a NotificaMe e "responder 2xx para todo evento ja
 * considerado": ela REENVIA o que nao recebe 2xx. Se algum caminho voltar a
 * decidir a resposta dentro do controller — devolvendo 4xx para evento
 * ignorado, por exemplo — o provedor passa a reentregar em laco o que ja foi
 * processado, e o relatorio dobra.
 */
describe('NotificaMeWebhookController', () => {
  const montar = async (processarEvento = jest.fn().mockResolvedValue(undefined)) => {
    const modulo = await Test.createTestingModule({
      controllers: [NotificaMeWebhookController],
      providers: [{ provide: NotificaMeWebhookService, useValue: { processarEvento } }],
    }).compile();

    return {
      controller: modulo.get(NotificaMeWebhookController),
      processarEvento,
    };
  };

  it('entrega o evento ao service e responde received', async () => {
    const { controller, processarEvento } = await montar();
    const body = { type: 'MESSAGE_STATUS', messageId: 'm-1' } as NotificaMeWebhookPayload;

    await expect(controller.handleNotificaMeEvent(body)).resolves.toEqual({
      received: true,
    });
    expect(processarEvento).toHaveBeenCalledWith(body);
  });

  it('responde received tambem para evento que o service ignora', async () => {
    const { controller } = await montar();

    await expect(
      controller.handleNotificaMeEvent({ type: 'TIPO_DESCONHECIDO' } as NotificaMeWebhookPayload),
    ).resolves.toEqual({ received: true });
  });

  it('deixa a excecao subir, para a NotificaMe reentregar', async () => {
    // Falha de banco NAO pode virar 2xx: ai o evento se perde em silencio.
    const explode = jest.fn().mockRejectedValue(new Error('Postgres fora do ar'));
    const { controller } = await montar(explode);

    await expect(
      controller.handleNotificaMeEvent({ type: 'MESSAGE_STATUS' } as NotificaMeWebhookPayload),
    ).rejects.toThrow('Postgres fora do ar');
  });

  it('nao decide nada sozinho: qualquer body chega inteiro no service', async () => {
    const { controller, processarEvento } = await montar();

    await controller.handleNotificaMeEvent(undefined as never);

    expect(processarEvento).toHaveBeenCalledWith(undefined);
  });
});
