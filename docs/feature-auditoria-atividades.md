# Feature — Auditoria (histórico geral de atividades)

## O que é
Registro de auditoria: toda ação de usuário no painel é gravada e fica visível
para admin/super_admin em **Perfil → Auditoria** (rota `/auditoria`), com filtro
por **categoria**, **data** e **busca** (autor/ação/alvo), paginado no servidor.

## Categorias
- **create** (Criação) — adicionou algo (agente, campanha, template, categoria, promessa, empresa)
- **edit** (Edição) — alterou algo
- **delete** (Exclusão) — removeu algo
- **execute** (Execução) — disparou/sincronizou/redefiniu senha
- **auth** / **other** — reserva

## Como captura (híbrido)
`ActivityLogInterceptor` (global, `APP_INTERCEPTOR`):
- **Automático:** `PATCH`/`PUT` → edit, `DELETE` → delete (mutação inequívoca).
- **Curado:** `POST` **não** loga sozinho (POST também é usado para busca neste
  sistema); os POSTs de criação/execução recebem `@Activity({ category, action, entity })`.
  O decorator também sobrepõe a categoria (ex.: reset de senha é PATCH mas vira `execute`).
- Autor/empresa vêm do JWT (`agentId`/`agentEmail`/`sub`=companyId). Gravação é
  fire-and-forget (`record()` nunca lança — não derruba a requisição de origem).
- `GET` e rotas públicas (sem token) não logam. `@NoActivityLog()` exclui rotas ruidosas.

## Dados (`activity_log`)
Autor **desnormalizado** (agent_email/name) para sobreviver à remoção do agente e
não pagar join. Escopo multi-empresa por `company_id`. Índices por
`(company_id, created_at)` e `(company_id, category)`.

## Acesso
Listagem (`POST /activity-log/search`) restrita a **admin/super_admin**; escopo =
empresa em contexto (`payload.sub`). Operadores não veem.

## Arquivos
- Backend: `activity-log/` (entity, decorator, interceptor, service, controller,
  dto), registro em `app.module.ts` + `database.config.ts`, `@Activity` nos
  controllers (auth, campaigns, templates, invoices, category, payment-promise, companies).
- Migration: `1786924800000-CreateActivityLog.ts`.
- Frontend: `pages/HistoricoGeral/` (página + estilos), `hooks/useActivityLog.ts`,
  `hooks/queries/useActivityLogQuery.ts`, rota `/auditoria`, botão em `Perfil.tsx`.

## Também nesta entrega — limite de nome (30)
Nome de agente/perfil limitado a **30 caracteres** (DTOs `CreateAgentDto`,
`ManageAgentDto`, `UpdateProfileDto` + schemas do frontend + `maxLength` nos inputs).
CSS defensivo (`overflow-wrap`) para nomes longos **já existentes** não quebrarem o
layout da lista de equipe.

## ⚠️ Deploy
Cria tabela nova → **rodar a migration em produção** (`npm run migration:run`) no
deploy. Backend e frontend mudaram (build das duas imagens).

## Validação
- `tsc` backend + frontend OK.
- Prova end-to-end no dev: login → ação → registro capturado e listado; filtros de
  categoria e data conferidos por API.
