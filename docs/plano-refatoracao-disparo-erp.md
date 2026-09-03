# Plano de refatoração — disparo, integrações ERP e regras de negócio no lugar certo

> Status: **aguardando aprovação** · Levantado em 02/09/2026 por três agentes (backend, frontend, reviewer) a partir do incidente da POWERNET/GAMA ISP (variáveis vazias + "Nenhum destinatário válido"). Nenhum PR deste plano altera schema de banco — **zero migrations**.

## Por que este plano existe

O incidente de 02/09 teve uma causa imediata (template com variável fora do vocabulário + PIX ausente no snapshot) e uma causa estrutural, confirmada pelos três levantamentos:

1. **Capacidade declarada ≠ capacidade implementada.** `ErpDefinition` declara `pix` e `dispatch`, mas as flags têm zero leitores em runtime. O comportamento real é decidido por `if (erp === '...')` em 13 pontos — 10 deles falham em silêncio ou registram motivo errado quando um ERP novo entra.
2. **Regra de negócio no frontend.** Montagem de ORDER_DETAILS, chave PIX, dívida do cliente, dia útil/feriado e direito de plano existem (ou só existem) no browser — divergindo do backend ou sem enforcement no servidor.
3. **Falha silenciosa como padrão.** Variável não resolvida vira `""`; destinatário descartado não diz quem nem por quê; `queued` + HTTP 200 para mensagem que a Meta vai recusar.

## Regras adotadas (o contrato)

1. **Só o backend monta `components`.** O front envia valores (`templateVars`), nunca payload da Meta. Quem fala com ERP e com o cadastro da chave PIX decide.
2. **Capacidade de ERP é lida em runtime**, não documentada: `pixStrategy` (`inline | on-demand | unsupported`), `batchKey` (`clientId | document`), `heavy`. ERP sem adapter registrado → skip `erp_not_supported`, nunca "cliente sem fatura".
3. **Nada é descartado em silêncio.** Todo corte vira registro com motivo (relatório/Histórico); toda mensagem agregada traz contagem por motivo.
4. **Vocabulário de variáveis é contrato validado na criação do template** (lista única; chaves `1..N` contíguas; `N` = contagem de `{{n}}` no BODY).
5. **O front pode calcular para exibir, mas nada que ele calcula é a única barreira** — dinheiro, elegibilidade, plano, data de disparo e conteúdo são decididos no servidor; a UI pede pronto.
6. **Fronteiras de camada únicas e verificáveis.** No front: toda chamada HTTP vive em `services/` (hook e componente consomem service, nunca `Api.*`/`fetch` direto) e o localStorage guarda **só sessão** (token, modo de auth, conveniências de UX) — nunca dado de negócio que entra em payload. No back: controller não injeta `Repository` nem monta SQL (fica fino: DTO → service); todo body tem DTO com `class-validator`; `any` não entra em caminho de dinheiro/disparo. Onde der, a regra vira lint, não combinado.

## Ondas de execução

Restrição de ordem no backend: os PRs que tocam `template-dispatch-payload.service.ts` entram em sequência **B0 → B4 → B5 → B6 → B7 → B8 → B11**, senão é conflito garantido.

| Onda | Backend (charge-backend) | Frontend (charge-frontend) | Observação |
|---|---|---|---|
| 0 | — | — | **PR-0 já no working tree** (commitar): server build no disparo de clientes, guarda uuid no `clientId` (front+back), toast de pulados, fixtures do spec |
| 1 | **B1** escopo por token em invoices · **B2** `@RequirePage('chat')` | **F1** snapshot de campanha sem chave PIX · **F2** paliativo NaN da dívida · **F3** modal "Selecionar campanha" honesto · **F10** remove `mapVarsSchema` morto | Segurança + correções sem dependência. Antes do B2: SELECT read-only em produção (charge-db) |
| 2 | **B3** `pix/batch` por `pixStrategy` · **B4** `erp_not_supported` + teto de concorrência · **B5** MK reusa `code_pix` · **B6** `resolverChavePix` prevalece · **B7** lead sem `clientId` monta dos escalares · **B8** vocabulário no DTO | **F4** feriados fail-closed · **F5** preview honesto (variável não resolvida marcada) · **F6** modal de lead volta a pedir campos de fatura | B3–B8 em sequência no mesmo arquivo. Antes do B6: comparar `order_pix_key` de snapshots vs cadastro (charge-db) |
| 3 | **B9** dívida/atraso calculados no servidor · **B10** endpoint de feriados | **F7** leads server build + **remoção total do builder do front** (morre o `RANDOM`) · **F8** front para de buscar fatura/PIX para decidir | F7 bloqueado por B7; F8 depende de F5+F7 |
| 4 | **B11** registry `ErpInvoiceAdapter` · **B12** `ErpSyncAdapter` (`batchKey`/`heavy`) | **F9** `normalizeComponents` único · **F11** feriados do backend · **F12** dívida do backend (mata o paliativo F2) | B11 só depois de B3–B8; B12 valida por empresa em homolog antes de produção |
| 5 | **B13** `@RequirePage` nas 4 páginas restantes · **B14** limpeza Hubsoft | **F13** `PermissionRoute` fail-open → fail-closed | F13 **só depois do deploy** de B2+B13 com mapa completo de permissões — mesclar junto tranca usuário legítimo |
| 6 | **B15** controllers finos (sem `Repository`) · **B16** fatiar god services · **B17** DTOs completos + redução de `any` | **F14** camada de API única + regra de lint · **F15** AppStorage só-sessão | **B17a** (config ESLint do backend) e **F14** são independentes — podem entrar já na onda 1; F15 depende de B6, F7 e F13 |

Transversal: **charge-reviewer** antes de cada merge · **charge-docs** documenta o contrato e corrige o `backend.mdc` (diz 6 arquivos de spec; são 17) · **charge-deployer** fecha release por onda (registry.coraxy.com.br, versão manual).

## Detalhe dos PRs — Backend

- **B1 · fix(auth): escopo de empresa derivado do token em invoices** — `sub` do JWT vira fonte do `companyId` em `POST /invoices/search`, `/invoices/overdue-clients/search` e `/invoices/pix/batch`; divergência responde 403 (não 404). O body inline de `searchOverdueClients` vira DTO. **M** · risco alto (exceção do `super_admin` — ver Decisão 1) · testes novos de escopo (mesma empresa 200 / outra 403 / super_admin 200).
- **B2 · fix(auth): `@RequirePage('chat')` no controller do Chatwoot** — decorator no nível da classe cobre as 15 rotas (`PlanGuard` já lê `getClass()`). **S** · risco: empresa em plano `disparo` usando chat indevidamente perde acesso na hora — por isso o SELECT prévio.
- **B3 · fix(invoices): `pix/batch` orientado a `pixStrategy`** — `ErpDefinition` ganha `pixStrategy` substituindo o `pix: boolean` sem leitores; handler ramifica por capacidade; ERP desconhecido responde erro explícito; docblock corrigido (nunca citou GAMAISP). **M** · ver Decisão 2 (inline + fallback).
- **B4 · fix(dispatch): skip `erp_not_supported` + teto de concorrência** — `else` explícito no preload e no `buildDispatchScalars`; `Promise.allSettled` sem limite (1.000 clientes = 1.000 chamadas no mesmo tick) ganha teto aplicado pelo orquestrador (Decisão 8: padrão 6). O novo reason **não** entra no retry de campanha. **M**.
- **B5 · perf(dispatch): MK reusa `code_pix` do detalhe** — o ramo MK ignora o PIX já carregado e re-busca `fetchPixByInvoice` dentro do `for` sequencial; passa a usar `inv.code_pix` com fallback. Mil linhas deixam de gerar mil chamadas em série. **S**.
- **B6 · fix(dispatch): `resolverChavePix` prevalece sobre o snapshot** — inverte o `if (!merged.order_pix_key)`; disparo e cron de promessa passam a concordar. **S** · risco médio-alto (**muda para onde o dinheiro vai**) — comparar snapshots vs cadastro antes de subir.
- **B7 · feat(dispatch): lead sem `clientId` monta dos escalares da linha** — linha sem `clientId` deixa de virar `missing_client_or_invoice`; a barreira passa a ser `buildRecipientFromBlueprint` (variável faltante → `template_variables_incomplete`). Pré-requisito do F7. **M**.
- **B8 · feat(templates): vocabulário validado no `CreateTemplateDTO`** — lista única exportada; chaves contíguas; `N` = `{{n}}` do BODY. No disparo, skip separado para "defeito do template" (o caso `{"2":"referencia"}`). **M** · Decisão 3: template existente fora da lista avisa primeiro, bloqueia depois de medir.
- **B9 · feat(invoices): dívida e atraso por cliente na resposta** — a query de `overdue-clients/search` já soma com `getInvoiceAmountSql`; expor por cliente (cuidado com N+1). Fonte única para o que o front exibe. **M**.
- **B10 · feat(common): endpoint de feriados/dias úteis** — expõe a tabela de `business-day.util.ts` (fixos + móveis via Páscoa, cache por ano). `GET /business-days/holidays?year=`. **S**.
- **B11 · refactor(erp): porta `ErpInvoiceAdapter` + registry por DI** — mata 4 dos 13 pontos de `if/else`; critério de aceitação: specs atuais passam **sem edição**. Inclui a deduplicação interna do backend: `applyOrderDetailsReferenceId` e `getOrderedTemplateVariableKeys` existem em **duas cópias cada** (`app.service.templates.ts` e `template-dispatch-payload.service.ts`) — unificar no módulo do blueprint. **L**.
- **B12 · refactor(erp): `ErpSyncAdapter` com `batchKey` e `heavy`** — mata o ternário `erp === "SGP" ? byDocument : byClientId` (onde ERP novo perde 100% das faturas em silêncio) e a lista `ERPS_FORA_DO_CICLO_RECORRENTE`. **L** · risco alto (sync de produção) — homologar por empresa; rollback = revert + sync manual por empresa.
- **B13 · fix(auth): `@RequirePage` em `disparoManual`, `campanhas`, `templates`, `historico`** — mesma lacuna do chat; depende do levantamento de planos em produção. **S**.
- **B14 · chore(hubsoft): remover mapeamento de PIX descartado.** **S**.
- **B15 · refactor(arquitetura): controllers finos** — hoje **2 controllers injetam `Repository` e fazem persistência/SQL inline**: `invoicesController.ts` (600+ linhas, com helpers de SQL cru como `getInvoiceAmountSql`) e `notificame.webhook.controller.ts`. As queries migram para os services; controller vira DTO → service → resposta. Fazer **depois** de B1/B3/B9, que tocam o mesmo arquivo. **M** · risco baixo (deslocamento sem mudança de comportamento; specs como critério).
- **B16 · refactor(arquitetura): fatiar god services por responsabilidade (SRP)** — os quatro maiores: `auth.service.ts` **1.902** linhas (login + embed + chatwoot-sync + equipe), `chatwoot.service.ts` **1.630**, `app.service.templates.ts` **1.301** (search + create + send + status-sync + delete), `campaigns.service.ts` **1.150**. Um módulo por PR, começando por templates (extrair `TemplateStatusSyncService` — o send já foi para `template-dispatch-payload`). Critério de aceitação: specs passam **sem edição**; nenhum service tocado fica acima de ~500 linhas. **L** (série de PRs S/M) · contínuo, sem big-bang.
- **B17 · chore(qualidade): lint + DTOs + tipagem** — **(a)** o backend tem `npm run lint` no `package.json` e **nenhum arquivo de config ESLint** — o script roda no vazio; criar `eslint.config.mjs` com `no-explicit-any` (warn como baseline) pode entrar já na onda 1. **(b)** body inline vira DTO (`chatwoot.controller.ts:134` `ws-sync`; o de `searchOverdueClients` já entra no B1). **(c)** reduzir as **88 ocorrências de `: any`/`as any`** fora de spec, priorizando os caminhos de dinheiro/disparo (`templates/`, `invoices/`, `message-queue/`). **M** · risco baixo.

## Detalhe dos PRs — Frontend

- **F1 · fix(campanha): snapshot sem `order_pix_key`/`order_pix_key_type`** — os campos saem do `templateMapVarsForSubmit`; o CNPJ do localStorage deixa de sequestrar a configuração da empresa. **Não** remover ainda do mapper (leads ainda montam no front até o F7). **S**.
- **F2 · fix(clientes-vencidos): dívida sem `NaN`** — `Number(invoice_amount)` → `parseAmountToCents(...)/100`. Paliativo consciente; morre no F12. **S**.
- **F3 · fix(clientes-vencidos): remover opção "Selecionar uma campanha"** — hoje é `toast.success("...(Implementar)!")` fingindo disparo. **S**.
- **F4 · fix(campanha): feriados fail-closed** — `useHolidays` devolve `status`; em erro, bloqueia **a régua recorrente** com aviso (Decisão 7), mantendo cache de sessionStorage como fonte válida. E2E interceptando a BrasilAPI com 500. **M**.
- **F5 · feat(preview): variável não resolvida marcada** — `compilarTemplate` passa a expor os não-resolvidos, distinguindo "fora do vocabulário" de "valor ausente"; o texto gravado no snapshot da campanha **não muda** (coberto por teste). **M**.
- **F6 · fix(leads): modal volta a pedir campos de fatura** — `getMissingTemplateVariables` ganha `resolvedByServer`; para leads, `DISPATCH_TIME_FIELDS` não é mais filtrado (não há ERP para resolver). Mata o descarte de lead por campo que a UI nunca perguntou. **M**.
- **F7 · refactor(disparo): leads server build + remoção do builder** — os dois modos usam `buildServerSideRecipients`; morrem `buildTemplateRecipientFromBlueprint`, `buildOrderDetailsComponent`, `inferPixKeyType` (com o `RANDOM` que a Meta recusa) e a chave PIX do mapper; telefone da planilha normalizado para dígitos (some o 400 de lote inteiro por máscara). **L** · **bloqueado por B7** · validar em staging.
- **F8 · perf(disparo): fim das buscas de fatura/PIX para decidir** — hidratação só quando o preview exibe o campo; `fetchAndMergePixCodes` (duplica `preloadIxcPix`) restrito a `code_pix` no corpo; regra de categoria `"cobr"` alinhada com o backend. **M** · depende de F5+F7.
- **F9 · refactor: `normalizeComponents` + `getComponentRequiredFields` num módulo único** (a 4ª cópia morre no F7). **M**.
- **F10 · chore: remover `mapVarsSchema` morto.** **S**.
- **F11 · feat: feriados do backend** — troca BrasilAPI pelo endpoint B10, via instância `Api`; mantém fail-closed e cache. **M** · depende de B10+F4.
- **F12 · feat: dívida/atraso do backend** — consome os campos de B9; apaga `calcularDividaCliente`/`maiorAtrasoCliente`; comparar amostra antes/depois. **M** · depende de B9.
- **F13 · fix: `PermissionRoute` fail-closed** — `!== false` → `=== true`, **somente após** deploy de B2+B13 com mapa completo. **S** · risco de ordenação alto.
- **F14 · refactor(arquitetura): camada de API única + trava de lint** — componentes e páginas **já estão limpos** (zero chamadas diretas); o vazamento são **5 hooks** que chamam `Api.*` direto (`useDispatchTemplateController`, `useTemplatesQuery`, `useHistoricoQuery`, `useActivityLogQuery`, `useLatestDispatchReportQuery`) e 1 `fetch` cru (`useHolidays`, que já morre no F11). Mover as chamadas para os services correspondentes e **travar a porta** com `no-restricted-imports` no `eslint.config.js`: `services/api` só importável dentro de `services/`. Independente — pode entrar na onda 1. **M** · risco baixo.
- **F15 · refactor(arquitetura): AppStorage só-sessão** — o localStorage guarda hoje **dado de negócio que entra em payload de disparo**: `companyCnpj` (vira chave PIX — consumo morre no B6/F7), `dispatchCompanyName`/`companyName`/`companyId`/`companyActive` (passam a vir do contexto da empresa ativa via API), `attendantName`/`agentName` (passam a vir do agente logado; o modal do embed continua existindo mas grava em estado de sessão, não em localStorage — ver Decisão 9), `pagePermissions` (vira cache de UX com o fail-closed do F13; a autoridade é o servidor). Ficam: `accessToken`, `authMode`, `lastActiveCompanyId` e conveniências de UX. **M** · depende de B6, F7 e F13 — é o fecho da onda 6, não o começo.

## Decisões pendentes (bloqueiam os PRs indicados)

| # | Decisão | Bloqueia | Recomendação dos agentes |
|---|---|---|---|
| 1 | `super_admin` mantém acesso cross-company nas rotas de invoices? | B1 | Sim, com exceção explícita por `agentRole` + log de auditoria |
| 2 | `pixStrategy` da Gama: sempre ao vivo ou snapshot com fallback on-demand? | B3 | Snapshot + fallback quando vazio (evita 1 chamada/fatura no caso normal) |
| 3 | Template existente com variável fora do vocabulário: bloquear ou avisar? | B8 | Avisar na 1ª entrega; bloquear depois de medir em produção |
| 4 | Autorizar SELECTs read-only em produção (empresas plano `disparo` com Chatwoot; snapshots com chave ≠ cadastro; templates fora do vocabulário) | B2, B6, B8 | Executar via charge-db antes das respectivas ondas |
| 5 | `toLower()` no nome do cliente/atendente/empresa na mensagem | F7 (conteúdo) | Preservar como veio do ERP, normalizando só espaços |
| 6 | Instalar vitest para funções puras (`compilarTemplate`, dívida)? | F2, F5 (cobertura) | Sim — hoje só há Playwright |
| 7 | Fail-closed dos feriados: tudo ou só a régua recorrente? | F4 | Só a régua — disparo único não depende de feriado |
| 8 | Teto de concorrência do preload | B4 (não bloqueia início) | 6, alinhado ao MK, sobreponível por empresa |
| 9 | Sem localStorage, de onde vem o `nome_atendente` do embed: do agente logado (JWT/`/me`) sempre, ou o modal continua existindo para sobrepor por disparo? | F15 | Padrão = agente logado; modal vira sobreposição opcional em estado de sessão |

## O que decidimos NÃO fazer (registrado para não virar refactor sem fim)

- Unificar os tipos de `getInvoicesByDateWindowBatch` — é o único ponto que falha em **compilação** com ERP novo; normalizar trocaria proteção real por elegância.
- Migrar IXC/SGP para `toInvoiceUpsert` — deslocamento de código, nenhum bug fecha.
- Cachear `getInvoices` no caminho do disparo — risco de mandar PIX de fatura quitada.
- Unificar utilitários espelhados front/back em pacote compartilhado — custo alto, os dois lados concordam hoje.
- **Clean architecture big-bang** (camadas domain/use-case/infra reescritas de uma vez) — o ganho real de SOLID aqui já está mapeado em pontos cirúrgicos: B11/B12 **são** OCP+DIP no lugar mais crítico (adapter por contrato em vez de `if/else`), B15 é SRP nos controllers, B16 é SRP nos services, F14/F15 são fronteira de camada no front. Reescrever a estrutura inteira pararia a entrega por semanas para reorganizar código que os specs já cobrem. Princípio adotado: **camada nova só onde há bug ou repetição comprovada**, com lint segurando a fronteira dali em diante.
