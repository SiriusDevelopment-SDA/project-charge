// Gera a variante "Direct lan" dos arquivos de dist/ — mesmos arquivos, mas com
// os webhook paths PRÓPRIOS da Direct lan (ela vive no MESMO host da Hex, então
// não pode usar os paths padrão, senão cai nos webhooks da Hex).
//
// Troca:
//   JS  : os 5 URLs de dados (massiva* -> *-directlan)
//   HTML: <link>/<script> do css/js (massiva-css/js -> css_directlan/js-directlan)
//         e os placeholders $('Uplink') -> $('directlan') (nome do webhook da página)
//
// Uso: node massiva/build-directlan.mjs   (rode depois de build-split.mjs)
import fs from 'fs';
import path from 'path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'dist');
const out = path.join(dir, 'directlan');
fs.mkdirSync(out, { recursive: true });

function trocar(txt, pares, rotulo) {
  for (const [a, b] of pares) {
    if (!txt.includes(a)) throw new Error(`${rotulo}: não encontrei ${JSON.stringify(a)}`);
    txt = txt.split(a).join(b);
  }
  return txt;
}

// --- JS: paths de dados (ordem não importa: strings com aspas não colidem) ---
let js = fs.readFileSync(path.join(dir, 'massiva.js'), 'utf8');
js = trocar(js, [
  ['"/webhook/massiva-catalogo-criar"',   '"/webhook/catalogo-criar-directlan"'],
  ['"/webhook/massiva-catalogo-excluir"', '"/webhook/catalogo-excluir-directlan"'],
  ['"/webhook/massiva-catalogo"',         '"/webhook/catalogo-directlan"'],
  ['"/webhook/massiva-historico"',        '"/webhook/historico-directlan"'],
  ['"/webhook/massiva"',                  '"/webhook/salvadados-directlan"'],
], 'JS');
fs.writeFileSync(path.join(out, 'massiva.js'), js);

// --- CSS: idêntico ---
fs.copyFileSync(path.join(dir, 'massiva.css'), path.join(out, 'massiva.css'));

// --- HTML shell ---
let html = fs.readFileSync(path.join(dir, 'massiva.html'), 'utf8');
html = trocar(html, [
  ['/webhook/massiva-css', '/webhook/css_directlan'],
  ['/webhook/massiva-js',  '/webhook/js-directlan'],
  ["$('Uplink')",          "$('directlan')"],
], 'HTML');
fs.writeFileSync(path.join(out, 'massiva.html'), html);

// --- Sanidade: não pode sobrar path padrão no JS ---
const sobra = (js.match(/\/webhook\/massiva[a-z-]*/g) || []);
if (sobra.length) throw new Error('Ainda há path padrão no JS: ' + [...new Set(sobra)].join(', '));

console.log('Direct lan gerado em dist/directlan/  (js/css/html)');
console.log('Paths no JS:', [...new Set(js.match(/\/webhook\/[a-z_-]+/g))].join(', '));
