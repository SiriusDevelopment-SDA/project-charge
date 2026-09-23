// Gera as variantes de deploy por empresa a partir de dist/.
// Cada empresa tem: o NOME do webhook da página (usado nos $('...')) e, quando
// mora no MESMO host de outra, webhook paths PRÓPRIOS (senão colidem).
//   - hextelecom: paths PADRÃO (massiva-*), página $('hextelecom')
//   - directlan : paths -directlan, página $('directlan')
import fs from 'fs';
import path from 'path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'dist');

const PROFILES = {
  hextelecom: { node: 'hextelecom', paths: {} }, // mantém os paths padrão
  directlan: {
    node: 'directlan',
    paths: {
      'massiva-catalogo-criar':   'catalogo-criar-directlan',
      'massiva-catalogo-excluir': 'catalogo-excluir-directlan',
      'massiva-catalogo':         'catalogo-directlan',
      'massiva-historico':        'historico-directlan',
      'massiva':                  'salvadados-directlan',
      'massiva-css':              'css_directlan',
      'massiva-js':               'js-directlan',
    },
  },
};

const jsBase   = fs.readFileSync(path.join(dir, 'massiva.js'), 'utf8');
const cssBase  = fs.readFileSync(path.join(dir, 'massiva.css'), 'utf8');
const htmlBase = fs.readFileSync(path.join(dir, 'massiva.html'), 'utf8');

for (const [nome, prof] of Object.entries(PROFILES)) {
  const out = path.join(dir, nome);
  fs.mkdirSync(out, { recursive: true });

  // JS: troca os 5 URLs de dados (só quando o profile define paths próprios)
  let js = jsBase;
  for (const std of ['massiva-catalogo-criar','massiva-catalogo-excluir','massiva-catalogo','massiva-historico','massiva']) {
    if (prof.paths[std]) js = js.split(`"/webhook/${std}"`).join(`"/webhook/${prof.paths[std]}"`);
  }
  fs.writeFileSync(path.join(out, 'massiva.js'), js);

  // CSS: idêntico
  fs.writeFileSync(path.join(out, 'massiva.css'), cssBase);

  // HTML: css/js src (se profile trocar) + $('Uplink') -> $('<node>')
  let html = htmlBase;
  for (const std of ['massiva-css','massiva-js']) {
    if (prof.paths[std]) html = html.split(`/webhook/${std}`).join(`/webhook/${prof.paths[std]}`);
  }
  html = html.split("$('Uplink')").join(`$('${prof.node}')`);
  fs.writeFileSync(path.join(out, 'massiva.html'), html);

  const usados = [...new Set(js.match(/\/webhook\/[a-z_-]+/g))];
  console.log(`${nome}: página $('${prof.node}') | paths JS: ${usados.join(', ')}`);
}
