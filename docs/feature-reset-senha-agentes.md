# Feature — Redefinir senha de agentes (cobrança + Chatwoot)

## O que é
Admins e super admins agora podem **redefinir a senha de um agente** pela tela de
Perfil → Administração da equipe. A troca acontece **nos dois sistemas ao mesmo
tempo**: painel de cobrança (bcrypt) e Chatwoot/Maestro (Platform API). Antes,
"esqueci a senha" só se resolvia com UPDATE manual no banco (caso real:
`proxer_user1`, 14/08/2026).

## Regras de permissão
| Quem | Pode redefinir |
|---|---|
| operator | ninguém (não vê a tela de equipe) |
| admin | agentes da **própria empresa**, exceto super_admins |
| super_admin | qualquer agente da empresa em visualização |
| todos | **nunca a própria senha** por aqui — autotroca continua no perfil (exige senha atual) |

## Comportamento (tudo-ou-nada)
1. Se o agente tem vínculo com o Chatwoot (`chatwootUserId`), o backend chama a
   Platform API primeiro (`PATCH /platform/api/v1/users/:id` com `password`).
   **Se o Chatwoot recusar, nada é alterado** — evita senha divergente.
2. Depois grava o hash local (`bcryptjs`, 10 rounds — igual ao login).
3. Sem vínculo → troca só na cobrança e o toast avisa.

Viabilidade da Platform API **validada ao vivo** (14/08/2026): GET/PATCH/sign_in
HTTP 200 no chat.coraxy.com.br, inclusive para usuário NÃO criado pelo Platform
App.

## UX (decisões do produto)
- Admin **digita** a senha (sem geração automática).
- **Dupla digitação** (nova senha + repetir, valida se conferem; mín. 6).
- Botão **"Mostrar/Ocultar senhas"** para conferir antes de confirmar.
- Modal abre por cima do modal de equipe; toast informa se o Chatwoot foi
  atualizado junto.

## Arquivos
- Backend: `auth.controller.ts` (`PATCH /auth/agents/:agentId/password`),
  `auth.service.ts` (`resetCompanyAgentPassword`), `auth.dto.ts`
  (`ResetAgentPasswordDto`), `chatwoot.service.ts` (`updateAgentPassword`).
- Frontend: `Perfil.tsx` (botão na linha + modal), `usePerfilPageController.ts`
  (form/handlers), `profile.schema.ts` (`resetAgentPasswordFormSchema`),
  `auth.service.ts` (client), `Perfil.module.css`.

## Validação
- `tsc --noEmit` OK (backend e frontend).
- Deploy exige **as duas imagens** (backend e frontend).
