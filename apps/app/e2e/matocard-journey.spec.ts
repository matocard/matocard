import { expect, test } from "@playwright/test";
import { connectWallet } from "./support/journey";

/**
 * A new account's first minutes, in a real browser against Monad testnet: the e2e wallet's address
 * has never been verified, so the app must say there is no card yet and offer the next step, and
 * the money screens must refuse politely rather than break. Signed flows (sign-in, top-up, sends)
 * are covered end to end by `lib/matocard/__tests__/live.test.ts`, which can sign.
 */

test("an unverified account sees no card yet and the step that opens one", async ({ page }) => {
  await connectWallet(page);
  await expect(page.getByText("Not issued yet")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Activate your card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  // Nothing to spend from, so the money actions are not offered.
  await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Top up" })).toHaveCount(0);
});

test("top up asks for verification first", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/topup");
  await expect(page.getByText("Verify your identity first")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("settle has nothing to settle for an account that never drew", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/settle");
  await expect(page.getByText("You owe", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing is owed.")).toBeVisible({ timeout: 20_000 });
});

test("the onboarding tour tells the story in rupiah, AUSD and MON", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Top up what")).toBeVisible();
  await expect(page.getByText("Rp 2.4m")).toBeVisible();
  // The tour's artwork is aria-hidden (decoration), so the marks are found by their alt text.
  for (const alt of ["IDR", "AUSD", "MON"]) {
    await expect(page.locator(`img[alt="${alt}"]`)).toHaveCount(1);
  }
});

test("send: nothing to send from yet, so the button waits", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/send");
  await expect(page.getByText("Their Matocard account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("cash out and history render for a new account", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/cashout");
  await expect(page.getByText(/in your balance/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Cash out" })).toBeDisabled();
  await page.goto("/transactions");
  await expect(page.getByRole("button", { name: "Top-ups" })).toBeVisible();
});

test("the public record needs no sign-in and reads the live chain", async ({ page }) => {
  // Siti, the demo account: three cycles repaid on time, score 55 (docs/e2e-testnet-run.md).
  await page.goto("/verify/0xc6E0De07b60a412c1bb990B77612754B9254DBDa");
  await expect(page.getByText("Credit record")).toBeVisible();
  await expect(page.getByText("Cycle 3: Repaid on time")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Score 55")).toBeVisible();
  await expect(page.getByText("111.5%")).toBeVisible();
  await expect(page.getByRole("link", { name: "Check it yourself" })).toBeVisible();
});

test("the Credit tab shows your own record and the link to share it", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/credit");
  await expect(page.getByText("Your credit record")).toBeVisible();
  await expect(page.getByText(/\/verify\/0x/)).toBeVisible({ timeout: 20_000 });
});

test("coming back from Didit lands on Home", async ({ page }) => {
  await connectWallet(page);
  await page.goto("/?verificationSessionId=e2e&status=Approved");
  await expect(page).toHaveURL(/\/home$/);
});
