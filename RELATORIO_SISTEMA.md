# Relatório Técnico — Sistema Coraxy Cobrança
**Data:** Março 2026
**Versão:** fix/pageCampanhas
**Stack:** NestJS (Backend) + React + TypeScript (Frontend) + PostgreSQL + Redis

---

## Sumário

1. [Arquitetura Geral](#1-arquitetura-geral)
2. [Autenticação e Segurança](#2-autenticação-e-segurança)
3. [Fila de Mensagens (Message Queue)](#3-fila-de-mensagens-message-queue)
4. [Worker de Processamento](#4-worker-de-processamento)
5. [Agendador de Campanhas](#5-agendador-de-campanhas)
6. [Webhook NotificaMe](#6-webhook-notificame)
7. [Cron de Resolução de Relatórios](#7-cron-de-resolução-de-relatórios)
8. [Integrações ERP](#8-integrações-erp)
9. [Templates e Disparo](#9-templates-e-disparo)
10. [Campanhas](#10-campanhas)
11. [Entidades do Banco de Dados](#11-entidades-do-banco-de-dados)
12. [API — Endpoints](#12-api--endpoints)
13. [Frontend](#13-frontend)
14. [Infraestrutura](#14-infraestrutura)

---

## 1. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                   │
│  Disparo Manual │ Campanhas │ Histórico │ Dashboard      │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│                   BACKEND (NestJS)                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Controllers │  │   Services   │  │    Crons     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Message Queue (PostgreSQL)           │   │
│  │  pending → processing → sent / failed            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    Worker    │  │   Webhook    │  │    Redis     │  │
│  │  (1s tick)   │  │  NotificaMe  │  │   Cache      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  SERVIÇOS EXTERNOS                      │
│   NotificaMe Hub API  │  IXC  │  Hubsoft  │  SGP        │
│   WhatsApp Business   │  Chatwoot          │  JWT Auth   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Autenticação e Segurança

### JWT
- Tokens com expiração de **12 horas**
- Segredo configurável via variável de ambiente `JWT_SECRET`
- Proteção de rotas via Guards no NestJS
- Rotas públicas: `/api/auth/login`, `/api/webhooks/notificame`

### Variáveis de Ambiente
| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Segredo para assinatura JWT |
| `PORT` | Porta do servidor (default: 3000) |
| `DATABASE_URL` | Connection string PostgreSQL |
| `NODE_ENV` | `production` ou `development` |

---

## 3. Fila de Mensagens (Message Queue)

### Entidade `message_queue`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador único do job |
| `companyId` | varchar | Empresa do disparo |
| `templateId` | varchar | Template a ser enviado |
| `campaignId` | varchar (nullable) | Campanha de origem |
| `batchId` | varchar (nullable) | Lote de origem |
| `payload` | jsonb | `{ number, name, components }` |
| `status` | varchar | `pending / processing / sent / failed` |
| `attempts` | int | Tentativas realizadas (max: 3) |
| `scheduledAt` | timestamp | Quando deve ser processado |
| `processedAt` | timestamp | Quando foi processado |
| `errorMessage` | varchar | Mensagem de erro se falhou |

### Entidade `dispatch_batch`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador do lote |
| `companyId` | varchar | Empresa |
| `campaignId` | varchar (nullable) | Campanha vinculada |
| `templateId` | varchar (nullable) | Template do lote |
| `scope` | varchar | `manual` ou `campaign` |
| `status` | varchar | `queued / processing / completed / partial / failed` |
| `totalRecipients` | int | Total de destinatários |
| `processedRecipients` | int | Processados até o momento |

### Fluxo de Enfileiramento
```
Frontend → POST /api/templates/send
  → MessageQueueService.enqueueBatch()
    → Cria DispatchBatch
    → Insere jobs na message_queue em lotes de 500
  → Retorna { batchId, queued }
```

### Rate Limiting
- **15 mensagens por segundo por empresa**
- Empresas processadas em paralelo e de forma independente
- Locking com `FOR UPDATE SKIP LOCKED` para evitar processamento duplicado

---

## 4. Worker de Processamento

**Arquivo:** `src/message-queue/message-queue.worker.ts`

### Funcionamento
- Roda a cada **1 segundo** via `@Interval(1000)`
- A cada tick, busca empresas com jobs pendentes
- Para cada empresa, reivindica até **15 jobs** (`BATCH_SIZE`)
- Processa todos os jobs da empresa em paralelo (`Promise.all`)

### Payload enviado à NotificaMe
```json
{
  "from": "{canalId_notificameHub}",
  "to": "{número_destinatário}",
  "contents": [{
    "type": "template",
    "template": {
      "name": "{nome_template}",
      "language": { "code": "pt_BR" },
      "components": [...]
    }
  }],
  "message_activity_sharing": true,
  "message_send_ttl_seconds": 3600
}
```

### Componentes suportados
| Tipo | Descrição |
|---|---|
| `BODY` | Parâmetros de texto do corpo |
| `HEADER` (DOCUMENT) | Link para PDF da fatura |
| `BUTTON` (URL) | Link do boleto |
| `BUTTON` (COPY_CODE) | Código PIX / linha digitável |
| `BUTTON` (ORDER_DETAILS) | Pagamento via PIX direto no WhatsApp |

### Cache de Templates
- Templates são cacheados em memória por **60 segundos**
- Evita N+1 queries ao banco por tick

### Tratamento de Erros
- Timeout de **15 segundos** por requisição à NotificaMe
- Máximo de **3 tentativas** por job
- Job re-enfileirado se `attempts < 3`, marcado como `failed` se esgotado

---

## 5. Agendador de Campanhas

**Arquivo:** `src/message-queue/campaign-scheduler.ts`

### Funcionamento
- Cron roda **a cada minuto** (`* * * * *`)
- Verifica campanhas com `status = 'queue'` e `isEnabled = true`
- Compara `dispatchTime` com hora atual no timezone da campanha
- Evita re-disparo verificando `lastDispatchedAt` (não dispara duas vezes no mesmo dia)

### Lógica de Decisão
```
Campanha elegível SE:
  ✓ isEnabled = true
  ✓ status = 'queue'
  ✓ startDate <= hoje <= endDate
  ✓ horário atual == dispatchTime (no timezone da campanha)
  ✓ lastDispatchedAt não é hoje
```

### Após disparo
- `lastDispatchedAt` atualizado para agora
- Se `recurring = true` → `status` permanece `'queue'`
- Se `recurring = false` → `status` muda para `'running'`

---

## 6. Webhook NotificaMe

**Endpoint:** `POST /api/webhooks/notificame`
**Arquivo:** `src/webhooks/notificame.webhook.controller.ts`

### Tipo `MESSAGE_STATUS` — Atualização de entrega
Recebido quando a mensagem muda de status na plataforma.

| Code NotificaMe | Status salvo |
|---|---|
| `QUEUED` | `queued` |
| `SENT` | `sent` |
| `DELIVERED` | `delivered` |
| `READ` | `read` |
| `FAILED` / `UNDELIVERED` | `failed` |
| `ERROR` / `REJECTED` | `error` |

- Busca o relatorio pelo `external_message_id`
- Atualiza `status_sent`
- Se `DELIVERED` ou `READ` → marca `response = true` e `response_at = now`

### Tipo `MESSAGE` — Resposta do cliente
Recebido quando o cliente envia uma mensagem de volta.

- Extrai o número do campo `from` (normaliza para apenas dígitos)
- Busca o **relatorio mais recente** daquele número onde `response = false`
- Marca `response = true` e `response_at = now`

### Payload de exemplo — MESSAGE_STATUS
```json
{
  "type": "MESSAGE_STATUS",
  "subscriptionId": "0c1056d8-4787-43ff-b2f7-432b5590d312",
  "messageId": "99be8b63-3bda-4b98-9465-f0e4cdd5a447",
  "messageStatus": {
    "code": "DELIVERED",
    "description": "The message has been delivered by the provider."
  }
}
```

### Payload de exemplo — MESSAGE
```json
{
  "type": "MESSAGE",
  "from": "553187192020",
  "to": "01a7d646-2441-4e41-9f50-6de03650d537",
  "direction": "IN",
  "channel": "whatsapp_business_account",
  "visitor": { "name": "Marcelo" },
  "contents": [{ "type": "text", "text": "confirmado" }],
  "timestamp": "2026-03-15 09:45:55 pm"
}
```

---

## 7. Cron de Resolução de Relatórios

**Arquivo:** `src/templates/relatory-resolver.cron.ts`

### Objetivo
Marcar automaticamente relatórios como `resolved = true` quando o cliente quita o débito.

### Funcionamento
- Roda a **cada 2 horas** (`0 0 */2 * * *`)
- Filtra relatórios com `resolved = false` e template categoria `Cobrança`
- Agrupa por `number + companyId` para evitar chamadas duplicadas ao ERP
- Consulta o ERP da empresa para verificar faturas pendentes
- Se `list` retornar vazia → cliente quitou → `resolved = true` em todos os relatórios dele

### Tratamento de falhas
- Se o ERP não responder → cliente ignorado naquela rodada
- Volta a tentar na próxima execução (2 horas depois)

### ERPs suportados
| ERP | Identificador | Endpoint |
|---|---|---|
| IXC | `clientId` (numérico) | `POST /webservice/v1/fn_areceber` |
| Hubsoft | `cnpj_cpf` | `GET /api/v1/integracao/cliente/financeiro` |
| SGP | `cnpj_cpf` | `POST /api/ura/titulos` |

---

## 8. Integrações ERP

### IXC
- Autenticação: **Basic Auth** (base64 de `empresa.autorization`)
- Filtros: `liberado = 'S'`, `status = 'A'`, vencimento até +33 dias
- Contrato via: `id_contrato` → `id_contrato_principal` → `id_contrato_avulso`

### Hubsoft
- Autenticação: **OAuth2** com `client_id`, `client_secret`, `username`, `password`
- Parâmetro: `apenas_pendente=sim`

### SGP
- Autenticação: **Basic Auth** (`config.username:config.password`)
- Busca faturas em aberto dos últimos 50 anos até hoje

---

## 9. Templates e Disparo

### Criação de Template
`POST /api/templates/create`
- Cria o template na NotificaMe Hub
- Salva no banco com `meta_id`, `meta_status`, `variables`, `components`

### Disparo Manual
`POST /api/templates/send`

**Fluxo:**
```
Frontend monta componentes (buildTemplateRecipients)
  → POST /api/templates/send { templateId, account, to[] }
    → Valida empresa tem integração NotificaMe ativa
    → MessageQueueService.enqueueBatch()
    → Retorna { batchId, queued }
      → Frontend polling /api/templates/batches/status?batchId=...
```

### Construção de Componentes (Frontend)
**Arquivo:** `frontend/src/mappers/templateRecipient.builder.ts`

O frontend constrói os componentes antes de enviar:
1. **BODY** — parâmetros de texto em ordem numérica das variáveis
2. **HEADER (DOCUMENT)** — PDF do boleto se o template tiver header de documento
3. **BUTTON URL** — link do boleto (`link_boleto_pdf`)
4. **BUTTON COPY_CODE** — código PIX / linha digitável
5. **BUTTON ORDER_DETAILS** — dados completos para pagamento PIX no WhatsApp

### ORDER_DETAILS
Permite pagamento PIX diretamente pelo botão no WhatsApp. Campos:
- `order_reference_id` → número do contrato
- `order_pix_key` → chave PIX
- `order_pix_key_type` → CNPJ / CPF / EMAIL / PHONE
- `order_pix_merchant_name` → nome da empresa
- `valor_fatura` → convertido para centavos

---

## 10. Campanhas

### Entidade `campaigns`
| Campo | Tipo | Descrição |
|---|---|---|
| `name` | varchar | Nome da campanha |
| `startDate` | timestamp | Data de início |
| `endDate` | timestamp | Data de fim |
| `dispatchTime` | varchar | Horário do disparo (`HH:mm`) |
| `timezone` | varchar | Timezone (ex: `America/Sao_Paulo`) |
| `recurring` | boolean | Repete diariamente |
| `status` | varchar | `pending / queue / running / finished` |
| `isEnabled` | boolean | Campanha ativa |
| `lastDispatchedAt` | timestamp | Último disparo |
| `templateMapVars` | jsonb | Lista de destinatários com variáveis |

### Status da Campanha
```
pending → queue (ao ativar)
queue → running (após primeiro disparo, se não recorrente)
queue → queue (após disparo, se recorrente)
running / queue → finished (ao encerrar manualmente ou endDate)
```

---

## 11. Entidades do Banco de Dados

### `relatory_dispatch_template`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `external_message_id` | varchar (nullable) | ID retornado pela NotificaMe |
| `name` | varchar | Nome do destinatário |
| `number` | varchar | WhatsApp do destinatário |
| `date_dispatch` | timestamp | Data/hora do disparo |
| `status_sent` | varchar | `queued / sent / delivered / read / failed / error` |
| `message` | text | Texto da mensagem enviada |
| `response` | boolean | Cliente respondeu? |
| `response_at` | timestamp | Quando respondeu |
| `resolved` | boolean | Débito quitado? (default: false) |
| `components_maped` | jsonb | Parâmetros mapeados |
| `batchId` | varchar (nullable) | ID do lote |
| `templateId` | FK | Template usado |
| `companyId` | FK | Empresa |
| `campaignId` | FK (nullable) | Campanha de origem |

### Ciclo de vida de um relatorio
```
Disparo → status_sent: queued, response: false, resolved: false
  → DELIVERED/READ → response: true, response_at: now
  → Cliente responde (MESSAGE) → response: true, response_at: now
  → Cliente paga (Cron ERP) → resolved: true
```

---

## 12. API — Endpoints

### Templates
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/templates` | Listar templates paginado |
| `POST` | `/api/templates/send` | Disparar template |
| `POST` | `/api/templates/create` | Criar template na NotificaMe |
| `GET` | `/api/templates/batches/status` | Status de um lote |
| `GET` | `/api/templates/relatory` | Relatórios de disparo |
| `PATCH` | `/api/templates/disable/:id` | Desativar template |

### Campanhas
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/campaigns` | Listar campanhas |
| `POST` | `/api/campaigns` | Criar campanha |
| `PATCH` | `/api/campaigns/:id` | Atualizar campanha |
| `DELETE` | `/api/campaigns/:id` | Excluir campanha |

### Clientes
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/clients` | Listar clientes |
| `POST` | `/api/clients` | Criar/atualizar clientes |

### Faturas
| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/invoices` | Buscar faturas por CPF/CNPJ |
| `POST` | `/api/invoices/overdue` | Faturas em atraso |

### Webhooks
| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/webhooks/notificame` | Receber eventos NotificaMe |

### Auth
| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/login` | Login e geração de JWT |

### Documentação
| Rota | Descrição |
|---|---|
| `/api/docs` | Swagger UI |

---

## 13. Frontend

### Páginas
| Página | Descrição |
|---|---|
| Login | Autenticação com JWT |
| Disparo | Seleção de template, clientes/leads, preview e envio |
| Campanhas | Criação, listagem e gerenciamento de campanhas |
| Histórico | Relatórios de disparo com filtros |
| Dashboard | Métricas de cobrança |
| Chatwoot | Integração com atendimento |

### Contextos (Context API)
| Contexto | Responsabilidade |
|---|---|
| `DispatchTemplateContext` | Estado de disparo, batchId ativo, polling de status |
| `CampaignsContext` | CRUD de campanhas |
| `ClientsContext` | Lista de clientes e busca de faturas |
| `TemplatesContext` | Lista de templates com filtros |
| `HistoricoContext` | Relatórios de disparo |

### Polling de Status do Lote
- Hook `useBatchStatusQuery` consulta `/api/templates/batches/status` a cada **1 segundo**
- Para automaticamente quando status for `completed`, `partial` ou `failed`
- Exibe progresso em tempo real: `processedRecipients / totalRecipients`

### Storage Local (AppStorage)
| Chave | Descrição |
|---|---|
| `attendant_name` | Nome do atendente para variável `nome_atendente` |
| `dispatch_company_name` | Nome da empresa para variável `nome_empresa` |
| `agent_name` | Nome do agente Chatwoot |
| `account` | ID da conta Chatwoot |

---

## 14. Infraestrutura

### Redis
- Usado para cache e controle de sessão
- Integração via `RedisService`

### WebSocket (Socket.io)
- `CampaignMetricsGateway` — emite métricas de campanha em tempo real

### Docker
- Backend e Frontend containerizados
- Variáveis de ambiente via `.env`

### Banco de Dados
- **PostgreSQL**
- TypeORM com `synchronize: true` (auto-migração em dev)
- Colunas `nullable string` declaradas com `type: 'varchar'` explícito para evitar `DataTypeNotSupportedError`

### Timezone
- Queries de fila usam `NOW() AT TIME ZONE 'UTC'` para evitar bug de comparação quando PostgreSQL está em `America/Sao_Paulo`

---

*Relatório gerado em Março de 2026 — Sistema Coraxy Cobrança*
