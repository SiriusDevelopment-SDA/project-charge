/* ============================================================================
 * Modo Massiva — Central de Comunicados
 * ----------------------------------------------------------------------------
 * FASE 1: Mensagens padrão (modelos) por empresa.
 *
 * Arquitetura de dados (mock-first):
 *   Toda leitura/escrita passa pelo objeto `Store` (ver abaixo). Hoje ele
 *   guarda em localStorage por conta; para plugar o backend real do N8N,
 *   basta trocar o corpo de cada método por um fetch nos webhooks descritos
 *   em massiva/README.md — a UI não muda.
 *
 * Modo teste (dev): se os placeholders do N8N não forem
 *   substituídos (ex.: abrindo o arquivo direto no navegador), a página cai
 *   em modo teste com conta "demo" e alguns modelos de exemplo, pra você ver
 *   e testar a UX sem depender do N8N.
 * ========================================================================== */

const button = document.getElementById("button");
const status = document.getElementById("status");
const buttonLabel = document.getElementById("buttonLabel");
const seloTexto = document.getElementById("seloTexto");
const statusGrande = document.getElementById("statusGrande");
const statusDesc = document.getElementById("statusDesc");
const campoMensagem = document.getElementById("textoEnviar");
let regiaoTextoAtual = "";
let regiaoAreasAtual = null;
let catalogo = { cidades: [], bairros: [], ruas: [] };
const contador = document.getElementById("contador");
const previaTexto = document.getElementById("previaTexto");
const tempoAtivacao = document.getElementById("tempoAtivacao");
const tempoFallback = document.getElementById("tempoFallback");
const horaAtivacao = document.getElementById("horaAtivacao");
const cronometro = document.getElementById("cronometro");
const historicoFundo = document.getElementById("historicoFundo");
const historicoLista = document.getElementById("historicoLista");
const historicoConta = document.getElementById("historicoConta");
const modelosWrap = document.getElementById("modelosWrap");
const modelosTrigger = document.getElementById("modelosTrigger");
const modelosTriggerTexto = document.getElementById("modelosTriggerTexto");
const modelosContagem = document.getElementById("modelosContagem");
const modelosMenu = document.getElementById("modelosMenu");
const modelosMenuLista = document.getElementById("modelosMenuLista");
const modelosSalvar = document.getElementById("modelosSalvar");
const modelosAviso = document.getElementById("modelosAviso");

// Base dos webhooks: derivada da PRÓPRIA origem da página.
// Cada empresa tem o seu n8n rodando o mesmo fluxo (uplink, toplink, ...) e é
// esse mesmo n8n que serve esta página. Então, em vez de fixar um host, usamos
// a origem atual — assim o mesmo HTML funciona em qualquer instância, sempre
// falando com o n8n da própria empresa (mesma origem = sem CORS, conta certa).
// Em modo teste (arquivo aberto no navegador) cai no fallback e nada é chamado.
const WEBHOOK_BASE = (function () {
  try {
    var o = window.location && window.location.origin;
    if (o && o.indexOf("http") === 0) return o;
  } catch (e) {}
  return "https://uplink.webhooks.coraxy.com.br";
})();
const MASSIVA_URL = WEBHOOK_BASE + "/webhook/massiva";
const HISTORICO_URL = WEBHOOK_BASE + "/webhook/massiva-historico";
const CATALOGO_URL = WEBHOOK_BASE + "/webhook/massiva-catalogo";
const CATALOGO_CRIAR_URL = WEBHOOK_BASE + "/webhook/massiva-catalogo-criar";
const CATALOGO_EXCLUIR_URL = WEBHOOK_BASE + "/webhook/massiva-catalogo-excluir";

/* ---------- Detecção de placeholder do N8N / modo teste ---------- */
function ehPlaceholder(v) {
  if (!v) return true;
  var chaveAbre = "{" + "{";
  var chaveFecha = "}" + "}";
  return v.indexOf(chaveAbre) !== -1 || v.indexOf(chaveFecha) !== -1 ||
         v.indexOf("$json") !== -1 || v.indexOf("$(") !== -1;
}

const accountBruto = document.getElementById("account").textContent.trim();
const tokenBruto = document.getElementById("token").textContent.trim();
const statusBancoBruto = document.getElementById("statusBanco").textContent.trim();

const MODO_DEV = ehPlaceholder(accountBruto);
const account_id = MODO_DEV ? "demo" : accountBruto;
const token_id = ehPlaceholder(tokenBruto) ? (MODO_DEV ? "demo-token" : "") : tokenBruto;
const statusBancoText = ehPlaceholder(statusBancoBruto) ? "false" : statusBancoBruto.toLowerCase();

// Converte string "true"/"false" em booleano
let ativado = statusBancoText === "true";

/* ============================================================================
 * Store — camada de dados
 * ----------------------------------------------------------------------------
 * PRODUÇÃO: grava no banco via 3 webhooks do N8N (ler / criar / excluir),
 *   sobre a tabela única public.massiva_catalogo (tipo = modelo|cidade|bairro|rua).
 * MODO TESTE (arquivo aberto no navegador): usa localStorage, com dados de
 *   exemplo, pra continuar testável sem depender do N8N.
 * A UI não sabe a diferença — só chama estes métodos.
 * ========================================================================== */
const Store = {
  _cache: null,
  _invalidar() { this._cache = null; },

  // Carrega tudo de uma vez (modelos + catálogo). Memoriza até uma escrita.
  async carregarTudo(account) {
    if (this._cache) return this._cache;
    this._cache = MODO_DEV ? this._carregarLocal(account) : await this._carregarRemoto(account);
    return this._cache;
  },

  // ---- API pública (mesmas assinaturas de antes) ----
  async adicionarModelo(account, texto, token) { return this._criar(account, "modelo", { texto }); },
  async removerModelo(account, id) { return this._excluir(account, id); },
  async adicionarCidade(account, nome, token) { return this._criar(account, "cidade", { nome }); },
  async removerCidade(account, id) { return this._excluir(account, id); },
  async adicionarBairro(account, nome, cidadeId, token) { return this._criar(account, "bairro", { nome, pai_id: cidadeId }); },
  async removerBairro(account, id) { return this._excluir(account, id); },
  async adicionarRua(account, nome, bairroId, token) { return this._criar(account, "rua", { nome, pai_id: bairroId }); },
  async removerRua(account, id) { return this._excluir(account, id); },

  // ---- Núcleo (decide entre banco e localStorage) ----
  async _criar(account, tipo, campos) {
    this._invalidar();
    if (MODO_DEV) return this._criarLocal(account, tipo, campos);
    const r = await fetch(CATALOGO_CRIAR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: account, token: token_id, tipo: tipo,
        nome: campos.nome || null, texto: campos.texto || null, pai_id: campos.pai_id || null,
      }),
    });
    if (!r.ok) throw new Error("falha ao salvar");
    const resp = await r.json().catch(() => null);
    const row = this._primeiraLinha(resp);
    return this._normalizarItem(tipo, row, campos);
  },

  async _excluir(account, id) {
    this._invalidar();
    if (MODO_DEV) return this._excluirLocal(account, id);
    const r = await fetch(CATALOGO_EXCLUIR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: account, token: token_id, id: id }),
    });
    if (!r.ok) throw new Error("falha ao excluir");
    return true;
  },

  // ---- Produção: leitura remota ----
  async _carregarRemoto(account) {
    const url = CATALOGO_URL + "?account=" + encodeURIComponent(account) + "&token=" + encodeURIComponent(token_id);
    const r = await fetch(url);
    if (!r.ok) throw new Error("falha ao carregar catálogo");
    const resp = await r.json().catch(() => null);
    return this._separar(this._linhas(resp));
  },

  // Aceita vários formatos que o N8N pode devolver.
  _linhas(resp) {
    if (!resp) return [];
    if (Array.isArray(resp)) {
      if (resp.length && resp[0] && Array.isArray(resp[0].dados)) return resp[0].dados;
      return resp;
    }
    if (Array.isArray(resp.dados)) return resp.dados;
    if (Array.isArray(resp.data)) return resp.data;
    if (resp.json) return this._linhas(resp.json);
    return [];
  },

  _primeiraLinha(resp) {
    if (!resp) return null;
    if (Array.isArray(resp)) return resp[0] || null;
    if (resp.dados && Array.isArray(resp.dados)) return resp.dados[0] || null;
    if (resp.json) return this._primeiraLinha(resp.json);
    return resp;
  },

  _separar(rows) {
    const L = (rows || []).map((r) => ({
      id: String(r.id),
      tipo: r.tipo,
      nome: r.nome,
      texto: r.texto,
      pai: (r.pai_id === null || r.pai_id === undefined) ? null : String(r.pai_id),
    }));
    return {
      modelos: L.filter((r) => r.tipo === "modelo").map((r) => ({ id: r.id, texto: r.texto })),
      cidades: L.filter((r) => r.tipo === "cidade").map((r) => ({ id: r.id, nome: r.nome })),
      bairros: L.filter((r) => r.tipo === "bairro").map((r) => ({ id: r.id, nome: r.nome, cidadeId: r.pai })),
      ruas: L.filter((r) => r.tipo === "rua").map((r) => ({ id: r.id, nome: r.nome, bairroId: r.pai })),
    };
  },

  _normalizarItem(tipo, row, campos) {
    row = row || {};
    const id = String(row.id != null ? row.id : this._novoId(tipo));
    if (tipo === "modelo") return { id: id, texto: row.texto != null ? row.texto : campos.texto };
    if (tipo === "cidade") return { id: id, nome: row.nome != null ? row.nome : campos.nome };
    const paiId = String(row.pai_id != null ? row.pai_id : campos.pai_id);
    if (tipo === "bairro") return { id: id, nome: row.nome != null ? row.nome : campos.nome, cidadeId: paiId };
    return { id: id, nome: row.nome != null ? row.nome : campos.nome, bairroId: paiId };
  },

  // ---- Modo teste: localStorage ----
  _chave(tipoPlural, account) { return "massiva_" + tipoPlural + "_" + account; },
  _plural(tipo) { return { modelo: "modelos", cidade: "cidades", bairro: "bairros", rua: "ruas" }[tipo]; },
  _ler(tipoPlural, account) {
    try {
      const bruto = localStorage.getItem(this._chave(tipoPlural, account));
      const lista = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  },
  _salvar(tipoPlural, account, lista) {
    try { localStorage.setItem(this._chave(tipoPlural, account), JSON.stringify(lista)); } catch (e) { /* sem localStorage */ }
  },
  _novoId(prefixo) { return prefixo + "_" + Date.now() + "_" + Math.floor(Math.random() * 10000); },
  _pai(x) { return x.cidadeId != null ? x.cidadeId : (x.bairroId != null ? x.bairroId : x.pai_id); },

  _carregarLocal(account) {
    this._semearSePreciso(account);
    return {
      modelos: this._ler("modelos", account).map((m) => ({ id: String(m.id), texto: m.texto })),
      cidades: this._ler("cidades", account).map((c) => ({ id: String(c.id), nome: c.nome })),
      bairros: this._ler("bairros", account).map((b) => ({ id: String(b.id), nome: b.nome, cidadeId: String(this._pai(b)) })),
      ruas: this._ler("ruas", account).map((r) => ({ id: String(r.id), nome: r.nome, bairroId: String(this._pai(r)) })),
    };
  },

  _criarLocal(account, tipo, campos) {
    const plural = this._plural(tipo);
    const lista = this._ler(plural, account);
    const id = this._novoId(tipo);
    let item;
    if (tipo === "modelo") item = { id: id, texto: campos.texto };
    else if (tipo === "cidade") item = { id: id, nome: campos.nome };
    else if (tipo === "bairro") item = { id: id, nome: campos.nome, cidadeId: campos.pai_id };
    else item = { id: id, nome: campos.nome, bairroId: campos.pai_id };
    lista.push(item);
    this._salvar(plural, account, lista);
    return this._normalizarItem(tipo, { id: id, nome: campos.nome, texto: campos.texto, pai_id: campos.pai_id }, campos);
  },

  // Exclusão com cascata (cidade -> bairros -> ruas), funciona pra qualquer tipo.
  _excluirLocal(account, id) {
    id = String(id);
    this._salvar("modelos", account, this._ler("modelos", account).filter((m) => String(m.id) !== id));
    const bairros = this._ler("bairros", account);
    const bairrosDaCidade = bairros.filter((b) => String(this._pai(b)) === id).map((b) => String(b.id));
    const alvos = new Set([id].concat(bairrosDaCidade));
    this._salvar("ruas", account, this._ler("ruas", account).filter((r) => String(r.id) !== id && !alvos.has(String(this._pai(r)))));
    this._salvar("bairros", account, bairros.filter((b) => String(b.id) !== id && String(this._pai(b)) !== id));
    this._salvar("cidades", account, this._ler("cidades", account).filter((c) => String(c.id) !== id));
    return true;
  },

  _semearSePreciso(account) {
    if (localStorage.getItem(this._chave("modelos", account)) !== null) return;
    this._salvar("modelos", account, [
      { id: "seed_0", texto: "Prezado cliente, informamos que há uma instabilidade geral no serviço de internet na sua região. Nossa equipe técnica já está atuando para normalizar o quanto antes. Agradecemos a compreensão." },
      { id: "seed_1", texto: "Estamos com uma manutenção emergencial na rede da sua localidade. A previsão de normalização é até às 13h. Pedimos desculpas pelo transtorno." },
      { id: "seed_2", texto: "Identificamos uma falha no fornecimento de energia elétrica que afeta a sua região e, consequentemente, o serviço de internet. Assim que a energia for restabelecida, o sinal volta ao normal." },
    ]);
    this._salvar("cidades", account, [
      { id: "cid_sp", nome: "São Paulo" }, { id: "cid_rj", nome: "Rio de Janeiro" },
    ]);
    this._salvar("bairros", account, [
      { id: "bai_centro_sp", nome: "Centro", cidadeId: "cid_sp" },
      { id: "bai_pinheiros", nome: "Pinheiros", cidadeId: "cid_sp" },
      { id: "bai_copacabana", nome: "Copacabana", cidadeId: "cid_rj" },
      { id: "bai_tijuca", nome: "Tijuca", cidadeId: "cid_rj" },
    ]);
    this._salvar("ruas", account, [
      { id: "rua_augusta", nome: "Rua Augusta", bairroId: "bai_centro_sp" },
      { id: "rua_consolacao", nome: "Rua da Consolação", bairroId: "bai_centro_sp" },
      { id: "rua_fradique", nome: "Rua Fradique Coutinho", bairroId: "bai_pinheiros" },
      { id: "rua_nsc", nome: "Av. N. S. de Copacabana", bairroId: "bai_copacabana" },
    ]);
  },

  // Compatibilidade: os seeds agora rodam dentro de carregarTudo (modo teste).
  semearExemplosSePreciso() {},
  semearCatalogoSePreciso() {},
};

/* ---------- Registro do horário de ativação (apenas visual, salvo no navegador) ---------- */
const CHAVE_ATIVACAO = "massiva_ativada_em_" + account_id;
let inicioAtivacao = null;

function lerAtivacao() {
  try {
    const valor = localStorage.getItem(CHAVE_ATIVACAO);
    const numero = valor ? parseInt(valor, 10) : NaN;
    return isNaN(numero) ? null : numero;
  } catch (e) {
    return null;
  }
}

function salvarAtivacao() {
  try {
    localStorage.setItem(CHAVE_ATIVACAO, String(Date.now()));
  } catch (e) { /* sem localStorage, segue sem o horário */ }
}

function limparAtivacao() {
  try {
    localStorage.removeItem(CHAVE_ATIVACAO);
  } catch (e) { /* sem localStorage, nada a limpar */ }
}

function formatarDuracao(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const p = (n) => String(n).padStart(2, "0");
  return dias > 0
    ? `${dias}d ${p(horas)}:${p(minutos)}:${p(segundos)}`
    : `${p(horas)}:${p(minutos)}:${p(segundos)}`;
}

function formatarDuracaoCurta(segundosTotais) {
  if (segundosTotais == null) return "em aberto";
  const dias = Math.floor(segundosTotais / 86400);
  const horas = Math.floor((segundosTotais % 86400) / 3600);
  const minutos = Math.floor((segundosTotais % 3600) / 60);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

function atualizarCronometro() {
  if (ativado && inicioAtivacao) {
    cronometro.textContent = formatarDuracao(Date.now() - inicioAtivacao);
  }
}

function atualizarTempoAtivacao() {
  inicioAtivacao = ativado ? lerAtivacao() : null;

  if (!ativado) {
    tempoAtivacao.style.display = "none";
    tempoFallback.style.display = "none";
    return;
  }

  if (inicioAtivacao) {
    const data = new Date(inicioAtivacao);
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const mesmoDia = data.toDateString() === new Date().toDateString();
    horaAtivacao.textContent = mesmoDia
      ? hora
      : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " · " + hora;
    atualizarCronometro();
    tempoAtivacao.style.display = "grid";
    tempoFallback.style.display = "none";
  } else {
    tempoAtivacao.style.display = "none";
    tempoFallback.style.display = "block";
  }
}

/* ---------- Interface ---------- */
function atualizarInterface() {
  buttonLabel.textContent = ativado ? "Desativar" : "Ativar";
  button.classList.toggle("encerrar", ativado);
  document.body.classList.toggle("ativo", ativado);
  seloTexto.textContent = ativado ? "No ar" : "Em espera";
  statusGrande.textContent = ativado ? "No ar" : "Em espera";
  statusDesc.textContent = ativado
    ? "O comunicado está sendo transmitido para os clientes das regiões informadas."
    : "Nenhum comunicado em transmissão no momento.";
  atualizarTempoAtivacao();
  status.textContent = "";
  status.style.color = "";
}

function atualizarRelogio() {
  const agora = new Date();
  document.getElementById("relogio").textContent = agora.toLocaleTimeString("pt-BR");
  document.getElementById("dataHoje").textContent = agora.toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  });
}

function tique() {
  atualizarRelogio();
  atualizarCronometro();
}
setInterval(tique, 1000);
tique();

function atualizarPrevia() {
  const qtd = campoMensagem.value.length;
  contador.textContent = qtd === 1 ? "1 caractere" : `${qtd} caracteres`;

  const msg = campoMensagem.value;
  const temMsg = !!msg.trim();
  const temRegiao = !!(regiaoAreasAtual && regiaoAreasAtual.cidades && regiaoAreasAtual.cidades.length);

  if (!temMsg && !temRegiao) {
    previaTexto.textContent = "Escreva a mensagem e selecione as regiões para ver aqui o que será enviado.";
    previaTexto.classList.add("vazia");
  } else {
    let html = "";
    if (temMsg) html += '<div class="previa-msg">' + escapeHtml(msg) + '</div>';
    if (temRegiao) html += regiaoParaHtml(regiaoAreasAtual);
    previaTexto.innerHTML = html;
    previaTexto.classList.remove("vazia");
  }
  marcarModeloAtivo();
}
campoMensagem.addEventListener("input", atualizarPrevia);

// Prévia da região: um bloco por cidade (cidade em destaque, ruas realçadas).
// Com várias cidades, mostra só a 1ª como exemplo e revela o resto no hover.
function previaCidadeHtml(c) {
  let dentro = "";
  if (c.bairros.length) {
    dentro = '<div class="previa-bairros">' + c.bairros.map((b) => {
      const ruas = b.ruas.length
        ? ' <span class="previa-ruas">' + escapeHtml(b.ruas.join(", ")) + '</span>'
        : "";
      return '<span class="previa-bairro">' + escapeHtml(b.nome) + ruas + '</span>';
    }).join("") + '</div>';
  }
  return '<div class="previa-cidade"><span class="previa-cid">' + escapeHtml(c.nome) + '</span>' + dentro + '</div>';
}

function regiaoParaHtml(areas) {
  const rot = '<span class="previa-areas-rot">Áreas afetadas</span>';
  const semDetalhe = areas.cidades.every((c) => !c.bairros.length);

  if (areas.todasCidades && semDetalhe) {
    return '<div class="previa-areas">' + rot +
      '<div class="previa-cidade"><span class="previa-cid">Todas as cidades</span></div></div>';
  }

  // Uma cidade só: cabe inteira, mostra inline.
  if (areas.cidades.length <= 1) {
    return '<div class="previa-areas">' + rot + areas.cidades.map(previaCidadeHtml).join("") + '</div>';
  }

  // Várias: resumo (1 exemplo) + detalhe completo no hover.
  const extras = areas.cidades.length - 1;
  const resumo = '<div class="previa-resumo">' + previaCidadeHtml(areas.cidades[0]) +
    '<div class="previa-mais">+ ' + extras + (extras === 1 ? ' outra região' : ' outras regiões') +
    ' <span class="previa-mais-dica">· passe o mouse para ver todas</span></div></div>';
  const completo = '<div class="previa-full">' + areas.cidades.map(previaCidadeHtml).join("") + '</div>';
  return '<div class="previa-areas">' + rot + resumo + completo + '</div>';
}

// Toque/clique também expande o detalhe (fallback sem mouse)
previaTexto.addEventListener("click", (e) => {
  const areas = e.target.closest(".previa-areas");
  if (areas && areas.querySelector(".previa-full")) areas.classList.toggle("aberto");
});

if (account_id) {
  const rotulo = MODO_DEV ? `Conta: ${account_id} · modo teste` : `Conta: ${account_id}`;
  document.getElementById("contaInfo").textContent = rotulo;
  historicoConta.textContent = `Conta ${account_id}`;
}

if (!ativado) {
  limparAtivacao();
}

atualizarInterface();

/* ============================================================================
 * Modelos de mensagem (Fase 1)
 * ========================================================================== */
let modelosCache = [];
let menuAberto = false;

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

function resumir(texto, max) {
  const limpo = (texto || "").replace(/\s+/g, " ").trim();
  return limpo.length > max ? limpo.slice(0, max - 1).trimEnd() + "…" : limpo;
}

function marcarModeloAtivo() {
  const atual = campoMensagem.value.trim();
  modelosMenuLista.querySelectorAll(".modelo-item").forEach((item) => {
    const texto = (item.dataset.texto || "").trim();
    item.classList.toggle("ativa", texto !== "" && texto === atual);
  });
}

function atualizarGatilhoModelos() {
  const n = modelosCache.length;
  modelosTrigger.disabled = n === 0;
  modelosTriggerTexto.textContent = n === 0 ? "Nenhum modelo salvo ainda" : "Escolher um modelo";
  modelosContagem.textContent = n > 0 ? String(n) : "";
  if (n === 0 && menuAberto) fecharMenuModelos();
}

function renderizarModelos() {
  if (!modelosCache.length) {
    modelosMenuLista.innerHTML = `<div class="modelos-menu-vazio">Nenhum modelo salvo ainda.<br>Escreva uma mensagem e clique em “Salvar como modelo”.</div>`;
  } else {
    modelosMenuLista.innerHTML = modelosCache.map((m) => `
      <div class="modelo-item" role="option" tabindex="0" data-id="${escapeHtml(m.id)}" data-texto="${escapeHtml(m.texto)}">
        <span class="modelo-item-texto">${escapeHtml(m.texto)}</span>
        <button type="button" class="modelo-item-lixo" data-acao="excluir" aria-label="Excluir modelo" title="Excluir modelo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
            <path d="M3 6h18"/>
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    `).join("");
  }
  atualizarGatilhoModelos();
  marcarModeloAtivo();
}

function abrirMenuModelos() {
  if (!modelosCache.length) return;
  modelosMenu.hidden = false;
  modelosWrap.classList.add("aberto");
  modelosTrigger.setAttribute("aria-expanded", "true");
  menuAberto = true;
  marcarModeloAtivo();
}

function fecharMenuModelos() {
  modelosMenu.hidden = true;
  modelosWrap.classList.remove("aberto");
  modelosTrigger.setAttribute("aria-expanded", "false");
  menuAberto = false;
}

function alternarMenuModelos() {
  if (menuAberto) fecharMenuModelos();
  else abrirMenuModelos();
}

function mostrarAvisoModelos(msg, cor) {
  modelosAviso.textContent = msg;
  modelosAviso.style.color = cor || "var(--suave)";
  modelosAviso.classList.add("mostrar");
  clearTimeout(mostrarAvisoModelos._t);
  mostrarAvisoModelos._t = setTimeout(() => modelosAviso.classList.remove("mostrar"), 3500);
}

function aplicarModelo(texto) {
  campoMensagem.value = texto;
  atualizarPrevia();
  fecharMenuModelos();
  campoMensagem.focus();
}

async function salvarModeloAtual() {
  const texto = campoMensagem.value.trim();
  if (!texto) {
    mostrarAvisoModelos("Escreva a mensagem no campo acima antes de salvar como modelo.", "var(--vermelho)");
    campoMensagem.focus();
    return;
  }
  if (modelosCache.some((m) => (m.texto || "").trim() === texto)) {
    mostrarAvisoModelos("Esse modelo já existe.", "var(--suave)");
    return;
  }
  try {
    const novo = await Store.adicionarModelo(account_id, texto, token_id);
    modelosCache.unshift(novo);
    renderizarModelos();
    mostrarAvisoModelos("Modelo salvo.", "var(--amarelo)");
  } catch (e) {
    console.error("Erro ao salvar modelo:", e);
    mostrarAvisoModelos("Não foi possível salvar o modelo agora.", "var(--vermelho)");
  }
}

async function excluirModelo(id) {
  const alvo = modelosCache.find((m) => m.id === id);
  const previa = alvo ? "“" + resumir(alvo.texto, 80) + "”" : "";
  const ok = await abrirConfirmacao({
    titulo: "Excluir este modelo de mensagem?",
    mensagem: previa || "Esta ação não pode ser desfeita.",
    vinculos: [],
  });
  if (!ok) return;
  try {
    await Store.removerModelo(account_id, id);
    modelosCache = modelosCache.filter((m) => m.id !== id);
    renderizarModelos();
  } catch (e) {
    console.error("Erro ao excluir modelo:", e);
    mostrarAvisoModelos("Não foi possível excluir o modelo agora.", "var(--vermelho)");
  }
}

modelosTrigger.addEventListener("click", alternarMenuModelos);
modelosSalvar.addEventListener("click", salvarModeloAtual);

// Delegação de eventos nos itens do menu (usar / excluir)
modelosMenuLista.addEventListener("click", (e) => {
  const btnExcluir = e.target.closest('[data-acao="excluir"]');
  if (btnExcluir) {
    e.stopPropagation();
    const item = btnExcluir.closest(".modelo-item");
    if (item) excluirModelo(item.dataset.id);
    return;
  }
  const item = e.target.closest(".modelo-item");
  if (item) aplicarModelo(item.dataset.texto || "");
});

modelosMenuLista.addEventListener("keydown", (e) => {
  const item = e.target.closest(".modelo-item");
  if (item && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    aplicarModelo(item.dataset.texto || "");
  }
});

// Fecha o menu ao clicar fora ou apertar Esc
document.addEventListener("click", (e) => {
  if (menuAberto && !modelosWrap.contains(e.target)) fecharMenuModelos();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuAberto) fecharMenuModelos();
});

async function carregarModelos() {
  try {
    const dados = await Store.carregarTudo(account_id);
    modelosCache = dados.modelos;
  } catch (e) {
    console.error("Erro ao carregar modelos:", e);
    modelosCache = [];
  }
  renderizarModelos();
}

carregarModelos();
atualizarPrevia();

/* ============================================================================
 * Regiões afetadas (Fase 2) — cidade > bairro > rua
 * ----------------------------------------------------------------------------
 * Componente genérico de multi-seleção (busca, cadastro inline, "Todos" e
 * exclusão do catálogo), instanciado 3x e ligado em cascata. O resultado é
 * um objeto estruturado (regiaoAreasAtual) + um texto legível
 * (regiaoTextoAtual) usados na prévia e no disparo.
 * ========================================================================== */
let selCidade = null, selBairro = null, selRua = null;

function normalizarTxt(s) {
  return (s || "").trim().toLowerCase();
}

async function carregarCatalogo() {
  const dados = await Store.carregarTudo(account_id);
  return { cidades: dados.cidades, bairros: dados.bairros, ruas: dados.ruas };
}

/* ============================================================================
 * Confirmação de exclusão — modal próprio (não o confirm() nativo, que o iframe
 * do Chatwoot às vezes bloqueia, retornando "cancelar" sozinho). Mostra, em
 * cascata, o que será removido junto: bairros/ruas de uma cidade, ruas de um
 * bairro. As contagens saem do catálogo já em memória (sem ida ao banco).
 * ========================================================================== */
function contarVinculos(plural, id) {
  const BAIRRO = { sing: "bairro vinculado", plur: "bairros vinculados", zero: "Nenhum bairro vinculado" };
  const RUA = { sing: "rua vinculada", plur: "ruas vinculadas", zero: "Nenhuma rua vinculada" };
  if (plural === "cidades") {
    const bairros = catalogo.bairros.filter((b) => b.cidadeId === id);
    const idsBairros = new Set(bairros.map((b) => b.id));
    const ruas = catalogo.ruas.filter((r) => idsBairros.has(r.bairroId));
    return [
      { n: bairros.length, ...BAIRRO },
      { n: ruas.length, ...RUA },
    ];
  }
  if (plural === "bairros") {
    const ruas = catalogo.ruas.filter((r) => r.bairroId === id);
    return [{ n: ruas.length, ...RUA }];
  }
  return [];
}

function abrirConfirmacao(opts) {
  return new Promise((resolve) => {
    const fundo = document.getElementById("confirmarFundo");
    document.getElementById("confirmarTitulo").textContent = opts.titulo || "Excluir?";
    document.getElementById("confirmarMensagem").textContent = opts.mensagem || "";
    const lista = document.getElementById("confirmarVinculos");
    const vinc = opts.vinculos || [];
    if (vinc.length) {
      // Mostra todos os níveis, inclusive os zerados ("Nenhum bairro...").
      const total = vinc.reduce((s, v) => s + v.n, 0);
      lista.hidden = false;
      lista.classList.toggle("vazio", total === 0);
      lista.innerHTML = vinc.map((v) =>
        v.n > 0
          ? "<li><strong>" + v.n + "</strong> " + escapeHtml(v.n === 1 ? v.sing : v.plur) + "</li>"
          : "<li class=\"zero\">" + escapeHtml(v.zero) + "</li>"
      ).join("");
    } else {
      // Sem conceito de cascata (modelo, rua) — não mostra a caixa.
      lista.hidden = true;
      lista.classList.remove("vazio");
      lista.innerHTML = "";
    }
    const btnOk = document.getElementById("confirmarOk");
    const btnCancel = document.getElementById("confirmarCancelar");

    let ativo = true;
    function fechar(v) {
      if (!ativo) return;
      ativo = false;
      fundo.classList.remove("aberto");
      btnOk.removeEventListener("click", aoOk);
      btnCancel.removeEventListener("click", aoCancel);
      fundo.removeEventListener("click", aoFundo);
      document.removeEventListener("keydown", aoTecla);
      resolve(v);
    }
    function aoOk() { fechar(true); }
    function aoCancel() { fechar(false); }
    function aoFundo(e) { if (e.target === fundo) fechar(false); }
    function aoTecla(e) {
      if (e.key === "Escape") fechar(false);
      else if (e.key === "Enter") fechar(true);
    }
    btnOk.addEventListener("click", aoOk);
    btnCancel.addEventListener("click", aoCancel);
    fundo.addEventListener("click", aoFundo);
    document.addEventListener("keydown", aoTecla);
    fundo.classList.add("aberto");
    btnOk.focus();
  });
}

function criarSelecao(cfg) {
  const q = (suf) => document.getElementById(cfg.prefixo + suf);
  const el = {
    wrap: q(""), trigger: q("-trigger"), texto: q("-texto"), contagem: q("-contagem"),
    menu: q("-menu"), busca: q("-busca"), todos: q("-todos"), lista: q("-lista"),
    add: q("-add"), tags: q("-tags"),
  };
  const estado = { set: new Set(), todos: false, aberto: false };

  function habilitado() { return cfg.habilitado ? cfg.habilitado() : true; }
  function itens() { return cfg.itens(); }

  function selecionadosIds() {
    const disp = itens();
    if (estado.todos) return disp.map((i) => i.id);
    return disp.filter((i) => estado.set.has(i.id)).map((i) => i.id);
  }
  function selecionadosItens() {
    const ids = new Set(selecionadosIds());
    return itens().filter((i) => ids.has(i.id));
  }

  function abrir() {
    if (!habilitado()) return;
    el.menu.hidden = false;
    el.wrap.classList.add("aberto");
    el.trigger.setAttribute("aria-expanded", "true");
    estado.aberto = true;
    el.busca.value = "";
    renderLista();
    el.busca.focus();
  }
  function fechar() {
    el.menu.hidden = true;
    el.wrap.classList.remove("aberto");
    el.trigger.setAttribute("aria-expanded", "false");
    estado.aberto = false;
  }
  function alternar() { if (estado.aberto) fechar(); else abrir(); }

  function render() {
    const hab = habilitado();
    el.trigger.disabled = !hab;
    const sel = selecionadosItens();
    el.contagem.textContent = sel.length > 0 ? String(sel.length) : "";
    if (!hab) {
      el.texto.textContent = cfg.dicaDesabilitado;
    } else if (estado.todos) {
      el.texto.textContent = cfg.rotuloTodos;
    } else if (sel.length === 1) {
      el.texto.textContent = sel[0].nome;
    } else if (sel.length > 1) {
      el.texto.textContent = sel.length + " " + cfg.plural;
    } else {
      el.texto.textContent = cfg.placeholder;
    }
    renderTags();
    if (estado.aberto) renderLista();
  }

  function renderTags() {
    if (estado.todos) {
      el.tags.innerHTML = '<span class="sel-tag sel-tag-todos" data-todos="1">' +
        escapeHtml(cfg.rotuloTodos) +
        '<button type="button" class="sel-tag-x" aria-label="Remover">✕</button></span>';
      return;
    }
    el.tags.innerHTML = selecionadosItens().map((i) =>
      '<span class="sel-tag" data-id="' + escapeHtml(i.id) + '">' + escapeHtml(i.nome) +
      '<button type="button" class="sel-tag-x" aria-label="Remover">✕</button></span>'
    ).join("");
  }

  function renderLista() {
    const lista = itens();
    const termo = normalizarTxt(el.busca.value);
    const filtrados = termo ? lista.filter((i) => normalizarTxt(i.nome).indexOf(termo) !== -1) : lista;

    el.todos.classList.toggle("ativo", estado.todos);
    el.todos.textContent = (estado.todos ? "✓ " : "") + cfg.rotuloTodos;

    if (!lista.length) {
      el.lista.innerHTML = '<div class="sel-vazio">Nada cadastrado ainda. Digite acima para criar.</div>';
    } else if (!filtrados.length) {
      el.lista.innerHTML = '<div class="sel-vazio">Nada encontrado.</div>';
    } else {
      el.lista.innerHTML = filtrados.map((i) => {
        const marcado = estado.todos || estado.set.has(i.id);
        const ctx = cfg.contexto ? cfg.contexto(i) : [];
        const ctxHtml = (Array.isArray(ctx) ? ctx : [ctx]).filter(Boolean)
          .map((seg) => '<span class="sel-op-ctx">' + escapeHtml(seg) + '</span>').join("");
        return '<label class="sel-op ' + (marcado ? "marcado" : "") + '" data-id="' + escapeHtml(i.id) + '">' +
          '<input type="checkbox" ' + (marcado ? "checked" : "") + '>' +
          '<span class="sel-op-info"><span class="sel-op-nome">' + escapeHtml(i.nome) + '</span>' +
          ctxHtml + '</span>' +
          '<button type="button" class="sel-op-lixo" data-acao="excluir" aria-label="Excluir do catálogo" title="Excluir do catálogo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' +
          '</button></label>';
      }).join("");
    }

    const nome = el.busca.value.trim();
    const existe = lista.some((i) => normalizarTxt(i.nome) === normalizarTxt(nome));
    if (!nome || existe) {
      el.add.hidden = true;
      el.add.innerHTML = "";
      return;
    }
    el.add.hidden = false;
    const nomeEsc = escapeHtml(nome);
    if (!cfg.temPai) {
      el.add.innerHTML = '<button type="button" class="sel-add-btn" data-parent="">+ Cadastrar “' + nomeEsc + '”</button>';
      return;
    }
    const pais = cfg.paisSelecionados();
    if (pais.length === 1) {
      el.add.innerHTML = '<button type="button" class="sel-add-btn" data-parent="' + escapeHtml(pais[0].id) + '">' +
        '+ Cadastrar “' + nomeEsc + '” em ' + escapeHtml(pais[0].nome) + '</button>';
    } else if (pais.length > 1) {
      el.add.innerHTML = '<div class="sel-add-titulo">Cadastrar “' + nomeEsc + '” em qual ' + cfg.nomePai + '?</div>' +
        '<div class="sel-add-pais">' +
        pais.map((p) => '<button type="button" class="sel-add-pai" data-parent="' + escapeHtml(p.id) + '">' + escapeHtml(p.nome) + '</button>').join("") +
        '</div>';
    } else {
      el.add.hidden = true;
      el.add.innerHTML = "";
    }
  }

  async function adicionar(parentId) {
    const nome = el.busca.value.trim();
    if (!nome) return;
    try {
      const novo = await cfg.aoAdicionar(nome, parentId || null);
      catalogo = await carregarCatalogo();
      estado.set.add(novo.id);
      el.busca.value = "";
      cfg.aoMudar();
      render();
      renderLista();
      el.busca.focus();
    } catch (e) {
      console.error("Erro ao cadastrar:", e);
    }
  }

  async function excluirCatalogo(id) {
    const item = itens().find((i) => i.id === id) || { nome: "" };
    const vinculos = contarVinculos(cfg.plural, id);
    const temVinculo = vinculos.some((v) => v.n > 0);
    const ok = await abrirConfirmacao({
      titulo: "Excluir “" + item.nome + "”?",
      mensagem: temVinculo
        ? "Também serão removidos, em cascata, os itens vinculados abaixo:"
        : "Esta ação não pode ser desfeita.",
      vinculos: vinculos,
    });
    if (!ok) return;
    try {
      await cfg.aoExcluirCatalogo(id);
      estado.set.delete(id);
      catalogo = await carregarCatalogo();
      cfg.aoMudar();
      render();
      renderLista();
    } catch (e) {
      console.error("Erro ao excluir do catálogo:", e);
    }
  }

  function toggleItem(id) {
    if (estado.todos) {
      estado.todos = false;
      itens().forEach((i) => estado.set.add(i.id));
      estado.set.delete(id);
    } else if (estado.set.has(id)) {
      estado.set.delete(id);
    } else {
      estado.set.add(id);
    }
    cfg.aoMudar();
    render();
    renderLista();
  }

  function toggleTodos() {
    estado.todos = !estado.todos;
    if (estado.todos) estado.set.clear();
    cfg.aoMudar();
    render();
    renderLista();
  }

  // Remove da seleção itens que saíram de escopo (ex.: o pai foi desmarcado).
  function sincronizar() {
    const disp = new Set(itens().map((i) => i.id));
    [...estado.set].forEach((id) => { if (!disp.has(id)) estado.set.delete(id); });
    if (!habilitado()) {
      estado.set.clear();
      estado.todos = false;
      if (estado.aberto) fechar();
    }
    render();
  }

  function limpar() {
    estado.set.clear();
    estado.todos = false;
    if (estado.aberto) fechar();
    render();
  }

  el.trigger.addEventListener("click", alternar);
  el.todos.addEventListener("click", toggleTodos);
  el.add.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-parent]");
    if (btn) adicionar(btn.dataset.parent || null);
  });
  el.busca.addEventListener("input", renderLista);
  el.busca.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nome = el.busca.value.trim();
      if (!nome) return;
      const existente = itens().find((i) => normalizarTxt(i.nome) === normalizarTxt(nome));
      if (existente) { toggleItem(existente.id); el.busca.value = ""; renderLista(); return; }
      // cadastra direto quando o destino é único; se ambíguo, o usuário escolhe o pai clicando
      if (!cfg.temPai) { adicionar(null); return; }
      const pais = cfg.paisSelecionados();
      if (pais.length === 1) adicionar(pais[0].id);
    } else if (e.key === "Escape") {
      e.preventDefault(); fechar(); el.trigger.focus();
    }
  });
  el.lista.addEventListener("click", (e) => {
    const lixo = e.target.closest('[data-acao="excluir"]');
    if (lixo) {
      e.preventDefault(); e.stopPropagation();
      const op = lixo.closest(".sel-op");
      if (op) excluirCatalogo(op.dataset.id);
      return;
    }
    const op = e.target.closest(".sel-op");
    if (op) { e.preventDefault(); toggleItem(op.dataset.id); }
  });
  el.tags.addEventListener("click", (e) => {
    const x = e.target.closest(".sel-tag-x");
    if (!x) return;
    const tag = x.closest(".sel-tag");
    if (tag.dataset.todos) { estado.todos = false; cfg.aoMudar(); render(); }
    else if (tag.dataset.id) { estado.set.delete(tag.dataset.id); cfg.aoMudar(); render(); }
  });
  el.menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", (e) => { if (estado.aberto && !el.wrap.contains(e.target)) fechar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && estado.aberto) { fechar(); el.trigger.focus(); } });

  return { render, sincronizar, limpar, selecionadosIds, selecionadosItens, estado };
}

/* ---------- Estrutura + texto da região a partir das seleções ---------- */
function nomeCidade(id) { const c = catalogo.cidades.find((x) => x.id === id); return c ? c.nome : ""; }
function nomeBairro(id) { const b = catalogo.bairros.find((x) => x.id === id); return b ? b.nome : ""; }

function construirAreas() {
  if (!selCidade) return { todasCidades: false, todosBairros: false, todasRuas: false, cidades: [] };
  const cidItens = selCidade.selecionadosItens();
  const baiItens = selBairro.selecionadosItens();
  const ruaItens = selRua.selecionadosItens();
  const cidades = cidItens.map((c) => ({
    nome: c.nome,
    bairros: baiItens.filter((b) => b.cidadeId === c.id).map((b) => ({
      nome: b.nome,
      ruas: ruaItens.filter((r) => r.bairroId === b.id).map((r) => r.nome),
    })),
  }));
  return {
    todasCidades: selCidade.estado.todos,
    todosBairros: selBairro.estado.todos,
    todasRuas: selRua.estado.todos,
    cidades,
  };
}

function areasParaTexto(areas) {
  if (!areas || !areas.cidades || !areas.cidades.length) return "";
  const semDetalhe = areas.cidades.every((c) => !c.bairros.length);
  if (areas.todasCidades && semDetalhe) return "Todas as cidades";
  return areas.cidades.map((c) => {
    if (!c.bairros.length) return c.nome;
    const bs = c.bairros.map((b) => b.ruas.length ? (b.nome + " (" + b.ruas.join(", ") + ")") : b.nome);
    return c.nome + ": " + bs.join(", ");
  }).join(" | ");
}

function recalcularRegiao() {
  regiaoAreasAtual = construirAreas();
  regiaoTextoAtual = areasParaTexto(regiaoAreasAtual);
  atualizarPrevia();
}

function regiaoValida() {
  return !!(regiaoAreasAtual && regiaoAreasAtual.cidades && regiaoAreasAtual.cidades.length);
}

function limparRegiao() {
  if (selCidade) selCidade.limpar();
  if (selBairro) selBairro.limpar();
  if (selRua) selRua.limpar();
  recalcularRegiao();
}

async function iniciarRegioes() {
  catalogo = await carregarCatalogo();

  selCidade = criarSelecao({
    prefixo: "selCidade",
    placeholder: "Selecionar cidades", plural: "cidades", rotuloTodos: "Todas as cidades",
    temPai: false,
    itens: () => catalogo.cidades,
    aoAdicionar: (nome) => Store.adicionarCidade(account_id, nome, token_id),
    aoExcluirCatalogo: (id) => Store.removerCidade(account_id, id),
    aoMudar: () => { selBairro.sincronizar(); selRua.sincronizar(); recalcularRegiao(); },
  });

  selBairro = criarSelecao({
    prefixo: "selBairro",
    placeholder: "Selecionar bairros", plural: "bairros", rotuloTodos: "Todos os bairros",
    dicaDesabilitado: "Selecione a cidade primeiro",
    habilitado: () => selCidade.selecionadosIds().length > 0,
    itens: () => {
      const cid = new Set(selCidade.selecionadosIds());
      return catalogo.bairros.filter((b) => cid.has(b.cidadeId));
    },
    temPai: true,
    nomePai: "cidade",
    paisSelecionados: () => selCidade.selecionadosItens(),
    contexto: (b) => [nomeCidade(b.cidadeId)],
    aoAdicionar: (nome, cidadeId) => Store.adicionarBairro(account_id, nome, cidadeId, token_id),
    aoExcluirCatalogo: (id) => Store.removerBairro(account_id, id),
    aoMudar: () => { selRua.sincronizar(); recalcularRegiao(); },
  });

  selRua = criarSelecao({
    prefixo: "selRua",
    placeholder: "Selecionar ruas (opcional)", plural: "ruas", rotuloTodos: "Todas as ruas",
    dicaDesabilitado: "Selecione o bairro primeiro",
    habilitado: () => selBairro.selecionadosIds().length > 0,
    itens: () => {
      const bai = new Set(selBairro.selecionadosIds());
      return catalogo.ruas.filter((r) => bai.has(r.bairroId));
    },
    temPai: true,
    nomePai: "bairro",
    paisSelecionados: () => selBairro.selecionadosItens(),
    contexto: (r) => {
      const b = catalogo.bairros.find((x) => x.id === r.bairroId);
      return b ? [b.nome, nomeCidade(b.cidadeId)] : [];
    },
    aoAdicionar: (nome, bairroId) => Store.adicionarRua(account_id, nome, bairroId, token_id),
    aoExcluirCatalogo: (id) => Store.removerRua(account_id, id),
    aoMudar: () => { recalcularRegiao(); },
  });

  selCidade.render();
  selBairro.render();
  selRua.render();
  recalcularRegiao();
}
iniciarRegioes();

/* ============================================================================
 * Histórico
 * ========================================================================== */
function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function renderizarHistorico(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    historicoLista.innerHTML = `<div class="historico-vazio">Nenhuma ativação registrada ainda para esta conta.</div>`;
    return;
  }

  historicoLista.innerHTML = itens.map((item) => {
    const emAberto = !item.desativado_em;
    const duracao = emAberto ? "no ar agora" : formatarDuracaoCurta(item.duracao_segundos);
    // Mostra o NOME do operador (vem do JOIN com agents.name na query do histórico).
    // Nunca exibe o token cru — se não houver nome, mostra "Não identificado".
    const operador = item.operador_nome || "Não identificado";

    return `
      <div class="item-historico ${emAberto ? "aberto-agora" : ""}">
        <div class="item-topo">
          <span class="item-quando">${formatarDataHora(item.ativado_em)}</span>
          <span class="item-duracao">${duracao}</span>
        </div>
        <p class="item-mensagem">${escapeHtml(item.mensagem)}</p>
        <div class="item-meta">
          <span class="tag-meta">Região: <b>${escapeHtml(item.regiao || "—")}</b></span>
          <span class="tag-meta">Operador: <b>${escapeHtml(operador)}</b></span>
          ${!emAberto ? `<span class="tag-meta">Encerrada: <b>${formatarDataHora(item.desativado_em)}</b></span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function carregarHistorico() {
  historicoLista.innerHTML = `<div class="historico-carregando">Carregando histórico...</div>`;
  try {
    const resposta = await fetch(`${HISTORICO_URL}?account=${encodeURIComponent(account_id)}&token=${encodeURIComponent(token_id)}`);
    if (!resposta.ok) throw new Error("Falha na resposta");
    const dados = await resposta.json();
    renderizarHistorico(dados);
  } catch (erro) {
    console.error("Erro ao carregar histórico:", erro);
    historicoLista.innerHTML = `<div class="historico-erro">Não foi possível carregar o histórico agora. Tente novamente em instantes.</div>`;
  }
}

function abrirHistorico() {
  historicoFundo.classList.add("aberto");
  carregarHistorico();
}

function fecharHistorico() {
  historicoFundo.classList.remove("aberto");
}

historicoFundo.addEventListener("click", (e) => {
  if (e.target === historicoFundo) fecharHistorico();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharHistorico();
});

/* ============================================================================
 * Ativar / Desativar
 * ========================================================================== */
async function submitHandle() {

  const textoEnviar = document.getElementById("textoEnviar").value;
    if (!textoEnviar && !ativado) {
    status.textContent = "Digite uma mensagem antes de ativar.";
    status.style.color = "#f87171";
    setTimeout(() => {
      atualizarInterface()
    }, 3000);
    return;
  }
  if (!regiaoValida() && !ativado) {
    status.textContent = "Selecione ao menos uma cidade antes de ativar.";
    status.style.color = "#f87171";
    setTimeout(() => {
      atualizarInterface()
    }, 3000);
    return;
  }

  button.disabled = true; // desabilita o botão enquanto processa
  buttonLabel.textContent = ativado ? "Desativando..." : "Ativando...";

  try {
    const acao = ativado ? false : true;

    // No modo teste não há webhook — simula sucesso para dar pra testar a UX.
    let ok = true;
    if (!MODO_DEV) {
      const response = await fetch(MASSIVA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texto: `${textoEnviar} áreas afetadas: ${regiaoTextoAtual}`,
          account: account_id,
          status: acao,
          // Campos novos — não afetam o contrato antigo
          token: token_id,
          mensagem: textoEnviar,
          regiao: regiaoTextoAtual,
          // Estrutura hierárquica cidade > bairro > rua (Fase 2) para a IA filtrar
          areas: regiaoAreasAtual,
        }),
      });
      ok = response.ok;
    }

    if (ok) {
      ativado = !ativado;
      if (ativado) {
        salvarAtivacao(); // registra o horário em que foi ativada (apenas visual)
      } else {
        limparAtivacao(); // desativou: o horário some da tela e do registro
      }
      atualizarInterface();
    } else {
      status.textContent = "Erro ao enviar requisição.";
      status.style.color = "#f87171";
    }
  } catch (error) {
    console.error("Erro:", error);
    status.textContent = "Erro ao conectar.";
    status.style.color = "#f87171";
  } finally {
    button.disabled = false; // libera o botão após o processo
    buttonLabel.textContent = ativado ? "Desativar" : "Ativar"; // evita ficar travado em "Ativando..."/"Desativando..." se der erro
    button.classList.toggle("encerrar", ativado);
    document.getElementById("textoEnviar").value = "";
    limparRegiao();
    atualizarPrevia(); // apenas visual: zera prévia e contador junto com os campos
  }
}
