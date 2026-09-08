import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // A porta fica trancada por lint, nao por combinado.
    //
    // `services/api` e a instancia do axios: baseURL e interceptor que injeta o
    // token. Importa-la de um hook ou componente e o caminho por onde regra de
    // negocio vaza para o browser — foi assim que o disparo passou a montar
    // `components` da Meta no front e descartar cliente em silencio (corrigido
    // no PR #101). Hook e pagina consomem o service do dominio; quem fala HTTP
    // e `services/`.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/services/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/api', '**/services/api/*'],
              message:
                'Chamada HTTP vive em services/. Consuma o service do dominio (TemplateService, DispatchReportService, ...) em vez do Api direto.',
            },
          ],
        },
      ],
    },
  },
])