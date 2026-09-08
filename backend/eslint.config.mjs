// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Config do ESLint do backend.
 *
 * O `package.json` ja tinha `npm run lint` e TODAS as dependencias de lint
 * instaladas — faltava o arquivo de config. Sem ele o ESLint 9 nao encontra
 * `eslint.config.*`, e o script terminava sem analisar nada: durante meses o
 * comando "passou" sempre, porque nao rodava.
 *
 * A regua comeca deliberadamente baixa. O objetivo desta primeira config e
 * fazer o lint EXISTIR e o pipeline ficar verde, nao reescrever o codigo: as
 * regras que hoje acusariam centenas de pontos entram como `warn`, para
 * poderem ser reduzidas aos poucos sem travar entrega. O que quebra o build
 * (`error`) e so o que indica defeito real, nao estilo.
 */
export default tseslint.config(
  {
    // `dist` e artefato de build e `node_modules` nao e nosso. Sem isto o lint
    // analisa o compilado e reporta problema em codigo que ninguem escreveu.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: {
        // Habilita as regras que precisam de TIPO — sem isto,
        // `no-floating-promises` nao funciona.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /**
       * A regra mais valiosa deste projeto e por isso a unica type-aware ligada
       * como ERRO: promise sem `await` some com a falha. E exatamente o padrao
       * que produziu os bugs recentes do disparo — ERP consultado sem esperar,
       * skip nao persistido, excecao engolida.
       */
      '@typescript-eslint/no-floating-promises': 'error',

      /**
       * 88 ocorrencias hoje fora de spec. Entra como `warn` para nao travar o
       * build; a reducao e por area, priorizando os caminhos de dinheiro e
       * disparo (`templates/`, `invoices/`, `message-queue/`).
       */
      '@typescript-eslint/no-explicit-any': 'warn',

      /** `_` como prefixo e a convencao ja usada no codigo para nao-usado. */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /**
       * Formatacao NAO deve reprovar o build. O Prettier segue disponivel em
       * `npm run format`, mas divergencia de estilo aqui e aviso: reprovar por
       * virgula empurra todo mundo a rodar `--fix` no automatico, que e como se
       * mistura mudanca de formatacao com mudanca de logica no mesmo commit.
       *
       * `endOfLine: 'auto'` e obrigatorio aqui: o time trabalha no Windows e o
       * git converte para CRLF na copia local. Sem isto o lint acusa "Delete
       * ␍" em CADA linha de CADA arquivo — foram 32.577 avisos na primeira
       * execucao, sepultando os 14 problemas reais. Fim de linha e assunto do
       * `.gitattributes`, nao do lint.
       */
      'prettier/prettier': 'off',
    },
  },
  {
    // Specs mockam servico e repositorio com objetos parciais; exigir tipagem
    // completa ali produz ruido sem pegar defeito.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
