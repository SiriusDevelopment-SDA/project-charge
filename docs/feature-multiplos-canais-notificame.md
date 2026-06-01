# Feature: Múltiplos canais NotificaMe por empresa

## O quê

Permite que uma empresa tenha **vários canais (números) do NotificaMe** em vez de um único, e que o usuário **escolha qual canal usar** ao disparar uma campanha ou no disparo manual. Antes, o número de origem era fixo por empresa (`canalId_notificameHub` era um único valor).

## Como funciona

### Modelo de dados (`Company`)

- `canalId_notificameHub` passou de `varchar` (1 valor) para **`jsonb`** contendo um array de canais:
  ```json
  [
    { "id": "0c1056d8-4787-43ff-b2f7-432b5590d312", "numero": "11998950000" },
    { "id": "0c1056d8-4787-43ff-b2f7-432b5590d413", "numero": "11998950080" }
  ]
  ```
  - `id` = o ID do canal no NotificaMe (usado como `from` no envio).
  - `numero` = telefone exibido no dropdown (cadastro **manual** — não há API do NotificaMe que traduza id→número).
- `token_notificameHub` (coluna existente) continua sendo o **X-Api-Token compartilhado** da conta — o mesmo para todos os canais. **Não** há token por canal.
- Tipo: `NotificameChannel = { id: string; numero: string }` em `backend/src/companies/entities/notificame-channel.type.ts`.

### Backend

- **`GET /api/auth/me`** retorna os canais da empresa ativa em **`company.channels`** = `Array<{ id, numero }>`. O `token` **nunca** é exposto (`toPublicChannels` em `auth.service.ts`).
- **Seleção do canal no disparo:**
  - `Campaign.channelId` (coluna nova) guarda o canal escolhido da campanha.
  - O disparo manual (`/templates/send`) aceita `channelId` opcional no DTO.
  - O `channelId` viaja pelo `MessageQueuePayload` até o `MessageQueueWorker`.
- **`MessageQueueWorker`**: seleciona o canal cujo `id === channelId`; se não vier ou não existir, usa o **primeiro** canal (fallback). Envia com `from: channel.id` e `X-Api-Token: company.token_notificameHub`.
- **Webhook** (`notificame.webhook.controller.ts`): resolve a empresa cujo array de canais **contém** o `channel` recebido (jsonb containment), para que respostas/status em qualquer canal sejam associados.

### Frontend

- **`useMe`** (`hooks/useMe.ts`) — fonte única do `GET /auth/me` no React Query.
- **`useNotificameChannels`** (`hooks/useNotificameChannels.ts`) — deriva `company.channels` do `useMe` (sem chamada extra). Expõe `{ channels, isLoading, isError, isEmpty }`.
- **`ChannelSelect`** (`componente/ChannelSelect/`) — dropdown que **reusa o componente `Dropdown` genérico** (mesmo visual dos outros selects: dark + hover dourado). Mostra o `numero` (fallback `Canal <id curto>`); o valor emitido é o `id`. Desabilitado quando carregando ou sem canais.
- **Campanha** (`CriarCampanha.tsx`): input de nome reduzido + `ChannelSelect` ao lado; o `channelId` entra no payload de criação.
- **Disparo manual** (`EfetuarDisparo.tsx`): `ChannelSelect` à esquerda; botões de upload/baixar movidos para a direita.

## Pontos de atenção

- **⚠️ Migrations vs `synchronize`:** o projeto usa `synchronize: true` em **dev** e `false` em **prod**. Em dev, converter o tipo de uma coluna (varchar→jsonb) faz o synchronize **dropar/recriar e PERDER os dados** (não usa a migration). Por isso a conversão deve ser feita por migration em prod, e em dev os canais precisam ser repopulados manualmente.
- **Rodar em produção:** antes do deploy, com `DB_*` apontando para prod:
  ```bash
  cd backend && npm run migration:run
  ```
  Aplica `AddNotificameChannelsArray` (varchar→jsonb, preservando dados) e `AddChannelIdToCampaignAndQueue`. Ver `backend/src/database/README.md`.
- **Número é cadastro manual:** não existe API do NotificaMe (testada) que liste canais com número. O `numero` de cada canal é preenchido manualmente no banco.
- **Token nunca vai ao cliente:** o `X-Api-Token` (`token_notificameHub`) fica só no backend; o `me()` expõe apenas `{ id, numero }`.

## Como cadastrar canais (manual, por enquanto)

```sql
UPDATE company
SET "canalId_notificameHub" = '[
  {"id":"<canalId-1>","numero":"<telefone-1>"},
  {"id":"<canalId-2>","numero":"<telefone-2>"}
]'::jsonb
WHERE account_chatwoot = '<account>';
```

## Como testar

1. Cadastre 1+ canais numa empresa (SQL acima).
2. Login → recarregue (o `me()` traz `company.channels`).
3. **Disparo Manual** e **Campanha**: o dropdown "Canal de disparo" lista os números cadastrados.
4. Selecione um canal e dispare — o worker usa o `id` escolhido como `from`.
