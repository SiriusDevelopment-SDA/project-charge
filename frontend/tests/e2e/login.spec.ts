import { expect, test } from "@playwright/test";

/**
 * Smoke test da tela de login: nao depende do backend, so do frontend no ar.
 * Serve para provar que a instalacao do Playwright funciona e que a rota
 * publica renderiza. Testes que passam por API precisam do backend rodando.
 */
test.describe("Login", () => {
  test("renderiza o formulario e exige os campos", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("img", { name: "Coraxy" })).toBeVisible();
    await expect(
      page.getByText("Informe email e senha para acessar o painel."),
    ).toBeVisible();

    const email = page.getByLabel("Email");
    const senha = page.getByLabel("Senha");
    const entrar = page.getByRole("button", { name: "Entrar" });

    await expect(email).toBeVisible();
    await expect(senha).toHaveAttribute("type", "password");
    await expect(entrar).toBeEnabled();

    // Os inputs sao `required`: submeter vazio nao dispara requisicao.
    await entrar.click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rota protegida redireciona para o login quando nao autenticado", async ({
    page,
  }) => {
    await page.goto("/campanhas");

    await expect(page).toHaveURL(/\/login/);
  });
});
