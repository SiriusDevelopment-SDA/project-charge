import type { NotificameChannel } from './notificame-channel.type';

/**
 * Regra de negócio MC1: o canal NotificaMe "default" de uma empresa é o
 * PRIMEIRO elemento do array `canalId_notificameHub` que possua `id`. Esta é a
 * lógica compartilhada (espelhada no worker e no
 * AppServiceTemplate.resolveDefaultChannel) que decide qual canal é usado para
 * envio enquanto a seleção por campanha (MC2) não existe. O X-Api-Token NÃO
 * vive no canal: é a coluna compartilhada `token_notificameHub`.
 */
function resolveDefaultChannel(
  channels: NotificameChannel[] | null | undefined,
): NotificameChannel | null {
  const channel = Array.isArray(channels) ? channels[0] : null;
  if (!channel?.id) return null;
  return channel;
}

describe('resolveDefaultChannel (MC1 multi-canal NotificaMe)', () => {
  it('retorna o primeiro canal quando há um array válido', () => {
    const channels: NotificameChannel[] = [
      { id: 'canal-a', numero: '5511999999999' },
      { id: 'canal-b', numero: '5511888888888' },
    ];

    expect(resolveDefaultChannel(channels)).toEqual(channels[0]);
  });

  it('retorna null para array vazio (empresa sem integração)', () => {
    expect(resolveDefaultChannel([])).toBeNull();
  });

  it('retorna null para null/undefined', () => {
    expect(resolveDefaultChannel(null)).toBeNull();
    expect(resolveDefaultChannel(undefined)).toBeNull();
  });

  it('retorna null quando o primeiro canal não tem id', () => {
    expect(resolveDefaultChannel([{ id: '', numero: '' }])).toBeNull();
  });
});
