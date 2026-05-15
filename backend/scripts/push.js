#!/usr/bin/env node
const { spawnSync } = require('child_process');
const readline = require('readline');

function git(args) {
  const r = spawnSync('git', args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\nFalha ao executar: git ' + args.join(' '));
    process.exit(r.status || 1);
  }
}

function gitOutput(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test'];

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

async function askType() {
  console.log('\nTipo da mudanca:');
  TYPES.forEach(function (t, i) {
    console.log('  ' + (i + 1) + ') ' + t);
  });
  const ans = (await prompt('Escolha (numero ou nome): ')).trim().toLowerCase();
  const idx = parseInt(ans, 10);
  if (idx >= 1 && idx <= TYPES.length) return TYPES[idx - 1];
  if (TYPES.indexOf(ans) !== -1) return ans;
  console.error('Tipo invalido. Opcoes: ' + TYPES.join(', '));
  process.exit(1);
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function (resolve) {
    rl.question(question, function (ans) {
      rl.close();
      resolve(ans);
    });
  });
}

(async function () {
  const repoRoot = gitOutput(['rev-parse', '--show-toplevel']);
  if (!repoRoot) {
    console.error('Nao esta em um repositorio git.');
    process.exit(1);
  }
  process.chdir(repoRoot);

  const status = gitOutput(['status', '--porcelain']);
  if (!status) {
    console.error('Nenhuma alteracao para enviar.');
    process.exit(1);
  }

  const type = await askType();

  let desc = process.argv.slice(2).join(' ').trim();
  if (!desc) {
    desc = (await prompt('Descricao curta das mudancas: ')).trim();
  }
  if (!desc) {
    console.error('Descricao obrigatoria.');
    process.exit(1);
  }

  const slug = slugify(desc);
  if (!slug) {
    console.error('Descricao invalida (sem caracteres utilizaveis).');
    process.exit(1);
  }

  let branch = type + '/' + slug;
  if (gitOutput(['rev-parse', '--verify', branch]) !== null) {
    branch = branch + '-' + Date.now().toString().slice(-4);
  }

  const commitMsg = type + ': ' + desc;

  console.log('\n[1/4] Criando branch ' + branch);
  git(['checkout', '-b', branch]);

  console.log('\n[2/4] Adicionando arquivos');
  git(['add', '-A']);

  console.log('\n[3/4] Commitando: ' + commitMsg);
  git(['commit', '-m', commitMsg]);

  console.log('\n[4/4] Enviando para origin');
  git(['push', '-u', 'origin', branch]);

  console.log('\nBranch ' + branch + ' enviada com sucesso.');
})();
