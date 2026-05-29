# Feature: Role `super_admin` (acesso multi-empresa)

## O quê

Introduz o papel `super_admin` no project-charge. Diferente de `admin`/`operator` (que são restritos a uma empresa), o `super_admin` enxerga **todas as empresas** cadastradas e pode **trocar a empresa ativa da sessão** sem deslogar. A troca reescreve o tenant ativo (JWT) e recarrega os dados na empresa selecionada.

Funciona nos dois tipos de acesso:
- **Login externo** (e-mail/senha).
- **Embed** (dentro do Chatwoot → aba Aplicativos), via `chatwoot_token`.

## Como funciona

### Papel e permissões (backend)

- `AGENT_ROLES` em `backend/src/agents/entities/agent.entity.ts` agora é `['admin', 'operator', 'super_admin']` (coluna `role` é `varchar(20)`, sem migration).
- **`super_admin` é superset de `admin`**: passa em todos os checks de permissão que `admin` passa. Implementado em `auth.service.ts` (`requireAdminAgent`, `ensureCompanyHasAnotherAdmin`, gestão de equipe) e `chatwoot.service.ts` (provisionamento → `administrator`).
- **Só `super_admin` cria/promove/remove outro `super_admin`.** Admin comum não pode promover ninguém a super_admin nem rebaixar um super_admin.
- O primeiro `super_admin` é definido **manualmente no banco**:
  ```sql
  UPDATE agents SET role = 'super_admin' WHERE email = '<email>';
  ```
  A partir daí, super_admins podem promover outros pela tela de gestão de equipe.

### Endpoints

- `GET /api/companies` — lista todas as empresas **ativas e com ERP configurado** (`CompaniesService.listAll()`). Protegido pelo `SuperAdminGuard` (`backend/src/auth/guards/super-admin.guard.ts`). **Nunca retorna tokens sensíveis** (apenas `id`, `name`, `account_chatwoot`, `label`, `active`).
- `POST /api/auth/switch-company/:id` — reemite o JWT com o `companyId` da empresa alvo (`AuthService.switchActiveCompany`). Valida que o caller é `super_admin` (defesa em profundidade além do guard). Reusa o mesmo builder de resposta do login (`buildAuthResponse`).

### Estrutura do JWT

O `sub` do JWT é o **companyId** (tenant ativo); o agente é identificado por `agentId`. A troca de empresa só altera `sub`/`account`/`name` — todo o resto do sistema, que filtra por `companyId`, passa a operar na nova empresa automaticamente.

```jsonc
{
  "sub":         "<companyId ativo>",
  "account":     "<account_chatwoot>",
  "name":        "<nome da empresa>",
  "agentId":     "<id do agente>",
  "agentRole":   "super_admin",
  "agentActive": true
}
```

Como o `companyId` do token pode divergir do `agents.companyId` natural do super_admin, a carga do agente em rotas de auth/perfil (`me`, `updateProfile`, `requireAdminAgent`) é **relaxada para super_admin**: valida só `agentId + active`, sem amarrar ao tenant do token (`loadAuthenticatedAgent`). Para admin/operator o comportamento permanece amarrado ao tenant.

### Empresa default e persistência

- **Login externo**, super_admin:
  - 1ª vez / cache limpo → entra na empresa **Fibras do Rio** (`account_chatwoot = '4'`), via `resolveSuperAdminDefaultCompany`.
  - Acessos seguintes → entra na **última empresa selecionada** (`last_active_company_id` no `localStorage`), via `restoreLastActiveCompany` (chamado no `Login.tsx`). Se a última empresa estiver indisponível (404), limpa o registro e fica em Fibras.
- O `last_active_company_id` **sobrevive ao logout** (removido apenas em limpeza total do cache ou em fallback de switch inválido).

### Frontend (UI)

- **Trigger de troca** (`componente/global/navbar/SuperAdminCompanyButton.tsx`): estilo select (nome da empresa + chevron), último item da navbar, visível **apenas** quando `AppStorage.getAgentRole() === 'super_admin'`.
- **Dropdown** (`componente/global/navbar/DropdownSwitchCompany.tsx`): popover ancorado via `createPortal` no `document.body` (necessário porque o `backdrop-filter` da navbar quebra o hit-testing de `position: fixed`). Lista as empresas (só o nome, sem `_`), com checkmark verde na ativa. Fecha por clique fora / Esc.
- **Estado da empresa ativa** (`context/contextActiveCompany.tsx`): hidratado do `localStorage`; re-lê ao receber o evento `active-company-changed` (`services/session/activeCompanyEvents.ts`), disparado por `applyLoginSession` (qualquer login) e pelo switch.
- **Troca**: `hooks/mutations/useSwitchCompanyMutation.ts` chama `switchCompany`, grava a sessão nova, persiste a última empresa e **recarrega a página** (`window.location`) com o `?account` atualizado, garantindo que todos os contextos/queries reidratem na empresa nova.
- **Gestão de equipe** (`pages/Perfil/Perfil.tsx`): super_admin vê o card administrativo, e o seletor de role exibe a opção **"Super Admin"** (somente quando o usuário logado é super_admin). Label de exibição: `super_admin → "Super Admin"`.

### Fluxo do embed (Chatwoot → Aplicativos)

O embed sempre abre com `?account=1&chatwoot_token=<token do agente>`. O `account=1` é o ambiente "master" do Chatwoot e **não existe** como empresa no banco.

1. `AccountLayout` chama `AuthService.chatwootLogin({ account: 1, chatwoot_token })`.
2. `loginChatwoot` valida o token na API do Chatwoot (`<CHATWOOT_BASE_URL>/api/v1/profile`), identifica o agente e seu role.
3. Para `super_admin`: o **anti-tampering é relaxado** (com `Logger.warn` de auditoria) e a empresa do `account` inexistente **não causa 401** — cai na empresa default (Fibras).
4. O frontend aplica `restoreLastActiveCompany` → leva à última empresa selecionada.
5. A troca dentro do embed remove `chatwoot_token`/`token` da URL no reload, usando o token do switch (não re-autentica no Chatwoot).

> Para admin/operator o fluxo de embed permanece inalterado (anti-tampering ativo, amarrado ao account da URL).

## Pontos de atenção

- **Multi-tenancy**: o filtro por `companyId` continua valendo em TODO o resto do sistema. As únicas exceções são `GET /api/companies` e a carga do agente em rotas de auth — ambas exclusivas de super_admin.
- **Anti-tampering relaxado para super_admin no embed**: o token Chatwoot ainda é validado sempre; apenas a checagem de "pertencer à account" é ignorada para super_admin. Auditado via `Logger.warn`.
- **`CHATWOOT_BASE_URL`** precisa estar configurada no `.env` do backend para o fluxo de embed/chatwoot-login funcionar.
- **Empresa Local (account 1)** e empresas sem ERP não aparecem na listagem de troca (filtro em `listAll`).

## Como testar

```sql
-- promover um agente
UPDATE agents SET role = 'super_admin' WHERE email = '<email>';
```

- **Login externo**: logar → cai em Fibras (1ª vez) → trigger de troca na navbar → trocar empresa → dados recarregam → relogar volta na última empresa.
- **Embed**: `https://<host>:5173/?account=1&chatwoot_token=<token>` → entra na última empresa (ou Fibras) → trocar empresa pelo dropdown.
- **Negativo**: admin comum não vê o trigger de troca nem a opção "Super Admin" na gestão de equipe; `GET /api/companies` retorna 403 para não-super_admin.
