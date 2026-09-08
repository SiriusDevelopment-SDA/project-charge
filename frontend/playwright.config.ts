import { defineConfig, devices } from "@playwright/test";

/**
 * Testes E2E do painel de cobranca.
 *
 * PRE-REQUISITOS (nao ha `webServer` configurado de proposito):
 *   1. backend no ar    -> `npm run docker:bg` em `backend/`
 *   2. frontend no ar   -> `npm run dev` em `frontend/` (porta 5173)
 *
 * Um `webServer` que subisse so o Vite daria a falsa impressao de que
 * `npm run test:e2e` basta: sem backend, tudo que passa por API falha.
 *
 * ATENCAO AO ALVO: 5173 (vite dev) fala com o backend LOCAL; o build servido
 * em :8080 fala com PRODUCAO (apicobranca.coraxy.com.br). Apontar os testes
 * para :8080 significa executa-los contra dados reais de clientes.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
