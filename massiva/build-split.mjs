// ============================================================================
// build-split.mjs — reparte o modo-massiva.html em 3 pedaços para o n8n:
//   dist/massiva.html  — esqueleto (marcação + placeholders {{ }}) + <link>/<script src>
//   dist/massiva.css   — só o CSS (servido por GET /webhook/massiva-css)
//   dist/massiva.js    — só o JS  (servido por GET /webhook/massiva-js)
//
// O modo-massiva.html continua sendo a FONTE ÚNICA (é nele que se edita e testa).
// Rode `node massiva/build-split.mjs` sempre que mudar o HTML pra regenerar os 3.
//
// Cache-busting: os links usam ?v=N. Quando atualizar o CSS/JS no n8n, suba o
// número (VERSAO abaixo) e regenere — o navegador pega a versão nova na hora.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(AQUI, 'modo-massiva.html');
const DIST = path.join(AQUI, 'dist');
const VERSAO = 1; // suba quando publicar CSS/JS novo (vira ?v=2, ?v=3, ...)

const html = fs.readFileSync(SRC, 'utf8');

function recorte(abreTag, fechaTag) {
  const i = html.indexOf(abreTag);
  const j = html.indexOf(fechaTag);
  if (i === -1 || j === -1 || j < i) throw new Error(`não achei ${abreTag}...${fechaTag}`);
  return {
    ini: i,
    fimAbre: i + abreTag.length,
    iniFecha: j,
    fim: j + fechaTag.length,
    conteudo: html.slice(i + abreTag.length, j),
  };
}

const estilo = recorte('<style>', '</style>');
const script = recorte('<script>', '</script>');
if (script.ini < estilo.fim) throw new Error('esperava <style> antes de <script>');

const css = estilo.conteudo.replace(/^\n/, '').replace(/\s+$/, '') + '\n';
const js = script.conteudo.replace(/^\n/, '').replace(/\s+$/, '') + '\n';

const linkTag = `<link rel="stylesheet" href="/webhook/massiva-css?v=${VERSAO}" />`;
const scriptTag = `<script src="/webhook/massiva-js?v=${VERSAO}" defer></script>`;

// Variante A — 3 partes: CSS e JS externos (nó HTML ~15 KB, 2 webhooks novos).
const shell =
  html.slice(0, estilo.ini) +
  linkTag +
  html.slice(estilo.fim, script.ini) +
  scriptTag +
  html.slice(script.fim);

// Variante B — à prova de MIME: CSS fica INLINE, só o JS é externo.
// Evita a pegadinha do Content-Type do CSS (navegador é rígido com stylesheet,
// mas aceita <script> com qualquer MIME). Nó HTML ~53 KB, só 1 webhook novo (massiva-js).
const shellCssInline =
  html.slice(0, script.ini) +
  scriptTag +
  html.slice(script.fim);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'massiva.css'), css);
fs.writeFileSync(path.join(DIST, 'massiva.js'), js);
fs.writeFileSync(path.join(DIST, 'massiva.html'), shell);
fs.writeFileSync(path.join(DIST, 'massiva-css-inline.html'), shellCssInline);

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(0) + ' KB';
console.log('Gerado em massiva/dist/ (v' + VERSAO + '):');
console.log('  [3 partes] massiva.html   :', kb(shell), '+ massiva.css', kb(css), '+ massiva.js', kb(js));
console.log('  [CSS inline] massiva-css-inline.html:', kb(shellCssInline), '(só precisa do webhook massiva-js)');

// Sanidade: os 3 placeholders do n8n têm que ficar NO esqueleto (não no JS/CSS)
for (const ph of ['query.account', 'status.toString', 'query.token']) {
  if (!shell.includes(ph)) throw new Error('placeholder sumiu do esqueleto: ' + ph);
  if (js.includes(ph) || css.includes(ph)) throw new Error('placeholder vazou pro asset: ' + ph);
}
console.log('OK — placeholders {{ }} preservados só no esqueleto.');
