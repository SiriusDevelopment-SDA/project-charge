# Modo Massiva — Central de Comunicados

Interface do **Modo Massiva**: app embedado no Maestro que dispara comunicados
em massa para clientes de determinadas regiões. A página é um HTML único
servido de dentro de um fluxo do **N8N** (os placeholders `{{ $('Uplink')... }}`
são preenchidos pelo N8N ao gerar a página). Os dados de ativação caem na
tabela `public.massiva_historico` (base `n8n_utils`).

Este diretório versiona esse HTML e o contrato de dados que o acompanha.

## Arquivos

| Arquivo | O que é |
|---|---|
| `modo-massiva.html` | A interface. É este arquivo que vai no nó HTML do fluxo do N8N. |
| `schema.sql` | Tabelas de persistência (base `n8n_utils`, schema `public`). |
| `README.md` | Este documento: arquitetura, contrato dos endpoints e roadmap. |

## Como testar sem o N8N (modo teste)

Abra `modo-massiva.html` direto no navegador (duplo clique). Como os
placeholders `{{ ... }}` do N8N não são substituídos, a página entra em
**modo teste**:

- Conta assumida: `demo` (aparece "modo teste" no rodapé).
- Alguns **modelos de exemplo** já vêm carregados.
- Ativar/Desativar **não chama o webhook** — apenas simula sucesso, pra você
  testar toda a UX (aplicar modelo, adicionar, excluir, cronômetro, etc.).

Os dados do modo teste ficam no `localStorage` do próprio navegador.

## Arquitetura de dados (mock-first)

Toda leitura/escrita de dados novos passa pelo objeto **`Store`** dentro do
HTML. Hoje ele guarda em `localStorage` por conta. Para plugar o backend real,
troque o corpo de cada método por um `fetch` nos webhooks abaixo — **a UI não
muda**. Os métodos já são assíncronos de propósito.

### Escopo por empresa

Tudo é separado por empresa através do campo **`account`** (mesmo
`query.account` que o N8N injeta). Cada conta tem seus próprios modelos (e, na
Fase 2, seu próprio catálogo de cidade/bairro/rua).

---

## Contrato dos endpoints

### Já existentes (mantidos, sem alteração de contrato)

**`POST /webhook/massiva`** — ativa/desativa a transmissão.

```json
{
  "texto": "<mensagem> áreas afetadas: <regioes>",
  "account": "15",
  "status": true,
  "token": "<operador_token>",
  "mensagem": "<mensagem>",
  "regiao": "<regioes>"
}
```

**`GET /webhook/massiva-historico?account=&token=`** — lista o histórico.
Retorna um array de objetos com: `ativado_em`, `desativado_em`,
`duracao_segundos`, `mensagem`, `regiao`, `operador_nome`, `operador_token`.

### Fase 1 — Modelos de mensagem (a implementar no N8N)

Sugestão de webhook único `/webhook/massiva-modelos` roteando por método:

**`GET /webhook/massiva-modelos?account=&token=`**
Retorna array de modelos da conta:
```json
[
  { "id": 12, "texto": "Prezado cliente, ...", "criado_por": "<token>" }
]
```

**`POST /webhook/massiva-modelos`** — cria um modelo.
```json
{ "account": "15", "token": "<operador_token>", "texto": "novo modelo..." }
```
Resposta: o modelo criado (`{ "id": ..., "texto": ..., "criado_por": ... }`).

**`DELETE /webhook/massiva-modelos`** (ou `POST` com `acao: "excluir"`) — remove.
```json
{ "account": "15", "token": "<operador_token>", "id": 12 }
```

> Ponto de troca no HTML: os três métodos `Store.listarModelos`,
> `Store.adicionarModelo` e `Store.removerModelo`. Só eles mudam.

---

## Roadmap

- [x] **Fase 1 — Mensagens padrão por empresa.** Aplicar, adicionar e excluir
  modelos. Mock-first (localStorage) + contrato de endpoints acima.
- [ ] **Fase 2 — Localização hierárquica.** Cidade (obrigatório) → bairro
  (obrigatório) → rua (opcional). Cadastro em cada nível, cascata
  (bairros por cidade, ruas por bairro), botão "Todos" por nível. Substitui o
  texto livre de "Regiões afetadas" por seleção estruturada; envia um payload
  estruturado no disparo, para a IA casar melhor o cliente com a área.
- [ ] **Fase 3 — Edição ao vivo.** Desmarcar áreas com a massiva no ar, sem
  precisar desativar e reativar.
- [ ] **Fase 4 (opcional) — Semear catálogo** a partir dos endereços reais dos
  clientes (ERP/IXC).

## Observações levantadas nos dados atuais (`massiva_historico`)

- `operador_token` às vezes grava a string `undefined` — acontece quando
  `query.token` chega vazio na URL que gera a página. Vale conferir, no fluxo
  do N8N, se o token está sendo propagado para todas as contas.
- `mensagem` ora guarda só o comunicado, ora o texto já concatenado com
  "áreas afetadas: ...". A partir da Fase 2 o dado passa a ser estruturado, o
  que remove essa ambiguidade.
