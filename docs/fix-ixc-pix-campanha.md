# Fix — Busca do PIX no disparo por campanha (IXC)

## Problema
Empresas do ERP **IXC** que disparavam cobrança **por campanha** com template de PIX
dinâmico (botão `ORDER_DETAILS` / `COPY_CODE`) tinham **todos os destinatários pulados**
com `reason: template_variables_incomplete` — o `code_pix` chegava vazio.
O disparo **manual** (pela tela) **não** era afetado, pois o frontend busca o PIX via
`POST /invoices/pix/batch` antes de montar a mensagem.

## Causa-raiz (regressão)
O commit `a06ef94` (2026-04-10, *"correcao performance sistema"*) removeu a busca inline
do PIX de `IXCInvoicesService.getInvoices` — para evitar N chamadas ao ERP ao listar
faturas — passando a buscar o PIX **sob demanda**. Essa busca on-demand foi religada
apenas em **dois** lugares: o caminho **manual** (frontend, `/invoices/pix/batch`) e o
ERP **MK** (`buildDispatchScalars`, que chama `mkService.fetchPixByInvoice`). O caminho de
**campanha do IXC** ficou sem — desde então, campanha de PIX do IXC vinha com `code_pix`
vazio e pulava todos os destinatários.

Confirmação nos dados: a Fibra do Rio (IXC) enviou PIX por campanha com sucesso até
**10–14/04/2026** (data do commit) e parou depois; passou a usar template simples nas
campanhas e o PIX real pelo manual.

## Correção
Em `backend/src/templates/template-dispatch-payload.service.ts`:

- **`templateRequiresPix(template)`** — novo método que detecta se o template realmente
  usa PIX (variável de corpo `code_pix`/`codigo_qr`/… ou botão `ORDER_DETAILS`/`COPY_CODE`),
  reaproveitando os helpers `parseTemplateVars`, `normalizeComponents` e `extractButtons`.
- **`preloadIxcPix(rows, clientById, ixcByClient)`** — no preload da campanha, busca o PIX
  **em lote/concorrente** (`Promise.allSettled`) apenas das faturas IXC que serão realmente
  disparadas e que ainda não têm PIX, reaproveitando `IXCInvoicesService.getPixByInvoice`
  (a mesma função removida no `a06ef94`, usada pelo caminho manual). Popula o `code_pix`
  no snapshot; `buildDispatchScalars` (branch IXC), que já lê `inv.code_pix`, passa a
  receber o valor sem outras mudanças.

Guardas: só busca quando `templateRequiresPix` é verdadeiro (não desperdiça chamadas em
templates que só usam texto/boleto), **idempotente** (não sobrescreve PIX já presente) e
**tolerante a falha** (PIX indisponível vira `warn` e não bloqueia o disparo). Mantém a
performance (lote/concorrente, só das faturas do disparo), sem reintroduzir o gargalo que
motivou o `a06ef94`.

**Escopo:** afeta **apenas IXC**. Não altera MK/SGP/Hubsoft, frontend, sync de faturas
(`invoice-sync.cron`), `ixcInvoicesService.ts` nem rotas/controllers. Nenhum arquivo novo.

## Validação
- `npx tsc --noEmit` no `backend/`: sem erros.
- Teste real em produção: campanha de PIX (TOPLINK, IXC) para número de teste — mensagem
  entregue **com o botão de PIX** e **sem destinatários pulados**. Imagem
  `registry.coraxy.com.br/backend-api:1.0.52`.
