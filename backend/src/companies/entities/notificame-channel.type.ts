/**
 * Representa um único canal NotificaMe Hub pertencente a uma empresa.
 *
 * Uma empresa pode ter múltiplos canais (multi-canal). Cada canal possui:
 * - `id`: o identificador do canal na NotificaMe (usado como `from` no envio e
 *   matcheado contra `body.channel` nos webhooks). Único dentro da empresa.
 * - `numero`: telefone exibido no dropdown do frontend (cadastro manual).
 *
 * O X-Api-Token usado no envio NÃO vive no canal: é a coluna compartilhada
 * `Company.token_notificameHub` (uma credencial por conta NotificaMe).
 */
export type NotificameChannel = {
  id: string;
  numero: string;
};
