# Integração ERP — MK / PROXER

Adapter de cobrança para o ERP **MK Solutions (PROXER)**, slug **`MK`**. Segue o
mesmo padrão dos adapters existentes (IXC, SGP, HUBSOFT): um `@Injectable()`
simples selecionado por `switch`/string em `company.erp` — **não** há interface
`ErpIntegration`/registry no projeto.

- **Service:** `backend/src/invoices/services/mkInvoicesService.ts` (`MkInvoicesService`)
- **Spec:** `backend/src/invoices/services/mkInvoicesService.spec.ts`
- **Base URL:** `https://${company.url}/mk/...` (ex.: `company.url = mksolutions5.proxerinternet.com.br`)

## Cadastro da empresa

| Campo | Valor |
|-------|-------|
| `erp` | `MK` |
| `url` | host do MK (ex.: `mksolutions5.proxerinternet.com.br`) |
| `config` (jsonb) | `{ "sys": "MK0", "password": "<senha>", "cd_servico": "<código>", "masterToken": "<chave fixa>" }` |

Opcionais em `config`: `invoicesConcurrency` (default 6), `timeoutMs` (90000), `retries` (3).

## Autenticação (2 fases)

O MK usa um **token de sessão que expira (~2 dias)**, gerado a partir de uma
chave mestra fixa:

```
POST /mk/WSAutenticacao.rule?sys={sys}&password={password}&cd_servico={cd_servico}&token={masterToken}
→ { "Token": "...", "Expire": "DD/MM/YYYY HH:mm:ss", "status": "OK", "ServicosAutorizados": [...] }
```

O `getSessionToken` cacheia o `Token` no Redis em `mk:session-token:{companyId}`
até o `Expire` (margem de 300s) e renova sozinho. As demais rotas usam
`token={Token}`. Em `401`, o cache é invalidado e a chamada é refeita 1x.

## Endpoints usados

| Função | Rota |
|--------|------|
| Autenticar | `WSAutenticacao.rule` (POST) |
| Listar clientes | `WSMKConsultaClientes.rule?...&cd_cliente_inicio={cursor}` |
| Listar faturas (janela de venc.) | `WSMKFaturasAbertas.rule?...&dt_venc_inicio=DD/MM/YYYY&dt_venc_fim=DD/MM/YYYY` |
| Detalhe da fatura | `WSMKSegundaViaCobranca.rule?...&cd_fatura={id}` |
| PIX por documento | `WSMKRetornarCopieColaPix.rule?...&Documento={cpf}` |

## Clientes (`fetchClients` + `toClientUpsert`)

`WSMKConsultaClientes` retorna um **array puro** de clientes. Paginação por
cursor `cd_cliente_inicio` (avança para `max(CodigoPessoa)+1`; encerra em página
vazia). Mapeamento: `CPF_CNPJ→cnpj_cpf`, `CodigoPessoa→clientId`, `Fone→whatsapp`,
`Nome→name`, `Email→email`, `endereco[]` (preferindo `tipo=COBRANCA`) →
`street/numberHouse/city/zipCode`. Registros sem CPF ou telefone são pulados.

## Faturas (snapshot em 2 passos)

`WSMKFaturasAbertas` traz só `{cd_fatura, codpessoa, nome, status, valor}` —
**sem vencimento, PIX ou boleto**. Para cada fatura busca-se o detalhe em
`WSMKSegundaViaCobranca` (`{Vcto, Valor, PathDownload}`), em **lote com
concorrência limitada** (`invoicesConcurrency`, default 6). O endpoint de detalhe
**não aceita múltiplos `cd_fatura`** (retorna HTTP 500).

`toInvoiceUpsert`: `cd_fatura→id_fatura`, `valor(lista)→value`, `Vcto→expiration`
(DD/MM/YYYY), `PathDownload→ticketPdfLink`. **Sem linha digitável** e
`pixCode = null` (PIX é por documento/CPF, on-demand). Indexação por `codpessoa`
(= `client.clientId`), como o IXC.

### Status (situação do cliente, não pagamento)

A `WSMKFaturasAbertas` retorna status do cliente: **`Ativo`**, **`Cancelado`**,
**`Suspenso`**. Regra: cobram-se `Ativo` + `Suspenso`; **`Cancelado` é descartado**.

### ⚠️ Encoding quebrado da API

O MK responde `content-type: iso-8859-1`, mas cada acento vem como o **1º byte
UTF-8 cru** (ex.: `0xC3`) seguido do **2º byte como escape JSON `\u00XX`**. Nem
UTF-8 nem latin1 puros recuperam. O `parseJsonLatin1` conserta: decodifica em
latin1 → `JSON.parse` → `repairMkEncoding` reinterpreta os code points de cada
string como bytes UTF-8. Resultado: "INFORMAÇÃO", "JOÃO", "ORGANIZAÇÕES" corretos.
Aplicado **somente** no adapter MK.

## Volume e agendamento

Na janela de 1 ano há **~61 mil faturas não-canceladas** e, como o detalhe é
**1 chamada por fatura**, uma sync completa faz ~61k requisições. Por isso:

- **MK fica FORA da cron recorrente de faturas** (`@Cron('0 */10 * * * *')`),
  que serve IXC/SGP (esses trazem tudo na lista).
- **Cron diário às 4h** (`syncMkInvoicesDaily`) sincroniza só empresas MK ativas,
  reutilizando `runSyncForCompany` (mesma janela de 1 ano). Off-peak, 1x/dia.
- Continua disponível no **trigger manual**: `POST /api/invoices/sync/company/:id`.
- A cron de **clientes** (3h, leve, 1 chamada) roda normal.

O snapshot diário alimenta a **régua das campanhas agendadas** (filtra por
vencimento). Disparo manual usa `getInvoices` **on-demand** (poucas chamadas por
cliente), sem depender do snapshot.

## Wiring (arquivos alterados)

- `app.module.ts` — provider `MkInvoicesService`.
- `clients/clients-sync.cron.ts` — `case 'MK'` (fetchClients + toClientUpsert).
- `invoices/invoice-sync.cron.ts` — `syncMK`, skip do MK na cron de 10min, cron diário 4h.
- `invoices/invoices.service.ts` — `MK` no allowlist da régua.
- `invoices/controllers/invoicesController.ts` — PIX por documento (`pix/batch`).
- `templates/template-dispatch-payload.service.ts` — payload de disparo (PDF no header DOCUMENT).
- `templates/relatory-resolver.cron.ts` — `erp === 'MK'`.

## Limitações / pendências

- **PIX:** o `WSMKRetornarCopieColaPix` existe, mas na conta de teste retorna
  `codigo_erro 004` ("configuração não permite"). O `extractPixCode` trata o erro
  e tenta nomes de campo comuns; o **campo de sucesso ainda não foi confirmado**.
  Enquanto isso o boleto (PDF) cobre o pagamento e `pixCode` fica `null`.
- **Sem `contractId`** — o MK não expõe contrato nesses endpoints (botões que
  exigem `reference_id` não montam para MK).
- **Envio real** requer um canal NotificaMe configurado na empresa.
