import {
  buildDispatchComponentsMaped,
  extractExternalMessageId,
  isFailedDispatch,
} from './dispatch-relatory.util';

describe('isFailedDispatch', () => {
  it('marca falha quando o HTTP não é ok', () => {
    expect(isFailedDispatch(false, 'queued')).toBe(true);
  });

  it('marca falha quando HTTP 200 mas o corpo vem com status "error" (Meta rejeitou)', () => {
    expect(isFailedDispatch(true, 'error')).toBe(true);
  });

  it('NÃO marca falha em envio aceito (queued/sent)', () => {
    expect(isFailedDispatch(true, 'queued')).toBe(false);
    expect(isFailedDispatch(true, 'sent')).toBe(false);
  });
});

describe('buildDispatchComponentsMaped', () => {
  it('sucesso: guarda apenas os valores enviados (array, comportamento histórico)', () => {
    const out = buildDispatchComponentsMaped({
      isError: false,
      httpStatus: 200,
      notificameResponse: { id: 'abc', status: 'queued' },
      mappedValues: ['SAMARA SILVA DE LIMA', 'R$ 120,00'],
    });

    expect(out).toEqual(['SAMARA SILVA DE LIMA', 'R$ 120,00']);
  });

  it('falha (HTTP 200 + status "error"): guarda o MOTIVO da NotificaMe no relatório', () => {
    const notificame = {
      id: 'wamid.X',
      status: 'error',
      error: { code: 131049, title: 'Reengagement message limit reached' },
    };

    const out = buildDispatchComponentsMaped({
      isError: true,
      httpStatus: 200,
      notificameResponse: notificame,
      mappedValues: ['ana claudia oleriano vicencio'],
    });

    // Agora o porquê fica visível direto no banco/relatório:
    expect(out).toEqual({
      error: {
        http_status: 200,
        notificame_response: notificame,
      },
      components: ['ana claudia oleriano vicencio'],
    });
  });

  it('falha (HTTP não-ok): guarda o status HTTP + corpo de erro', () => {
    const out = buildDispatchComponentsMaped({
      isError: true,
      httpStatus: 429,
      notificameResponse: { message: 'Too Many Requests' },
      mappedValues: [],
    });

    expect(out).toEqual({
      error: {
        http_status: 429,
        notificame_response: { message: 'Too Many Requests' },
      },
      components: [],
    });
  });
});

describe('extractExternalMessageId', () => {
  it('prefere providerMessageId direto quando presente', () => {
    expect(
      extractExternalMessageId({ id: 'uuid-submissao', providerMessageId: 'base64==' }),
    ).toBe('base64==');
  });

  it('prefere messageId direto quando não há providerMessageId', () => {
    expect(
      extractExternalMessageId({ id: 'uuid-submissao', messageId: 'uuid-status' }),
    ).toBe('uuid-status');
  });

  it('extrai de array messages[0] (id aninhado)', () => {
    expect(
      extractExternalMessageId({ messages: [{ id: 'msg-1' }, { id: 'msg-2' }] }),
    ).toBe('msg-1');
  });

  it('extrai providerMessageId aninhado em contents[0]', () => {
    expect(
      extractExternalMessageId({ contents: [{ providerMessageId: 'pmid' }] }),
    ).toBe('pmid');
  });

  it('cai no fallback histórico result.id quando nada mais existe', () => {
    expect(extractExternalMessageId({ id: 'uuid-submissao', status: 'queued' })).toBe(
      'uuid-submissao',
    );
  });

  it('retorna undefined quando a resposta não tem id algum', () => {
    expect(extractExternalMessageId({ status: 'queued' })).toBeUndefined();
    expect(extractExternalMessageId({} as Record<string, unknown>)).toBeUndefined();
  });
});
