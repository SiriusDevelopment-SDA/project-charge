# Integração de empresa no sistema de cobrança — por ERP

Guia de como colocar uma empresa pra funcionar no cobrança/disparo, **um bloco por ERP**.
O que muda entre eles são as **credenciais** e as **ressalvas**; o resto do fluxo é comum.

## Visão geral — o que cada ERP faz hoje

| ERP | Sincroniza clientes | Sincroniza faturas | PIX | Disparo | Observação |
|---|:---:|:---:|:---:|:---:|---|
| **IXC** | ✅ | ✅ | ✅ | ✅ | Integração completa |
| **SGP** | ✅ | ✅ | ✅ | ✅ | Integração completa |
| **MK** | ✅ | ✅ | ✅ | ✅ | Fora do ciclo de 10min (sincroniza 1x/dia 4h + manual) |
| **HUBSOFT** | ✅ | ✅ | ✅¹ | ✅ | Integração completa. ¹PIX quando a fatura tiver copia-e-cola; fatura só-boleto cai no boleto |
| **RADIUSNET / outro** | ❌ | ❌ | ❌ | ❌ | **Sem integração** — precisa implementar antes |

---

## Fluxo comum (vale para todos os já integrados)

1. **Cadastrar a empresa** — `POST /api/companies` (Swagger `/api/docs`, super_admin). **Nunca por SQL.**
   > ⚠️ Cadastrar por SQL (ou clonar `config` de outra empresa) faz a empresa nascer travada
   > no modo incremental (`fullClientLoadAt`/`lastClientSyncAt`) e nunca fazer a carga completa.
   O endpoint monta o `config` do zero e evita isso.
2. **Conferir que não nasceu travada** (logo após criar; tem que vir **null/null**):
   ```sql
   SELECT config->>'fullClientLoadAt', config->>'lastClientSyncAt'
   FROM company WHERE name ILIKE '%NOME%';
   ```
3. **1ª sincronização** — Painel → empresa → **Clientes Vencidos** → **"Atualizar ERP"** (carga completa: clientes → faturas).
4. **Validar:**
   ```sql
   SELECT (SELECT count(*) FROM client  WHERE "companyId"=c.id) AS clientes,
          (SELECT count(*) FROM invoice WHERE "companyId"=c.id) AS faturas
   FROM company c WHERE c.name ILIKE '%NOME%';
   ```
   clientes ≈ total do ERP, faturas > 0, PIX no Disparo Manual, disparo de teste no número de teste.

---

## IXC

- **Credenciais (`credenciais` no cadastro):** `autorization` — formato **`id:token`** (ex.: `41:89ac11d5...`). Enviado como `Basic base64` no header.
- **Capacidades:** clientes ✅, faturas ✅, PIX ✅, disparo ✅.
- **Específico:**
  - PIX é buscado **sob demanda no disparo** (não fica no snapshot).
  - Clientes **sem CPF ou sem telefone** (`whatsapp`/`telefone_celular`/`fone_celular`) são descartados.
  - Carga completa traz `cliente.ativo='S'` paginado; incremental usa `ultima_atualizacao` (formato ISO `YYYY-MM-DD HH:mm:ss`).
- **Validação:** seguir o fluxo comum. `clientes` deve bater com o total de ativos no IXC.

## SGP

- **Credenciais:** `username`, `password` (API URA do SGP).
- **Capacidades:** clientes ✅, faturas ✅, PIX ✅, disparo ✅.
- **Específico:**
  - Faturas e **PIX vêm juntos** no snapshot (o SGP já devolve o `codigoPix` do título).
  - Busca de faturas por **CPF/CNPJ** do cliente, status "abertos".
- **Validação:** fluxo comum. PIX já deve aparecer sem busca extra.

## MK (Proxer)

- **Credenciais:** `sys`, `password`, `cd_servico`, `masterToken`.
- **Capacidades:** clientes ✅, faturas ✅, PIX ✅, disparo ✅.
- **Ressalva (do próprio registro):** *"Fica fora do ciclo de faturas de 10 minutos por custo; sincroniza no ciclo diário das 4h e no disparo manual."* → para a 1ª carga, use o **"Atualizar ERP"** (manual).
- **Específico:**
  - Faturas filtradas por **`cd_pessoa`** (= clientId) — sem isso baixaria a base inteira por cliente.
  - **PIX por `CodigoFatura`** (não por documento).
  - `status` da fatura = **situação do cliente** (Ativo/Suspenso = cobra; Cancelado = descarta).
  - Encoding da API é quebrado (acentos) — já tratado no adapter.
- **Validação:** fluxo comum, via "Atualizar ERP" (não espere o cron de 10min).

## HUBSOFT

- **Credenciais:** `client_id`, `username`, `password` (OAuth grant password); `client_secret` **opcional**.
  > ⚠️ **`client_id` é o ID da *aplicação de integração/OAuth*** (criada pelo admin do provedor no Hubsoft, par do `client_secret`) — **não** confunda com o "código do cliente" de um assinante. É um número (ex.: `118`, `89`).
- **Capacidades:** clientes ✅, faturas ✅, PIX ✅ (quando houver), disparo ✅. **Fica na cron de 10min** (não precisa de 1 chamada por fatura — o PIX já vem na listagem).
- **Específico:**
  - **Clientes:** sempre **carga completa** (`/api/v1/integracao/cliente/todos`, paginado 500/página). A API ignora o filtro de data por atualização, então não há incremental — mas a varredura é barata (sem detalhe por registro) e nunca perde atualização de cadastro.
  - **Faturas (snapshot):** `/api/v1/integracao/financeiro/fatura` com `apenas_em_aberto=sim` + `exibir_pix_copia_cola=sim`, casadas ao cliente **por CPF/CNPJ** (igual ao SGP).
  - **PIX:** vem no snapshot no campo `pix_copia_e_cola` (com "e"); no disparo per-cliente é `pix_copia_cola` — os dois nomes são tratados. **Fatura `boleto_bancario` sem PIX** volta `null` e o disparo cai no **boleto** (linha digitável + PDF), que vem preenchido.
- **Validação:** fluxo comum, via "Atualizar ERP". Órfãs (fatura de cliente que não está na base, ex.: cancelado) são descartadas e logadas — comportamento igual aos outros ERPs.

---

## ERP não integrado (RADIUSNET ou qualquer outro novo)

**Cadastrar não basta** — o sistema não sabe falar com esse ERP. É preciso **implementar o adapter** (tarefa de dev; referência: `mkInvoicesService.ts` / `ixcInvoicesService.ts`):

1. **Declarar o ERP:** exportar uma `ErpDefinition` no service (code, label, capacidades, `credenciais`, `ressalva`) e registrar em `integrations/erp/erp.registry.ts`.
2. **Clientes** *(filtros: data de cadastro + status)* → implementar `fetchClients(company, since?)` e ligar no `switch` de `clients-sync.cron.ts`.
3. **Faturas** *(filtros: status + vencimento início/fim)* → implementar `getInvoicesByDateWindowBatch` + `getInvoices` e ligar no dispatch de `invoice-sync.cron.ts` + `template-dispatch-payload.service.ts`.
4. **PIX** *(filtros: documento/código da fatura)* → implementar `fetchPixByInvoice` e ligar no `invoicesController` (`pix/batch`).
5. **Registrar o service** em `app.module.ts`.
6. **Validar** seguindo o **Fluxo comum** acima.

> Regra: só marque uma capacidade como `true` na `ErpDefinition` no commit que ela realmente funciona — senão a empresa é cadastrada achando que sincroniza quando não sincroniza (foi o caso do Hubsoft, cujo `pix` ficou `true` sem o consumidor ler o campo até a integração ser completada).
