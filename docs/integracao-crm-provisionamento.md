# Integração CRM → Vital: provisionamento de empresa

Documento de contrato para o desenvolvedor do CRM. Descreve o endpoint que
cadastra uma empresa no project-charge (Vital) a partir do kickoff no CRM.

- **Endpoint:** `POST /api/webhooks/companies`
- **Controller:** `backend/src/webhooks/provisioning.webhook.controller.ts`
- **Regra de negócio:** `backend/src/companies/companies.service.ts` → `create()`

---

## Por que existe um endpoint separado

Existe também um `POST /api/companies`, para uso humano no painel. Ele exige um
JWT de sessão emitido no login, válido por 12h, com role `super_admin` — shape
errado para chamador de máquina: obrigaria o CRM a guardar a senha de uma pessoa
e quebraria sozinho quando o token expirasse.

Os dois endpoints chamam **exatamente a mesma regra de negócio**. Só a
autenticação difere.

---

## Autenticação

Header obrigatório em toda chamada:

```
x-provisioning-token: <segredo combinado>
```

O segredo é definido na variável de ambiente `PROVISIONING_TOKEN` do backend.
Peça o valor ao time do Vital — **não** é o mesmo que `token_system_coraxy`.

| Situação | Resposta |
|---|---|
| Header ausente ou valor errado | `401` |
| `PROVISIONING_TOKEN` não configurado no servidor | `401` (falha fechada) |

---

## Payload

`Content-Type: application/json`

### Campos obrigatórios

| Campo | Tipo | Observação |
|---|---|---|
| `name` | string | Nome da empresa |
| `url` | string | **Host puro do ERP**, sem `https://`, sem barra final, sem caminho. Ex.: `ixc.toplinkbrasil.com.br` |
| `account_chatwoot` | string | Precisa ser único. Repetido → `409` |
| `erp` | string | Um dos códigos aceitos (ver tabela abaixo) |
| `plano` | string | `"disparo"` ou `"cobranca"` |
| `token_system_coraxy` | string | Token da empresa para o webhook de agentes do Maestro |
| `credenciais` | objeto | Campos variam por ERP (ver abaixo) |

### Campos opcionais

| Campo | Tipo | Observação |
|---|---|---|
| `crm_company_id` | string | **Envie sempre.** É o que torna a chamada idempotente — ver seção Idempotência |
| `paginasExtras` | string[] | Páginas liberadas além do plano. Ex.: `["clientesVencidos"]` |
| `cnpj` | string | Apenas dígitos |
| `teamChargeId` | string | Id do time de cobrança no Chatwoot |
| `token_notificameHub` | string | X-Api-Token da conta NotificaMe |
| `canais` | objeto[] | `[{ "id": "...", "numero": "+55 11 3619-3617" }]` |

> **Qualquer campo não listado acima resulta em `400`.** Em especial, **não é
> possível enviar `config`** — ele é montado pelo backend. Essa restrição é
> deliberada: empresas cadastradas manualmente já nasceram travadas por herdarem
> o `config` de outra empresa, e o endpoint fecha esse caminho.

---

## Planos

O plano define quais páginas a empresa enxerga. É uma decisão comercial e não
tem default — precisa vir no payload.

| Plano | Páginas liberadas |
|---|---|
| `disparo` | disparo manual, campanhas, templates, histórico |
| `cobranca` | tudo acima + dashboard, clientes vencidos, chat |

Para vender um adicional avulso, use `paginasExtras`:

```json
{ "plano": "disparo", "paginasExtras": ["clientesVencidos"] }
```

Valores aceitos em `paginasExtras`: `disparoManual`, `campanhas`, `templates`,
`historico`, `dashboard`, `clientesVencidos`, `chat`.

---

## ERPs e credenciais

Consulte `GET /api/companies/erps` para a lista sempre atualizada, com as
capacidades e credenciais exigidas por cada um. Estado no momento deste
documento:

| `erp` | `credenciais` obrigatórias | Sincroniza clientes | Sincroniza faturas |
|---|---|:--:|:--:|
| `IXC` | `autorization` | sim | sim |
| `SGP` | `username`, `password` | sim | sim |
| `MK` | `sys`, `password`, `cd_servico`, `masterToken` | sim | sim |
| `HUBSOFT` | `client_id`, `username`, `password` (+ `client_secret` opcional) | **não** | **não** |
| `RADIUSNET` | nenhuma | **não** | **não** |

`HUBSOFT` e `RADIUSNET` são cadastráveis, mas não têm sincronização
implementada — a resposta traz isso em `erp.ressalva`. Repasse esse aviso a
quem estiver fazendo o kickoff.

O formato de `autorization` do IXC é `"id:token"`, ex.: `"41:89ac11d5..."`.

---

## Exemplo

```bash
curl -X POST https://<host-do-vital>/api/webhooks/companies \
  -H "Content-Type: application/json" \
  -H "x-provisioning-token: $PROVISIONING_TOKEN" \
  -d '{
    "crm_company_id": "CRM-4821",
    "name": "TOPLINK",
    "url": "ixc.toplinkbrasil.com.br",
    "account_chatwoot": "13",
    "erp": "IXC",
    "plano": "cobranca",
    "token_system_coraxy": "<token da empresa>",
    "cnpj": "53932197000163",
    "credenciais": {
      "autorization": "41:89ac11d5..."
    }
  }'
```

---

## Resposta

`200 OK` em caso de sucesso (inclusive quando o ERP recusa a credencial — ver
abaixo).

```json
{
  "success": true,
  "message": "Empresa cadastrada e credencial validada no ERP.",
  "company": {
    "id": "e8f49479-9ae0-4fe9-9b38-8f3dafc4d620",
    "name": "TOPLINK",
    "account_chatwoot": "13",
    "erp": "IXC",
    "active": true
  },
  "preflight": {
    "status": "ok",
    "clientesVisiveis": 2894,
    "faturasVisiveis": 18551,
    "erro": null,
    "verificadoEm": "2026-07-27T15:38:59.858Z"
  },
  "erp": {
    "label": "IXC",
    "syncClients": true,
    "syncInvoices": true,
    "ressalva": null
  },
  "permissoes": {
    "disparoManual": true, "campanhas": true, "templates": true,
    "historico": true, "dashboard": true, "clientesVencidos": true, "chat": true
  }
}
```

### O campo que importa: `preflight`

Antes de gravar, o backend testa a credencial contra o ERP de verdade.

| `preflight.status` | Significa | `company.active` |
|---|---|:--:|
| `ok` | Credencial validada. `clientesVisiveis` / `faturasVisiveis` mostram o que ela enxerga | `true` |
| `sem_integracao` | ERP sem integração implementada — não há o que testar | `true` |
| `falhou` | O ERP recusou a credencial, ou não foi possível alcançá-lo | **`false`** |

**`status: "falhou"` não é erro HTTP.** A empresa é criada **inativa**, com o
motivo em `preflight.erro`, porque no kickoff a credencial nem sempre já está
liberada do lado do cliente. Trate como pendência, não como falha da chamada:

```json
{
  "company": { "active": false },
  "preflight": {
    "status": "falhou",
    "erro": "O ERP recusou a credencial (HTTP 401: ...). Peça uma credencial com permissão de leitura em clientes e contas a receber."
  }
}
```

A mensagem em `preflight.erro` é escrita para ser repassada a quem atende o
cliente — pode exibir direto na tela do CRM.

`clientesVisiveis` e `faturasVisiveis` vêm `null` em MK e HUBSOFT: as APIs
desses ERPs não expõem contagem barata. `null` significa "não sei", não "zero".

---

## Idempotência

**Envie `crm_company_id` em toda chamada.** Chamador de máquina repete
requisição depois de timeout de rede, e sem esse campo a repetição volta `409` —
o CRM ficaria sem saber se o cadastro anterior deu certo.

Com o campo, reenviar é seguro:

```json
{
  "success": true,
  "jaExistia": true,
  "message": "Empresa ja cadastrada para este crm_company_id. Nenhuma alteracao foi feita."
}
```

A empresa existente é devolvida sem alteração. Trate `jaExistia: true` como
sucesso.

---

## Erros

| HTTP | Quando | Ação no CRM |
|---|---|---|
| `400` | Payload inválido, ERP desconhecido, credencial obrigatória faltando, ou campo não permitido (ex.: `config`) | Corrigir o payload. `message` diz exatamente qual campo |
| `401` | Header ausente ou segredo inválido | Verificar `x-provisioning-token` |
| `409` | `account_chatwoot` já cadastrado **e** sem `crm_company_id` que permita tratar como reenvio | Conferir se é duplicata real |
| `5xx` | Erro interno | Repetir com backoff — o `crm_company_id` garante que não duplica |

Exemplos de `400`:

```json
{ "message": ["property config should not exist"] }
{ "message": "erp deve ser um destes: IXC, SGP, MK, HUBSOFT, RADIUSNET" }
{ "message": "Credenciais obrigatorias faltando para SGP: password (Senha da API URA do SGP.)" }
```

---

## Configuração no servidor do Vital

Não é assunto do CRM, mas fica registrado.

`PROVISIONING_TOKEN` no `.env` do backend. O `docker-compose.yml` já carrega o
`.env` via `env_file` e declara a variável explicitamente.

```bash
# gerar
openssl rand -base64 32

# conferir se o container recebeu
docker exec minha-api-teste sh -c 'test -n "$PROVISIONING_TOKEN" && echo ok || echo AUSENTE'
```

Sem a variável definida, o endpoint recusa todas as chamadas com `401` e loga
`PROVISIONING_TOKEN nao configurado`. É falha fechada, de propósito — um segredo
default num endpoint público seria pior que não ter endpoint.
