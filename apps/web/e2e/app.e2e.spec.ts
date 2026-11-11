import { expect, test } from "@playwright/test";

test("login e renderizacao da visao da rede", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

  await page.getByRole("textbox", { name: "E-mail" }).fill("ana.ribeiro@diel.example");
  await page.getByRole("textbox", { name: "Senha" }).fill("dev-only-change-me");
  await page.getByRole("button", { name: "LOGIN" }).click();

  await expect(page.getByRole("heading", { name: "Visao da rede" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver detalhes" }).first()).toBeVisible();
});

test("abrir detalhe de ambiente a partir da rede", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "E-mail" }).fill("ana.ribeiro@diel.example");
  await page.getByRole("textbox", { name: "Senha" }).fill("dev-only-change-me");
  await page.getByRole("button", { name: "LOGIN" }).click();

  await page.getByRole("button", { name: "Ver detalhes" }).first().click();

  await expect(page.getByRole("heading", { name: "Detalhe do ambiente" })).toBeVisible();
  await expect(page.getByText("Faixa de conforto")).toBeVisible();
});

test("falha de login com credenciais invalidas", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "E-mail" }).fill("ana.ribeiro@diel.example");
  await page.getByRole("textbox", { name: "Senha" }).fill("senha-invalida");
  await page.getByRole("button", { name: "LOGIN" }).click();

  await expect(page.getByText("Credenciais invalidas")).toBeVisible();
});

test("filtros e ordenacao na visao da rede", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "E-mail" }).fill("ana.ribeiro@diel.example");
  await page.getByRole("textbox", { name: "Senha" }).fill("dev-only-change-me");
  await page.getByRole("button", { name: "LOGIN" }).click();

  const searchResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/stores?") &&
      response.url().includes("search=Tijuca") &&
      response.status() === 200,
  );
  await page.getByTestId("store-search").fill("Tijuca");
  await searchResponse;
  await expect(page.getByText("Loja Tijuca", { exact: true })).toBeVisible();

  const sortResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/stores?") &&
      response.url().includes("sortBy=comfortPercent") &&
      response.url().includes("sortDir=desc") &&
      response.status() === 200,
  );
  await page.getByTestId("store-sort-by").selectOption("comfortPercent");
  await page.getByTestId("store-sort-dir").selectOption("desc");
  await sortResponse;

  const statusResponse = page.waitForResponse(
    (response) => response.url().includes("/stores?") && response.url().includes("status=FORA_FAIXA") && response.status() === 200,
  );
  await page.getByTestId("store-status").selectOption("FORA_FAIXA");
  await statusResponse;
});

test("layout responsivo em viewport mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("textbox", { name: "E-mail" }).fill("ana.ribeiro@diel.example");
  await page.getByRole("textbox", { name: "Senha" }).fill("dev-only-change-me");
  await page.getByRole("button", { name: "LOGIN" }).click();

  await expect(page.getByRole("heading", { name: "Visao da rede" })).toBeVisible();
  await page.getByRole("button", { name: "Ver detalhes" }).first().click();
  await expect(page.getByRole("heading", { name: "Detalhe do ambiente" })).toBeVisible();
  await expect(page.getByText("Temperatura interna x externa")).toBeVisible();
});
