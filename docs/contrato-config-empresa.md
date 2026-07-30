# Contrato do `company.config`

O `config` é uma coluna `jsonb` livre. Sem contrato, cada cadastro manual ao longo
do tempo escreveu o que quis — hoje convivem quatro formatos diferentes, e boa
parte do conteúdo não é lida por ninguém.

Este documento é o inventário do que o código **realmente lê**, levantado por
varredura no backend e no frontend. Chave que não está aqui é chave que não faz
nada.

## Regra geral

> Só entra no `config` o que a aplicação lê. Nada de credencial "por garantia",
> nada de dado de outro produto, nada de campo que "pode ser útil um dia".

Credencial guardada e não usada não é backup: é senha em claro no banco, sem
ninguém responsável por ela.

---

## 1. Credenciais do ERP

Cada ERP declara suas credenciais no próprio service (`ErpDefinition.credenciais`)
e o registro é a fonte da verdade — [erp.registry.ts](../backend/src/integrations/erp/erp.registry.ts).
Repetido aqui só para leitura rápida.

| ERP | Vai para o `config` | Vai para a coluna `autorization` |
|---|---|---|
| **IXC** | *(nada)* | `autorization` |
| **SGP** | `username`, `password` | — |
| **MK** | `sys`, `password`, `cd_servico`, `masterToken` | — |
| **HUBSOFT** | `client_id`, `client_secret`*, `username`, `password` | — |
| **RADIUSNET** | *(sem integração)* | — |

\* `client_secret` é o único opcional.

**Consequência prática:** numa empresa **IXC** o `config` não tem nenhuma
credencial. Se você encontrar `username`/`password` no config de uma empresa IXC,
é lixo — a credencial de verdade está na coluna `autorization`.

---

## 2. Permissões de página

| Chave | Tipo | Observação |
|---|---|---|
| `plano` | `'disparo'` \| `'cobranca'` | modelo atual |
| `paginasExtras` | `string[]` | páginas soltas além do plano |

Modelo **legado**, ainda suportado por [planos.ts](../backend/src/companies/planos.ts)
mas que não deve ser usado em cadastro novo:

`page_dashboard`, `page_clientesVencidos`, `page_chat`, `page_campanhas`

São *opt-out*: a ausência libera, `false` bloqueia. Semântica invertida em relação
ao `plano`, e é justamente por isso que convivem dois caminhos no código.

**O plano se troca, nunca se remove.** Não existe valor que o apague — `null` e
`""` devolvem 400, e `montarConfig` não tem ramo de remoção. Não é esquecimento:
sem `plano` a empresa cai no legado, onde a **ausência libera**. Remover seria a
única operação capaz de entregar dashboard, clientes vencidos e chat sem venda —
exatamente o que a obrigatoriedade do plano no cadastro impede.

O legado é rampa de compatibilidade para empresa antiga, não destino: legado →
plano, nunca de volta. Para reduzir acesso, troque para `disparo`; para devolver
tudo, `cobranca`, que libera as sete páginas — o mesmo que o legado sem flags
dava, só que por decisão em vez de por omissão.

---

## 3. Integração com o Chatwoot

| Chave | Tipo | Lido em |
|---|---|---|
| `chatwoot_admin_token` | `string` | [auth.service.ts:563](../backend/src/auth/auth.service.ts#L563) |
| `chatwoot_labels` | `string[]` | [chatwoot.service.ts:1391](../backend/src/chatwoot/chatwoot.service.ts#L1391) |

Atenção: a leitura aceita **três nomes** para o mesmo token —
`chatwoot_admin_token`, `chatwoot_app_token` e `chatwoot_token_admin`. A escrita
só produz o primeiro. Os outros dois existem para não quebrar cadastro antigo e
devem ser normalizados.

---

## 4. Automação de promessa de pagamento

| Chave | Tipo |
|---|---|
| `promiseAutomation.reminderEnabled` | `boolean` |
| `promiseAutomation.reminderTiming` | `'day_before'` \| `'same_day'` \| `'both'` |
| `promiseAutomation.autoBreakEnabled` | `boolean` |
| `promiseAutomation.checkPaymentBeforeBreak` | `boolean` |
| `promiseAutomation.reminderTemplateId` | `string` |
| `promiseAutomation.reminderTemplateName` | `string` |

Todas opcionais, com default seguro (lembrete desligado). Escritas pela tela de
configuração, não pelo cadastro.

---

## 5. Ajuste fino por empresa

Opcionais. Só existem para o caso de um ERP específico não aguentar o padrão.

| Chave | Default | Vale para |
|---|---|---|
| `timeoutMs` | `90000` | SGP, MK |
| `retries` | `3` | SGP, MK |
| `clientsConcurrency` | `5` | SGP |
| `invoicesConcurrency` | — | MK |

---

## 6. Estado gerido pelo sistema — **nunca cadastrar à mão**

| Chave | Quem escreve |
|---|---|
| `fullClientLoadAt` | [clients-sync.cron.ts](../backend/src/clients/clients-sync.cron.ts) |
| `lastClientSyncAt` | idem |
| `preflight` | [companies.service.ts](../backend/src/companies/companies.service.ts) no cadastro e a cada revalidação |
| `crm_company_id` | o cadastro, quando vem do CRM; ou a vinculação (ver abaixo) |

`crm_company_id` é a exceção da tabela: as outras o sistema escreve sozinho, esta
alguém informa uma vez. É o que liga a empresa daqui à empresa lá no CRM, e sem
ela o CRM não alcança a empresa por nenhuma rota.

`fullClientLoadAt` e `lastClientSyncAt` controlam a janela incremental de
sincronização. Preencher isso à mão foi **a causa raiz** do incidente em que
TOPLINK e UPLINK ficaram meses sem baixar fatura: o config foi copiado de outra
empresa e nasceu com `lastClientSyncAt`, a carga completa nunca rodou, e todas as
faturas eram descartadas por falta de cliente.

---

## Chaves mortas

Presentes em empresas antigas, **sem nenhuma leitura** no backend ou no frontend:

| Chave | O que era |
|---|---|
| `app` | marcador `"maestro"` |
| `acs` | `{ url, username, password }` de outro produto |
| `gatewayViabilidade` | zero ocorrência no repositório |
| `mapeamentoDeRede` | zero ocorrência no repositório |
| `grand_type` | typo de `grant_type` — o HUBSOFT usa o valor fixo `'password'` no código ([hubsoftInvoicesService.ts:90](../backend/src/invoices/services/hubsoftInvoicesService.ts#L90)) e nunca lê esta chave |
| `username`, `password` **em empresa IXC** | credencial que o IXC não usa |

`acs` e as credenciais residuais são senha em claro no banco, sem consumidor.

O `grand_type` merece nota: alguém tentou parametrizar o `grant_type` do OAuth do
HUBSOFT, errou o nome, e ninguém percebeu porque o código nunca leu o campo. É o
retrato do problema — sem contrato, uma chave errada não falha, só fica lá.

Limpeza: [`backend/scripts/limpar-config-empresa.sql`](../backend/scripts/limpar-config-empresa.sql).

---

## Descobrindo chave nova

A lista de mortas acima é o retrato de hoje. Para não depender dela, o inventário
sai do próprio banco:

```sql
SELECT chave, COUNT(*)::int AS empresas,
       string_agg(DISTINCT upper(erp), ', ') AS erps
  FROM company, LATERAL jsonb_object_keys(config::jsonb) AS chave
 GROUP BY chave ORDER BY empresas DESC, chave;
```

Chave que aparecer aí e não estiver neste documento é uma das duas coisas: lixo
novo, ou algo que passou a ser lido e a documentação não acompanhou. Nas duas
hipóteses, precisa de decisão antes de qualquer limpeza.

É o passo 0 do script de limpeza.

## Como manter assim

O contrato só se sustenta porque não existe mais motivo para abrir o psql. São
dois caminhos suportados, e nenhum aceita `config` cru:

| Ação | Humano (super_admin) | CRM (máquina) |
|---|---|---|
| Cadastrar | `POST /companies` | `POST /webhooks/companies` |
| Alterar | `PATCH /companies/:id` | `PATCH /webhooks/companies/:crm_company_id` |
| Vincular ao CRM | `POST /companies/vincular-crm` | — (ver abaixo) |

O `PATCH` é o ponto onde o contrato vira código: ele chama
[`montarConfig`](../backend/src/companies/config.contract.ts), que **preserva** o
que o sistema escreve e o que outras telas configuram, **aplica** o que foi
pedido por campo nomeado, e **descarta** o que o contrato não reconhece —
devolvendo a lista em `config.descartadas`.

Efeito prático: cada alteração deixa a empresa mais limpa do que estava. Uma
empresa com `acs`, `app` e `gatewayViabilidade` perde as três no primeiro PATCH
que receber, sem ninguém precisar lembrar de limpar.

**Antes de aplicar, dá para olhar.** `PATCH` com corpo vazio não escreve nada:
responde `aplicado: false` e devolve em `config.descartadas` exatamente o que um
PATCH real removeria daquela empresa. Duas coisas de uma vez — a limpeza deixa de
ser surpresa, e um PATCH vazio disparado por engano (ou usado como health-check
por um CRM) não mexe no dado de ninguém. Alteração precisa ser pedida, não ser
efeito colateral de um ping.

### Quando o preflight falha

Alterar `url` ou `credenciais` dispara novo preflight. Aceito, a empresa reativa
— é o caminho para consertar uma empresa recusada, sem recadastrar. Recusado, o
que acontece depende de **por que** falhou, e `preflight.causa` diz qual foi:

| `causa` | O que houve | Empresa já ativa | Empresa inativa |
|---|---|---|---|
| `credencial` | O ERP respondeu e recusou (401/403, token não emitido) | **Inativa** | Continua inativa |
| `configuracao` | O ERP respondeu outra coisa (404, 5xx, corpo não-JSON), ou falta dado nosso | **Inativa** | Continua inativa |
| `inacessivel` | Não deu para falar com o ERP: timeout, DNS, conexão recusada | **Mantida ativa**, com WARN no log | Continua inativa |

A linha que importa é a última. `inacessivel` é transitório e pode não ter nada a
ver com a credencial enviada: inativar por causa de três segundos de instabilidade
para a sincronização e ninguém percebe — o operador acha que salvou e foi embora.
Se a credencial estiver de fato errada, a sincronização acusa em seguida. As
outras duas causas são estáveis: precisam ficar visíveis, e inativam.

Cadastro novo (`POST`) não tem essa distinção — qualquer falha nasce inativa. Não
há o que proteger: a empresa nunca esteve funcionando.

### Vinculando empresa antiga ao CRM

Toda empresa cadastrada antes do provisionamento por webhook está sem
`crm_company_id`, e sem ele o CRM não a alcança por nenhuma porta: o `PATCH`
devolve 404 e o `POST` devolve 409, porque o `account_chatwoot` já existe. Não é
uma ou outra — é praticamente todas.

```
POST /companies/vincular-crm          (super_admin)
{ "vinculos": [ { "account_chatwoot": "99", "crm_company_id": "CRM-0001" } ] }
```

Identifica pela `account_chatwoot` porque é o que o CRM já conhece; exigir o uuid
interno transformaria o vínculo numa consulta manual empresa por empresa. Cada
par é decidido por conta própria e o resultado volta item a item — `vinculada`,
`ja_vinculada`, `nao_encontrada`, `conflito_vinculo_existente` ou
`conflito_crm_id_em_uso`. Um par errado não derruba o lote, e reenviar o mesmo
lote é seguro.

**Vincular não limpa o config.** É a única escrita do módulo que não passa por
`montarConfig`: vincular é estabelecer correspondência, não pedir faxina. A
limpeza continua acontecendo no primeiro PATCH de verdade, onde dá para ver a
lista antes de aplicar.

Três recusas guardam o vínculo:

- **Trocar um vínculo existente** devolve 400, aqui e no `PATCH`. Repontar não
  quebra nada na hora, e a partir dali o CRM passa a alterar outra empresa
  recebendo 200 em todo pedido.
- **Id do CRM já usado por outra empresa** devolve 409. Dois vínculos iguais
  deixariam a busca do webhook devolvendo uma das duas sem critério.
- **O webhook do CRM não altera `crm_company_id`**, devolve 400. Não resolveria
  nada — ele acha a empresa *pelo* vínculo, então quem não tem nunca chega lá — e
  abriria sequestro: o `PROVISIONING_TOKEN` é único e sem escopo por empresa,
  quem o tiver repontaria empresa alheia para um id que controla.

E as três regras que continuam valendo:

1. **Chave nova exige entrada neste documento**, junto do arquivo que a lê, e
   entrada em `config.contract.ts` — senão o primeiro PATCH a descarta.
2. Antes de adicionar algo ao config, a pergunta é: *qual linha de código lê
   isto?* Se não houver resposta, não entra.
3. `account_chatwoot` e `erp` não se alteram: são identidade, não ajuste.
