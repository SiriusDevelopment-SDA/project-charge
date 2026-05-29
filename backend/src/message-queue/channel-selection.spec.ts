import type { NotificameChannel } from '../companies/entities/notificame-channel.type';

/**
 * Regra de negócio MC2: o worker seleciona o canal cujo `id === job.channelId`.
 * Se o channelId não vier (null/vazio) ou não existir mais na empresa, faz
 * fallback para o PRIMEIRO canal do array (comportamento MC1). Esta é a lógica
 * espelhada de MessageQueueWorker.selectChannel.
 */
function selectChannel(
  channels: NotificameChannel[] | null | undefined,
  channelId: string | null | undefined,
): NotificameChannel | undefined {
  if (!Array.isArray(channels) || channels.length === 0) {
    return undefined;
  }

  if (channelId) {
    const match = channels.find((channel) => channel.id === channelId);
    if (match) return match;
  }

  return channels[0];
}

describe('selectChannel (MC2 multi-canal NotificaMe)', () => {
  const channels: NotificameChannel[] = [
    { id: 'canal-a', numero: '5511999999999' },
    { id: 'canal-b', numero: '5511888888888' },
  ];

  it('seleciona o canal cujo id bate com o channelId escolhido', () => {
    expect(selectChannel(channels, 'canal-b')).toEqual(channels[1]);
  });

  it('faz fallback para o primeiro canal quando channelId é null', () => {
    expect(selectChannel(channels, null)).toEqual(channels[0]);
  });

  it('faz fallback para o primeiro canal quando channelId é vazio', () => {
    expect(selectChannel(channels, '')).toEqual(channels[0]);
  });

  it('faz fallback para o primeiro canal quando channelId não existe mais', () => {
    expect(selectChannel(channels, 'canal-removido')).toEqual(channels[0]);
  });

  it('retorna undefined quando a empresa não tem canais', () => {
    expect(selectChannel([], 'canal-a')).toBeUndefined();
    expect(selectChannel(null, 'canal-a')).toBeUndefined();
    expect(selectChannel(undefined, null)).toBeUndefined();
  });
});
