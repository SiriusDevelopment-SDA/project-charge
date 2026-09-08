# Integração ERP — GAMA ISP (POWERNET)

Adapter de cobrança para o ERP **Gama ISP**, slug **`GAMAISP`**. Primeira empresa:
**POWERNET**, plano `disparo`, host `axnet.gamaisp.com.br`.

A integração é **completa**: sincroniza clientes e faturas para a base local
(`fetchClients` + `getInvoicesByDateWindowBatch`, ligados no `ClientsSyncCron` e no
`InvoiceSyncCron`) **e** atende o disparo on-demand por CPF/CNPJ. A régua de
cobrança aceita empresas Gama ISP, e as campanhas funcionam.

Isso não era verdade na primeira entrega — o ERP nasceu "só disparo", como o
Hubsoft. Os trechos marcados **"Antes da sincronização"** guardam o comportamento
antigo, útil para quem investigar produção do período.

- **Service:** `backend/src/invoices/services/gamaIspInvoicesService.ts` (`GamaIspInvoicesService`)
- **Base URL:** `https://${company.url}/api/v1/...`
- **Capacidades:** `GAMA_ISP_ERP` declarada no próprio service, coletada por
  `backend/src/integrations/erp/erp.registry.ts` (contrato em `erp.types.ts`).

> **Não existe documentação da API do Gama ISP.** Tudo neste documento foi
> levantado por sondagem direta na instância da POWERNET em **2026-08-31**. Onde o
> comportamento não pôde ser confirmado, está marcado como tal.

## Cadastro da empresa

| Campo | Valor |
|---|---|
| `erp` | `GAMAISP` |
| `url` | host do Gama ISP (ex.: `axnet.gamaisp.com.br`) |
| `config` (jsonb) | `{ "rest_key": "<rest_key>", "login": "<login>", "password": "<senha>" }` |
| `config.plano` | `disparo` |

As **três credenciais vão para `config`**; a coluna `autorization` não é usada
(padrão do SGP/MK/Hubsoft, não do IXC). O registro em `erp.registry.ts` é a fonte
da verdade — o cadastro deriva dele a exigência dos campos.

## Autenticação

Duas fases, como no MK, mas com um formato incomum:

```
POST https://<host>/api/v1/auth
Authorization: Basic <rest_key>
Content-Type: multipart/form-data

login=<login>
password=<senha>
```

```json
{ "status": "success", "data": "<JWT>" }
```

Dois detalhes que custam tempo se não estiverem escritos:

- **O header `Authorization: Basic <rest_key>` não é Basic auth de verdade.** É a
  chave crua depois da palavra `Basic` — **não** há base64 de `usuario:senha`.
  Montar um Basic real resulta em 401.
- O corpo é **`multipart/form-data`**, não JSON e não `x-www-form-urlencoded`.

O JWT dura **3 horas** e traz o campo `expires` (unix). Todas as demais chamadas
usam `Authorization: Bearer <jwt>`.

O token é **cacheado no Redis por empresa**, em `gamaisp:session-token:<companyId>`
— mesmo desenho do MK. O TTL vem do `expires` do próprio JWT, descontada uma margem
de **300 s**; quando o payload não é legível, cai num fallback de **3 h menos a
margem**, nunca mais que a vida real do token. Em **401 ou 403** o cache é
invalidado e a chamada é refeita **uma única vez** — os dois códigos entram no
retry porque, nesta API, ambos podem significar apenas token expirado antes da
margem.

### Como a API responde a credencial errada

| Situação | HTTP |
|---|---|
| JWT válido | 200 |
| Token cru, sem o prefixo `Bearer` | 403 |
| `rest_key` enviada no lugar do JWT | 401 |
| **Sem header `Authorization`** | **500** |

A ausência de header dar **500** (e não 401) importa na prática: um 500 do Gama ISP
pode ser falha de autenticação, não indisponibilidade. Não classifique 500 como
`inacessivel` no preflight sem olhar o corpo.

## Endpoint usado no disparo

```
GET /api/v1/faturas/doc/{cpf_cnpj}
Authorization: Bearer <jwt>
```

Funciona **com ou sem máscara** no documento. Resposta:

```json
{ "status": "success", "data": [ ... ], "count": 4, "total": 84 }
```

Devolve **todas as faturas do cliente, pagas inclusive** — num caso real, 84
faturas das quais 4 em aberto. O filtro de "cobrável" é nosso; a regra completa
está em "Mapeamento", abaixo.

CPF inexistente ou lixo devolve **HTTP 200 com `data: []`** — cliente sem fatura e
cliente que não existe são indistinguíveis pela resposta.

### Campos da fatura

`id`, `cliente_id`, `cliente_contrato_id`, `data_emissao`, `data_vencimento`
(ISO `YYYY-MM-DD`), `data_pagamento`, `valor_total` (string), `multa`, `juros`,
`desconto`, `valor_recebido`, `linha_digitavel`, `codigo_de_barras`, `pix_qrcode`,
`url_cobranca_gateway`, e as flags `desativada` / `excluida` / `enviada` /
`remessa_gerada`, com valores `"S"` / `"N"`.

- `pix_qrcode` é o **BR Code EMV completo** (~197 caracteres), presente nas faturas
  em aberto. É o que sustenta `pix: true`.
- `url_cobranca_gateway` veio **sempre `null`** na sondagem — não serve como link de
  boleto.

### Mapeamento para `InvoiceMapResultDto`

| Campo do DTO | Origem |
|---|---|
| `invoice_id` | `id` |
| `contract_id` | `cliente_contrato_id` |
| `invoice_due_date` | `data_vencimento` **convertido para `DD/MM/AA`** por `formatarDataBR` |
| `invoice_amount` | `valor_total` **puro** |
| `invoice_status` | fixo `A Receber` — as pagas já foram descartadas antes do mapa |
| `overdue` | `data_vencimento` (ISO **cru**) comparado com hoje em `America/Sao_Paulo` |
| `ticket_digitable_line` | `linha_digitavel` |
| `code_pix` | `pix_qrcode` |
| `ticket_pdf_link` | **`null` por decisão** — ver Pendências |

**A data sai em `DD/MM/AA`, não em ISO.** É tentador deixar passar o
`YYYY-MM-DD` que a API já entrega, mas `invoice_due_date` alimenta a variável
`data_vencimento_fatura` do template, que vai **literalmente para a mensagem do
cliente**: precisa sair `10/01/26`, não `2026-01-10`. Por isso o adapter usa
`formatarDataBR`, o mesmo util do IXC (`ixcInvoicesService.ts`) e do SGP
(`sgpInvoicesService.ts`) — os outros dois adapters cujo ERP entrega data ISO. O
ISO cru é mantido só para **ordenar** e calcular **`overdue`**, sempre **antes** da
conversão (string ISO ordena lexicograficamente na mesma ordem cronológica; a
brasileira não).

**O valor cobrado é `valor_total` puro** — o adapter **não** soma `multa`/`juros`
nem abate `desconto`. Nas faturas em aberto da base real esses três campos vêm
`null`, então hoje não há diferença prática. Fica o aviso: **no dia em que a Gama
ISP passar a preenchê-los, o valor da mensagem muda** — e a decisão de somar ou não
precisa ser tomada de novo, com a régua de cobrança do cliente na mão.

**Filtro de faturas cobráveis** (`isOpen`) — descarta três casos:
`data_pagamento` preenchida, `excluida === 'S'` e `desativada === 'S'`.

Validado contra a base real: em **464 faturas** amostradas de 4 pontos diferentes
da base, **nenhuma fatura sem `data_pagamento` tinha `valor_recebido` preenchido**
(ou seja, `data_pagamento` sozinha basta para separar paga de aberta), e
`desativada = "S"` **aparece de verdade** — 2 casos nas 464. As duas flags não são
defensivas por precaução: elas ocorrem.

### Timeout, log e concorrência

- **Timeout por chamada:** 90 s, sobrescrevível por empresa em `config.timeoutMs`.
- **O CPF/CNPJ não vai para o log.** A rota carrega o documento no *caminho* da
  URL, então a mensagem de falha de rede cita apenas `company.url`, nunca a URL
  completa. Vale manter ao mexer no adapter.
- **Corpo de erro truncado em 200 caracteres e sem markup** (`resumeCorpo`) — sem
  isso, um fatal error do PHP despejaria uma página HTML inteira no log.
- **Teto de chamadas simultâneas: 3 por empresa**, sobrescrevível em
  `config.invoicesConcurrency`. É metade dos 6 do MK, de propósito: a API morre
  com uma página de 200 registros (item 3 abaixo) e o disparo abre uma chamada
  por cliente. O limite é lido a cada chamada, então mudá-lo no cadastro vale sem
  reiniciar o serviço.

  O semáforo vive **dentro do service**, não no laço de disparo — aquele
  `Promise.allSettled` de `template-dispatch-payload.service.ts` é compartilhado
  com IXC/SGP/MK/HUBSOFT, e limitá-lo ali mudaria o comportamento dos outros
  ERPs. Sendo o service um singleton do Nest, o teto interno protege todos os
  caminhos de chamada.

  Ao mexer nisso, duas armadilhas já resolvidas: a vaga é devolvida num
  `finally` (se voltasse só no caminho feliz, cada erro do ERP — e aqui erro
  chega até com HTTP 200 — vazaria uma permissão até travar a empresa de vez), e
  a liberação passa a vaga **direto ao próximo da fila** em vez de decrementar o
  contador, o que abriria janela para uma terceira chamada furar o teto.
- **Autenticação deduplicada em voo** (*single-flight*): chamadas simultâneas de
  uma empresa sem token em cache aguardam a MESMA requisição de `/auth`, em vez
  de abrir uma cada. Cobre também o caso de Redis fora do ar, em que
  `RedisService.get` devolve `null` em silêncio e toda chamada viraria uma
  autenticação nova.

## As três limitações que desenharam o adapter

O desenho deste adapter não é escolha de estilo — é consequência de três
comportamentos da API, todos confirmados por sondagem.

### 1. A listagem `/api/v1/faturas` ignora qualquer filtro

Foram testadas **12 variações** de parâmetro — `cliente_id`, `id_cliente`, `cpf`,
`cnpj`, `cpf_cnpj`, `documento`, `search`, `q`, `filtro`, `where`, entre outras —
em **form-data e em query string**, tanto em `/faturas` quanto em `/clientes`. Em
todas, o `total` voltou **inteiro**: 180.127 faturas e 3.998 clientes. A API aceita
o parâmetro e o descarta em silêncio.

**Consequência:** a busca por documento (`/faturas/doc/{cpf_cnpj}`) é o **único**
caminho viável para disparo por cliente. Sem ela, cada disparo teria de varrer a
base inteira — cerca de **1.553 páginas por disparo**, no teto de página que a API
suporta.

É parente do problema que motivou `fix-mk-faturas-filtro-cliente.md`, com um
agravante: no MK existia um parâmetro de cliente que funcionava; aqui não existe
nenhum.

### 2. Teto de ~116 registros por página

`limit=116` funciona. `limit=200` **estoura a memória do PHP** no servidor do ERP.

`order` e `direction` funcionam (confirmado com `order=data_vencimento` +
`direction=desc`), e **é a única razão pela qual a sincronização existe**: sem
poder ordenar, não haveria como parar cedo e a varredura teria de percorrer as
180.127 faturas. Ver "Sincronização".

O adapter pagina com **`GAMA_ISP_PAGE_SIZE = 100`**, não 116: o teto medido é o
ponto em que a API ainda responde, e operar rente a ele troca poucas páginas
economizadas pelo risco de derrubar o ERP.

### 3. Erro chega com HTTP 200

Uma página grande demais responde **status 200** com corpo **HTML**:

```
<pre><b>Fatal error</b>: Allowed memory size of 268435456 bytes exhausted
```

**Regra do adapter: nunca confiar no status HTTP.** Toda resposta precisa ser
validada em duas etapas — o corpo é JSON parseável, e `status === 'success'`. O
padrão dos outros adapters (`if (!response.ok) throw` seguido de `response.json()`)
engoliria o erro como fatura vazia, e o cliente simplesmente não receberia a
cobrança.

## Capacidades declaradas

`GAMA_ISP_ERP` (code `GAMAISP`, label `Gama ISP`), em `gamaIspInvoicesService.ts`:

| Flag | Valor | Por quê |
|---|---|---|
| `syncClients` | `true` | `fetchClients` + `toClientUpsert`, com `case 'GAMAISP'` no `ClientsSyncCron` |
| `syncInvoices` | `true` | `getInvoicesByDateWindowBatch` + `toInvoiceUpsert`, com o ramo `syncGamaIsp` no `InvoiceSyncCron` |
| `pix` | `true` | `pix_qrcode` chega preenchido, alcança o disparo **e** vai para o snapshot |
| `dispatch` | `true` | payload de disparo implementado |
| `preflight` | `'credential'` | `/api/v1/auth` valida a credencial inteira; contagem total existe, mas exigiria uma segunda chamada |

Os dois primeiros flags **eram `false`** e viraram `true` **no mesmo commit** que
ligou as duas crons — a regra do `erp.types.ts` ("um flag só vira `true` no mesmo
commit que liga a capacidade de verdade"). Foi por violá-la que o Hubsoft chegou a
declarar PIX que nunca alcançava o disparo.

A `ressalva` do registro sobrou com dois pontos, ambos reais: **não entrega link do
boleto em PDF**, e **a sincronização de clientes é sempre carga completa** — a API
não tem filtro por data de alteração.

## Sincronização

Com o snapshot populado, o `GAMAISP` entrou no allowlist da régua de cobrança
(`invoices/invoices.service.ts`, agora `['IXC','SGP','HUBSOFT','MK','GAMAISP']`) e
**as campanhas funcionam de verdade**. Duas consequências que valem registro:

- `POST /invoices/pix/batch` responde pelo **ramo do snapshot local** (o mesmo de
  SGP/HUBSOFT), sem chamada extra ao ERP — porque `toInvoiceUpsert` grava o
  `pixCode`.
- O relatório de recuperação (`recovered_amount`) passa a somar de verdade: ele lê
  a tabela `invoice`, que agora é populada.

> **Antes da sincronização.** Enquanto `syncInvoices` era `false`, uma campanha
> criada para a POWERNET **rodava vazia e se marcava como executada**: o
> `invoice-sync.cron.ts` caía no `else` de ERP não suportado e ainda assim gravava
> o estado como `success`, o `ensureSyncedToday` acreditava, o `searchByCompanyRule`
> recusava o ERP e o `getRecipientsForDispatchDate` engolia a exceção retornando
> `[]`. Nada disso vale mais — mas explica campanhas com zero destinatários em
> produção no período, e o `recovered_amount` zerado dos relatórios antigos.

As listagens são `POST /api/v1/clientes` e `POST /api/v1/faturas`, com os
parâmetros na **query string** — e só quatro deles existem de verdade: `limit`,
`offset`, `order`, `direction` (ver limitação 1). Cada página ocupa **uma vaga do
mesmo semáforo** do disparo, então uma sync em andamento não soma requisições às de
uma campanha rodando ao mesmo tempo.

### Clientes (`fetchClients` + `toClientUpsert`)

Varredura completa com `order=id&direction=asc`, páginas de 100 — os 3.998 clientes
da POWERNET saem em ~40 páginas.

**Não há sync incremental.** O `since` é recebido para casar com a assinatura que o
`ClientsSyncCron` usa nos outros ERPs, mas é **ignorado**: a API não tem filtro por
data de alteração. Toda rodada é carga completa, e o log diz isso em vez de fingir
uma janela que não existe.

Há **dedupe por `id`** e parada quando uma página não traz nenhum id novo: se a API
deixar de respeitar o `offset` (ela já ignora todo o resto), a varredura repetiria a
primeira página para sempre.

#### O telefone vem do array `contato`

O cliente não tem campo de telefone; tem uma lista `contato`, cada item com
`tipo_id`. A escolha é **WhatsApp (`tipo_id: 2`)**, caindo para **Celular
(`tipo_id: 1`)**. **Telefone Fixo (`tipo_id: 5`) não entra** — não recebe mensagem.
O valor chega como `(##) ####-####` e é normalizado para dígitos; exige no mínimo
10 dígitos (DDD + número). O e-mail sai do `tipo_id: 3`.

Distribuição numa amostra de 116 clientes: WhatsApp 96, Celular 70, Telefone Fixo
34, Email Pessoal 13 — e **nenhum cliente sem contato algum**.

### Faturas (`getInvoicesByDateWindowBatch` + `toInvoiceUpsert`)

Devolve `Map<cliente_id, fatura[]>` — **mesmo contrato do IXC e do MK**, que o
`persistSnapshot` resolve pelo `byClientId` (`cliente_id` = `Client.clientId`).
Cache no Redis em `gamaisp:invoice-batch:<companyId>:<start>:<end>`, **TTL 5 min**,
como SGP/IXC/MK.

**A varredura para cedo, e é disso que a viabilidade depende.** Com
`order=data_vencimento&direction=desc` as faturas vêm da mais recente para a mais
antiga; a primeira que cai **antes** de `startDate` garante que todas as seguintes
também caem, e o laço para. Sem isso, uma sincronização seriam ~1.553 requisições
contra um ERP que morre com página de 200 registros. Também aqui a carga é **sempre
completa dentro da janela** — não existe incremental.

No `toInvoiceUpsert`, `expiration` fica no **ISO `YYYY-MM-DD`** que o ERP entrega
(o projeto lê os dois formatos), `ticketPdfLink` é sempre `null`, e — **ao contrário
do MK** — o `pixCode` **é gravado**: aqui ele vem no mesmo payload da fatura, então
guardar não custa requisição nenhuma.

### Duas decisões contraintuitivas (não "corrija" sem ler isto)

**1. Não filtra por `situacao`.** Entram Regular (85 na amostra), Desativado (17),
Cortesia (7), Irregular (5) e Bloqueado (2). Parece erro; não é:

- Cliente **Desativado** ou **Bloqueado** é normalmente **quem foi cortado por falta
  de pagamento** — ou seja, exatamente o alvo da cobrança.
- O `persistSnapshot` **descarta toda fatura cujo cliente não exista na base local**.
  Filtrar aqui apagaria as faturas dessas pessoas do snapshot.

A distribuição por `situacao` vai no log de cada rodada, para ninguém descobrir tarde
que a base mudou de perfil.

**2. Cliente sem telefone entra com `whatsapp` vazio.** IXC, SGP e MK descartam;
aqui não. Mesma razão: descartar o cliente jogaria fora **as faturas dele**. Ele não
pode ser disparado (`buildQueueRecipients` pula destinatário sem número), mas existe
na base, e as faturas continuam valendo para dashboard, clientes vencidos e
conciliação. A coluna `whatsapp` é `NOT NULL`, daí a string vazia em vez de `null`.
O total sem telefone aparece no log da sincronização.

### Frequência: fora da cron de 10 minutos

GAMAISP **não** entra no ciclo de 10 min. O `if (erp === "MK")` que existia em dois
pontos do `invoice-sync.cron.ts` virou:

```ts
const ERPS_FORA_DO_CICLO_RECORRENTE = new Set(["MK", "GAMAISP"]);
```

e o cron diário `syncMkInvoicesDaily` foi renomeado para **`syncErpsPesadosDaily`**.
**O comportamento do MK não mudou** — mesmo `@Cron("0 0 4 * * *")`, mesma janela; só
o nome e a forma do teste.

O motivo do GAMAISP entrar aí é específico: o **semáforo limita quantas requisições
acontecem ao mesmo tempo, não a frequência**. Varrer centenas de páginas a cada 10
minutos martelaria o ERP do cliente o dia inteiro, por mais educado que seja cada
lote. Os dois ERPs continuam atendidos pelo **trigger manual**
(`POST /invoices/sync/company/:id`), que usa o mesmo caminho por empresa.

A cron de **clientes** (3h) roda normalmente.

## Wiring (arquivos)

- `invoices/services/gamaIspInvoicesService.ts` — service + `GAMA_ISP_ERP`.
- `invoices/services/gamaIspInvoicesService.spec.ts` — spec.
- `invoices/types/gamaIspTypes/` — tipos da resposta da API.
- `companies/dto/create-company.dto.ts` e `update-company.dto.ts` — GAMAISP na
  descrição de credenciais do Swagger.
- `integrations/erp/erp.registry.ts` — `GAMA_ISP_ERP` em `DEFINICOES`.
- `integrations/erp/erp-preflight.service.ts` — preflight `credential` via `/api/v1/auth`.
- `clients/clients-sync.cron.ts` — `case 'GAMAISP'` (`fetchClients` + `toClientUpsert`).
- `invoices/invoice-sync.cron.ts` — `syncGamaIsp`, `ERPS_FORA_DO_CICLO_RECORRENTE`
  e a renomeação `syncMkInvoicesDaily` → `syncErpsPesadosDaily`.
- `invoices/invoices.service.ts` — `GAMAISP` no allowlist da régua.
- `templates/template-dispatch-payload.service.ts` — bloco de disparo do GAMAISP.
- `templates/relatory-resolver.cron.ts` — verificação de retorno (fatura paga) por documento.
- `app.module.ts` — provider `GamaIspInvoicesService`.

## Pendências

### PDF do boleto ficou de fora — por decisão, não por falta

O endpoint existe: `GET /api/v1/faturas/id/{id}/pdf`. O problema é o formato — ele
devolve **JSON com o PDF em base64** (campo `data.base64`, ~250 KB por fatura, mais
um campo `file` com um caminho interno do servidor). **Não há URL pública.**

O campo `link_boleto_pdf` do payload de disparo espera um **link**, não um blob.
Preencher exigiria hospedar o arquivo ou expor uma rota proxy. Três opções foram
avaliadas:

| Opção | Custo | Situação |
|---|---|---|
| **Não preencher** (`ticket_pdf_link: null`) | zero | **escolhida** — PIX e linha digitável cobrem o pagamento |
| Hospedar em storage e mandar a URL | storage, ciclo de vida do arquivo, boleto em URL pública | não feita |
| Rota proxy no backend | rota nova, autenticação do link, 250 KB por acesso | não feita |

Para quem retomar: a decisão real está entre as duas últimas, e a terceira evita
expor boleto em URL adivinhável.

#### ⚠️ Consequência operacional: o template da POWERNET não pode ter header DOCUMENT

`link_boleto_pdf` vazio **não gera erro** — o componente some em silêncio. Em
`template-dispatch-payload.service.ts` (`buildRecipientFromBlueprint`), o header de
documento só é anexado `if (pdfLink)`; link vazio simplesmente não entra na lista
de `components`. Note o contraste: uma variável de **body** vazia derruba o
destinatário inteiro (`return null` + log), mas o header vazio passa batido.

Como para GAMAISP o link é **sempre** vazio, um template aprovado com header
DOCUMENT sai **sem o componente de header** e tende a ser **recusado pela Meta** por
divergir do template aprovado. **Regra: os templates da POWERNET não podem ter
header DOCUMENT** — só texto, PIX e linha digitável no body.

### `list` vazia é ambígua: "quitou" e "CPF inexistente" chegam iguais

O `relatory-resolver.cron.ts` consulta o ERP por documento a cada 2 h
(`erp === 'GAMAISP'`) e marca `resolved = true` quando não há mais fatura em aberto.
Só que a rota devolve **200 com `data: []`** tanto para quem quitou tudo quanto para
um CPF que não existe. O cron não distingue: nos dois casos marca resolvido.

Um CPF errado na base, portanto, aparece como cliente que pagou. Vale conferir o
`resolved` contra o snapshot antes de tratá-lo como conversão.

### `/api/v1/faturas/id/{id}` — fallback conhecido, não usado

Existe e devolve a fatura completa **com o PIX**. Hoje é redundante: a busca por
documento já traz `pix_qrcode` preenchido. Fica registrado como fallback caso o PIX
passe a vir `null` na listagem por documento.

## O que sobra para uma próxima rodada

- **Link do boleto em PDF** — a única capacidade que falta de verdade. As três
  opções estão na seção de Pendências.
- **Sync incremental** — impossível hoje: a API não tem filtro por data de
  alteração. Só muda se a Gama ISP passar a oferecer um. Enquanto isso, clientes é
  carga completa diária (~40 páginas) e faturas é carga completa da janela, com
  parada antecipada pela ordenação.

Registro da decisão: quando a campanha ainda não funcionava, a escolha entre
**bloquear a tela de campanhas** para este ERP ou **implementar a sincronização**
foi resolvida pela segunda — foi o que originou tudo que está na seção
"Sincronização".
