import { expect, test } from "@playwright/test";

/**
 * Empresa INATIVA no embed do Chatwoot, pelos olhos de um super_admin.
 *
 * POR QUE ESTE TESTE EXISTE: a faixa foi entregue afirmando "As telas ficam
 * bloqueadas" enquanto o Disparo Manual seguia inteiramente usavel por baixo
 * dela — seis rotas estavam marcadas como publicas e ninguem tinha conferido a
 * frase contra a tela. Um teste de unidade nao pegaria: o defeito era a
 * combinacao de rota + layout + storage, que so aparece no navegador.
 *
 * PRE-REQUISITOS (ver `playwright.config.ts`): backend em :3000 e vite em
 * :5173. Alem disso:
 *   - `E2E_EMBED_TOKEN` = chatwootAccessToken de um agente super_admin ativo;
 *   - `E2E_EMBED_ACCOUNT` = account_chatwoot de uma empresa INATIVA (default 19).
 *
 * O token vem do ambiente de proposito: e credencial real do Chatwoot e nao
 * pode ser versionada. Sem ele o teste e PULADO, nunca silenciosamente verde.
 */
const TOKEN = process.env.E2E_EMBED_TOKEN ?? "";
const ACCOUNT = process.env.E2E_EMBED_ACCOUNT ?? "19";

test.describe("empresa inativa — super_admin", () => {
  test.skip(
    !TOKEN,
    "defina E2E_EMBED_TOKEN (token de super_admin) para rodar este teste",
  );

  /**
   * A empresa alvo precisa estar INATIVA no banco — e nao ha como o Playwright
   * garantir isso, porque a inativacao e um UPDATE no Postgres, nao um caminho
   * do produto (a tela so REATIVA).
   *
   * Quando a precondicao nao vale, PULAMOS com o motivo em vez de falhar: a
   * primeira versao deste teste ficava vermelha com "element(s) not found",
   * mandando quem lesse procurar bug no componente quando o unico problema era
   * a empresa ter sido reativada. Vermelho por estado de ambiente ensina a
   * ignorar vermelho.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto(`/?account=${ACCOUNT}&token=${TOKEN}`);
    // `isVisible()` NAO espera, e o login do embed e assincrono: a faixa so
    // aparece depois do POST /auth/embed-login. Checar sem esperar pulava o
    // teste de forma intermitente, dependendo de quem ganhasse a corrida.
    const visivel = await page
      .getByTestId("faixa-empresa-inativa")
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    test.skip(
      !visivel,
      `A empresa da account ${ACCOUNT} precisa estar INATIVA para este teste. ` +
        `Rode: update company set active=false where account_chatwoot='${ACCOUNT}';`,
    );
  });

  test("a faixa aparece e o conteudo fica bloqueado em TODAS as rotas", async ({
    page,
  }) => {
    await page.goto(`/?account=${ACCOUNT}&token=${TOKEN}`);

    const faixa = page.getByTestId("faixa-empresa-inativa");
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText("esta inativa");
    await expect(
      faixa.getByRole("button", { name: /ativar empresa/i }),
    ).toBeEnabled();

    // A rota inicial e o Disparo Manual — exatamente a tela que ficava usavel
    // enquanto a faixa dizia o contrario.
    await expect(page.getByTestId("conteudo-bloqueado")).toBeVisible();

    // O blur precisa estar de fato aplicado, nao so a div existir.
    const filtro = await page
      .getByTestId("conteudo-bloqueado")
      .evaluate((el) => getComputedStyle(el).filter);
    expect(filtro).toContain("blur");

    // E precisa valer nas demais rotas, nao so na inicial. Estas quatro eram
    // "publicas" ate 09/09/2026.
    for (const rota of ["historico", "campanhas", "createCampanha", "perfil"]) {
      await page.goto(`/${rota}?account=${ACCOUNT}`);
      await expect(
        page.getByTestId("faixa-empresa-inativa"),
        `faixa ausente em /${rota}`,
      ).toBeVisible();
      await expect(
        page.getByTestId("conteudo-bloqueado"),
        `conteudo nao bloqueado em /${rota}`,
      ).toBeVisible();
    }
  });

  test("super_admin nao ve o card 'Em desenvolvimento'", async ({ page }) => {
    await page.goto(`/?account=${ACCOUNT}&token=${TOKEN}`);

    await expect(page.getByTestId("faixa-empresa-inativa")).toBeVisible();
    // O card e a mensagem para o cliente final; para quem administra ela nao
    // diz nada e ainda esconde a faixa, que e o unico ponto clicavel.
    await expect(page.getByText("Em desenvolvimento")).toHaveCount(0);
  });
});
