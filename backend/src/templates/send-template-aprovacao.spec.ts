import { BadRequestException } from '@nestjs/common';
import { AppServiceTemplate } from './app.service.templates';

/**
 * Template nao aprovado na Meta NAO pode ser disparado.
 *
 * Isto ja era a intencao do codigo, mas nao acontecia: em `sendTemplate` a
 * chamada de `ensureTemplateApprovedForUsage` estava SEM `await`. O metodo e
 * async e lanca; sem esperar, a excecao virava rejeicao nao tratada e o
 * disparo seguia. O caminho de campanha (`campaigns.service.ts`) sempre
 * esperou — so o disparo manual passava.
 *
 * O bug sobreviveu porque nada aqui tinha teste. Este spec existe para que
 * reintroduzi-lo custe um teste vermelho, e nao um cliente recebendo mensagem
 * de um template que a Meta reprovou.
 */
describe('sendTemplate — barreira de template aprovado', () => {
  const EMPRESA = 'empresa-1';
  const CANAIS = [{ id: 'canal-1', numero: '11999998888' }];

  const montar = (metaStatus: string) => {
    const template = {
      id: 'template-1',
      name: 'template_pix_receptivo_v2',
      meta_status: metaStatus,
      meta_id: 'meta-1',
      variables: { '1': 'nome_cliente' },
      company: { id: EMPRESA, canalId_notificameHub: CANAIS },
    };

    const templateRepository = {
      findOne: jest.fn().mockResolvedValue(template),
      save: jest.fn(),
    };
    // Sem `token_notificameHub`, `refreshTemplateStatusForUsage` sai cedo e
    // nao toca na API da Meta: o que esta sob teste e a barreira, nao a
    // sincronia de status.
    const companyRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: EMPRESA,
        canalId_notificameHub: CANAIS,
        token_notificameHub: null,
      }),
    };
    const messageQueueService = { enqueueBatch: jest.fn() };
    const templateDispatchPayload = {
      buildQueueRecipients: jest.fn(),
      persistDispatchSkips: jest.fn(),
      resumirSkips: jest.fn(),
    };

    const servico = new AppServiceTemplate(
      templateRepository as never,
      { save: jest.fn() } as never,
      companyRepository as never,
      { emitCampaignsSync: jest.fn() } as never,
      messageQueueService as never,
      templateDispatchPayload as never,
    );

    return { servico, messageQueueService, templateDispatchPayload };
  };

  const disparo = {
    templateId: 'template-1',
    account: 900,
    to: [{ number: '11999990000', name: 'FULANO', components: [] }],
  } as never;

  it.each(['REJECTED', 'PENDING', 'PAUSED', 'DISABLED', ''])(
    'recusa o disparo quando o status na Meta e "%s"',
    async (status) => {
      const { servico } = montar(status);

      await expect(servico.sendTemplate(disparo)).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('nao enfileira nem monta destinatario quando recusa', async () => {
    // A barreira tem que vir ANTES da montagem: template reprovado nao pode
    // nem chegar a consultar o ERP por fatura.
    const { servico, messageQueueService, templateDispatchPayload } =
      montar('REJECTED');

    await expect(servico.sendTemplate(disparo)).rejects.toThrow();

    expect(templateDispatchPayload.buildQueueRecipients).not.toHaveBeenCalled();
    expect(messageQueueService.enqueueBatch).not.toHaveBeenCalled();
  });

  it('diz na mensagem qual e o status atual, para o operador saber o que fazer', async () => {
    const { servico } = montar('REJECTED');

    await expect(servico.sendTemplate(disparo)).rejects.toThrow(/REJECTED/);
  });

  it('deixa passar da barreira quando o template esta APPROVED', async () => {
    // Com `to` vazio, o proximo obstaculo e "Nenhum destinatario informado".
    // Chegar nele prova que a barreira de aprovacao foi atravessada, sem
    // precisar simular ERP e fila.
    const { servico } = montar('APPROVED');

    await expect(
      servico.sendTemplate({ ...(disparo as object), to: [] } as never),
    ).rejects.toThrow('Nenhum destinatario informado para envio.');
  });

  it('aceita o status em caixa baixa vindo da Meta', async () => {
    const { servico } = montar('approved');

    await expect(
      servico.sendTemplate({ ...(disparo as object), to: [] } as never),
    ).rejects.toThrow('Nenhum destinatario informado para envio.');
  });
});
