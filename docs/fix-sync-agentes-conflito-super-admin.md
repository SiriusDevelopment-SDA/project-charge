# Fix — sync de agentes: super_admin não é mais reportado como conflito

## Problema
A sincronização de agentes do Chatwoot (`POST /auth/me/chatwoot-sync-agents`)
reportava no toast **"conflito(s) de email em outra empresa"** para e-mails que
pertencem a usuários **super_admin**. O aviso assustava (parecia erro), mas não
era: super_admin acessa **todas** as empresas pelo seletor (`/auth/switch-company`)
e **não precisa** existir como agente da empresa sincronizada. Caso real: equipe
interna (super_admins registrados na Fibras) aparecia como "conflito" em toda
sincronização da PROXER.

## Regra que continua valendo
E-mail de agente é único no sistema inteiro (1 e-mail = 1 empresa), porque o
login é só e-mail+senha. O sync continua **pulando** e-mails registrados em outra
empresa — nada passou a ser importado/movido.

## Correção (`backend/src/auth/auth.service.ts`)
No bloco de conflito do sync:
- Se o dono do e-mail em outra empresa tem `role = 'super_admin'` → conta num
  contador próprio e **não** entra em `conflito(s) de email` nem na lista de
  e-mails do toast. Mensagem nova (informativa, sem alarme):
  `"N super admin(s) ignorado(s) (ja possuem acesso global)"`.
- Demais papéis (admin/operator de outra empresa) → seguem como conflito, pois
  a pessoa de fato **não tem** acesso à empresa sincronizada.
- A query de e-mails existentes passou a selecionar também o `role` (antes não
  vinha, então não dava para distinguir).

## Validação
- `npx tsc --noEmit` OK (não há spec de auth no projeto).
- Sem mudança de schema/rotas; só a composição da mensagem e a contagem.
