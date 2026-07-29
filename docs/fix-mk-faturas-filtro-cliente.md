# Fix — MK/PROXER: filtro por cliente na `WSMKFaturasAbertas` (`cd_pessoa`)

## Problema (relatado pela PROXER)
A equipe da PROXER informou que as requisições do sistema de cobrança estavam
**salvando muito dado no lado deles e pesando o servidor** — pediram para
"remover a coluna `par_saida` ou diminuir a quantidade de fatura por requisição".

`par_saida` é uma **coluna de log do ERP MK deles** que guarda a *saída* (resposta)
de cada requisição. Não existe no nosso código: nós não a enviamos, nós a
engordávamos pelo **tamanho da resposta**.

## Causa-raiz
O adapter do MK era o **único** ERP cujo `getInvoices` (por cliente) **não filtrava
por cliente na requisição**:

- **IXC** manda `qtype=fn_areceber.id_cliente` → o ERP devolve só o cliente.
- **SGP** manda `cpfcnpj` → o ERP devolve só o cliente.
- **MK** mandava só `dt_venc_inicio`/`dt_venc_fim` → o ERP devolvia **TODAS** as
  faturas em aberto da janela (a base inteira) e o filtro por cliente era feito
  **na memória** (`lista.filter(codpessoa === clientId)`).

Como o `getInvoices` roda **uma vez por cliente** (preload de campanha em
`template-dispatch-payload.service.ts`, verificação de retorno em
`relatory-resolver.cron.ts` e disparo manual), cada destinatário disparava uma
requisição que baixava a base toda → o MK gravava respostas gigantes em
`par_saida`. Numa campanha de N clientes isso multiplicava por N.

## Descoberta (probe ao vivo, 2026-07-29)
Sondagem direta na API de produção da PROXER (`WSMKFaturasAbertas`), janela
`20–31/07/2026`:

- **sem filtro:** 2851 faturas (1885 clientes distintos).
- candidatos testados: `codpessoa`, `cd_cliente`, `codigo_pessoa`, `pessoa`,
  `codcliente`, `cd_cliente_inicio` → **ignorados** (voltavam 2851).
- **`cd_pessoa=<codpessoa>` → devolveu só as faturas daquele cliente.** Confirmado
  com dois clientes distintos (controle). `cd_pessoa` usa o mesmo id que já
  guardamos como `client.clientId` (= `codpessoa` = `CodigoPessoa`).

Observação: a lista sem filtro traz **faturas duplicadas** (uma `cd_fatura`
aparecendo 3x), o que inflava a contagem e dobraria as chamadas de detalhe/PIX.

## Correção
Arquivo: `backend/src/invoices/services/mkInvoicesService.ts` (`getInvoices`).

1. Adiciona `&cd_pessoa=<client.clientId>` na URL da `WSMKFaturasAbertas` → o ERP
   passa a devolver **só as faturas do cliente**, igual ao IXC/SGP. Mesma lógica
   de saída; muda só o tamanho da requisição.
2. Mantém o filtro por `codpessoa` como **rede de segurança** (se o ERP ignorar o
   `cd_pessoa` em algum cenário, a saída continua correta).
3. **Dedupe por `cd_fatura`** (a lista às vezes repete a mesma fatura), evitando
   chamadas de detalhe/PIX redundantes.

Não muda o sync diário (`getInvoicesByDateWindowBatch`), que precisa de todos os
clientes de propósito (roda 1x/dia, de madrugada). Não cria rotas/arquivos.
**Só afeta o MK.**

## Validação
- `npx tsc --noEmit` OK; `jest mkInvoicesService` 9/9.
- Probe end-to-end simulando o novo `getInvoices` para um cliente real
  (`cd_pessoa=1303968`, janela ampla): retornou **40 faturas, todas do próprio
  cliente**, com detalhe (vencimento, valor, PDF) e **PIX real** (`00020101...
  br.gov.bcb.pix...`) em cada uma.
- Efeito: resposta por requisição cai de **~2851 → dezenas** (só o cliente);
  `par_saida` por requisição encolhe na mesma proporção.

## Pendências
- Se a PROXER também reclamar do **sync diário** (puxa a janela inteira de todos os
  clientes 1x/dia), o caminho lá é **fatiar a janela** (ex.: mês a mês) — não o
  filtro por cliente (esse sync precisa de todos).
