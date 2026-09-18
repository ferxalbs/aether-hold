import { expect, type Page, test } from "@playwright/test";

async function waitForHydration(page: Page) {
  await page.waitForFunction(() => document.querySelector("#draft")?.getAttribute("data-hydrated") === "true");
}

test.describe("HOLD critical flow", () => {
  test("shows the judge surface and sends a clear draft once", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Should this be sent\?/i })).toBeVisible();
    await expect(page.getByLabel("Your draft Required")).toBeVisible();
    await waitForHydration(page);
    await page.screenshot({ path: testInfo.outputPath("hold-initial-desktop.png"), fullPage: true });

    await page
      .getByLabel("Your draft Required")
      .fill(
        "Hi team, the release is ready for review. Please add comments by Friday so we can decide on the launch date.",
      );
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/evaluate"));
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    const response = await responsePromise;
    expect(response.request().method()).toBe("POST");
    await expect(page.getByRole("heading", { name: "SEND" })).toBeVisible();
    await expect(page.getByText("No threshold was triggered.")).toBeVisible();
    await expect(page.getByTestId("development-simulation")).toHaveText("Development simulation");
    await expect(page.getByText("Usage")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-send-desktop.png"), fullPage: true });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download card/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^hold-send-card\.(png|svg)$/);
  });

  test("makes rewrite, hold, and block states reachable", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("button", { name: /Aggressive sales email/i }).click();
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "REWRITE" })).toBeVisible();

    await page.getByRole("button", { name: /(Judge another|Try another)/i }).click();
    await page.getByRole("button", { name: /(Hostile|Frustrated) support reply/i }).click();
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "BLOCK" })).toBeVisible();

    await page.getByRole("button", { name: /(Judge another|Try another)/i }).click();
    await page.getByRole("button", { name: /Vague social post/i }).click();
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "REWRITE" })).toBeVisible();

    await page.getByRole("button", { name: /(Judge another|Try another)/i }).click();
    await page
      .getByLabel("Your draft Required")
      .fill("According to the latest research, this change will save 40% of the team's time.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "HOLD", exact: true })).toBeVisible();
  });

  test("renders a usable mobile layout and respects reduced motion", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: /Should this be sent\?/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-initial-mobile.png"), fullPage: true });
    const animationDuration = await page
      .locator(".hero h1")
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(animationDuration)).toBeLessThan(0.001);
  });

  test("surfaces provider failure without exposing an exception", async ({ page }) => {
    await page.route("**/api/evaluate", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "EVALUATION_FAILED",
          message: "HOLD could not complete this judgment. Please try again.",
          retryable: true,
        }),
      }),
    );
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("A draft that should fail safely.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "HOLD could not complete this judgment" })).toHaveText(
      "HOLD could not complete this judgment. Please try again.",
    );
    await expect(page.getByText(/TypeSafeError|stack trace/i)).toHaveCount(0);
  });

  test("renders real-provider model, latency, usage, and cost without a simulation badge", async ({ page }) => {
    await page.route("**/api/evaluate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          verdict: "SEND",
          reasons: [],
          reasonLabels: [],
          signals: [
            {
              id: "clarity",
              label: "Clarity",
              value: 1,
              displayValue: "100%",
              confidence: 0.98,
            },
          ],
          policyVersion: "hold-policy-1.0.0-experimental",
          questionPackVersion: "hold-questions-1.0.0",
          model: "jev-latest",
          latencyMs: 123,
          estimatedCostUsd: 0.0018,
          usage: { inputTokens: 42_000, outputTokens: 700 },
          providerMode: "typesafe",
          experimental: true,
        }),
      }),
    );
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("Please review this clear professional draft.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "SEND" })).toBeVisible();
    await expect(page.getByText("jev-latest")).toBeVisible();
    await expect(page.getByText("123 ms")).toBeVisible();
    await expect(page.getByText("42,000 in · 700 out")).toBeVisible();
    await expect(page.getByText("$0.0018 est.")).toBeVisible();
    await expect(page.getByTestId("development-simulation")).toHaveCount(0);
  });

  test("evaluates using Cmd/Ctrl+Enter keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("Please review this document before the meeting.");
    await page.keyboard.press("Meta+Enter");
    await expect(page.getByRole("heading", { name: "SEND" })).toBeVisible();
  });

  test("fits completely within a 1440x900 viewport without scrolling to reach primary action", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForHydration(page);

    // Hero must be fully visible and not clipped
    const heroBox = await page.getByRole("heading", { name: /Should this be sent\?/i }).boundingBox();
    expect(heroBox).not.toBeNull();
    expect(heroBox?.y).toBeGreaterThanOrEqual(50);
    expect(heroBox?.y).toBeLessThan(350);

    // The primary action button must be visible within the initial 900px viewport without scrolling
    const buttonBox = await page.getByRole("button", { name: /Judge before sending/i }).boundingBox();
    expect(buttonBox).not.toBeNull();
    expect((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0)).toBeLessThan(900);
  });
});
