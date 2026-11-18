import { test, expect } from "@playwright/test";
test("le test Gmail est absent du build comptable et n’emprunte pas son repli hors ligne", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("./");
  await expect(page.locator(".metric-value").last()).toHaveText("0");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Se connecter à Google" }),
  ).toHaveCount(0);
  expect(
    await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content"),
  ).toContain("connect-src 'none'");
  await context.setOffline(true);
  const diagnostic = await context.newPage();
  let unavailable = false;
  try {
    const response = await diagnostic.goto(
      new URL("gmail-prototype/", baseURL).href,
    );
    unavailable = !response?.ok();
  } catch {
    unavailable = true;
  }
  expect(unavailable).toBe(true);
  await diagnostic.close();
  await page.reload();
  await expect(page.locator(".metric-value").last()).toHaveText("0");
  await expect(
    page.getByText("Mode hors ligne", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});
