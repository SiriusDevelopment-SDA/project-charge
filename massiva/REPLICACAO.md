# Replicar o Modo Massiva para todas as empresas

Cada empresa tem o seu **n8n** (fluxo parecido, mas adaptado). Por isso **não**
exporte/importe o fluxo inteiro — isso apagaria as adaptações. Aplique só as
mudanças abaixo, empresa por empresa.

## O que é compartilhado × o que é por empresa

| Camada | Escopo | Ação |
|---|---|---|
| **Banco** (tabelas `massiva_catalogo`, `massiva_historico`, coluna `areas`) | **Compartilhado** — todas as empresas no mesmo banco, separadas por `account` | Migrations **1× só** ⚠️ |
| **Fluxo n8n** (webhooks, nós, queries) | **Por empresa** | Copiar nós + 2 ajustes |
| **HTML** (a interface) | **Por empresa** (vive no nó HTML) | Colar o arquivo novo |
| **URLs dos webhooks** | — | **Nada** — são relativas (mesma origem) |

> ⚠️ Se alguma empresa usar um **banco diferente** (não o compartilhado), rode as
> migrations nesse banco também. Confirme antes.

## Método rápido: copiar nós entre n8n (Ctrl+C / Ctrl+V)
No n8n dá pra **selecionar nós** num workflow, **Ctrl+C**, e **Ctrl+V** em outro.
Abra o fluxo que já funciona (uplink) e o da empresa-alvo, e copie os ramos novos.
Depois de colar, **re-selecione a credencial** dos nós Postgres (credenciais NÃO
viajam no copy/paste — cada n8n tem a sua) e **ative** o workflow.

---

## Checklist por empresa

### 1. Banco (só se a empresa usar um banco próprio; se for o compartilhado, pule)
- [ ] `massiva_catalogo` criada (ver `queries/catalogo.sql`)
- [ ] `massiva_catalogo`: colunas `deletado_por`, `deletado_em`
- [ ] `massiva_historico`: coluna `areas JSONB` (e `operador_token/mensagem/regiao/desativado_em/duracao_segundos`)

### 2. HTML (nó HTML do fluxo)
- [ ] Colar o `modo-massiva.html` novo **inteiro** — OU, se usar a versão repartida:
  - [ ] `dist/massiva.html` no nó HTML
  - [ ] webhook `massiva-css` com header `Content-Type: text/css; charset=utf-8`
  - [ ] webhook `massiva-js` com header `Content-Type: application/javascript; charset=utf-8`

### 3. Catálogo (copiar os 3 ramos)
- [ ] `massiva-catalogo` (GET) → SELECT com **`AND deletado_em IS NULL`**
- [ ] `massiva-catalogo-criar` (POST) → INSERT
- [ ] `massiva-catalogo-excluir` (POST) → soft delete recursivo (cascata)
- [ ] Query params conforme `queries/catalogo.sql`

### 4. Ativação → histórico (2 ajustes MANUAIS em nós que já existem)
- [ ] Nó **`dados histórico`** (insert): adicionar a coluna **`areas`** →
      `{{ JSON.stringify($('Webhook1').item.json.body.areas) }}`
- [ ] Nó **`If`**: condição **`{{ $('Webhook1').item.json.body.status }}`** → *is true*
      ⚠️ **A pegadinha:** se usar `{{ $json.body.status }}` e houver nós antes do If,
      cai sempre no FALSE e não grava. Referencie o webhook explicitamente.
- [ ] Nó **`Fechar Histórico`**: UPDATE que fecha a linha aberta (ver `queries/ativacao.sql`)

### 5. Leitura do histórico
- [ ] `massiva-historico` (GET) → query (json_agg **ou** SELECT) + Respond adequado
      (`First Incoming Item` para json_agg; `All Incoming Items` para SELECT de linhas)

### 6. Finalizar
- [ ] Re-selecionar **credenciais** Postgres nos nós colados
- [ ] **Ativar** o workflow
- [ ] Testar: cadastrar cidade → salvar modelo → **Ativar** → ver **Histórico** → **Desativar** (duração aparece)

---

## Prompt da IA
Se a IA que casa o cliente com a área é um **nó dentro do fluxo**, ele vai junto
quando você copia esse ramo. O que mudou pra ela foi o payload do disparo, que
agora traz o objeto **`areas`** estruturado (cidade → bairro → rua) além do texto
`regiao`. Se o prompt lê a região, vale apontá-lo para `areas` (estruturado) para
casar o cliente com mais precisão. Estrutura do `areas` em `queries/ativacao.sql`.
