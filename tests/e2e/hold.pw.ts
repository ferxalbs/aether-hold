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

  test("makes rewrite, hold, and block states reachable", async ({ page }, testInfo) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("button", { name: /Aggressive sales email/i }).click();
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "REWRITE" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-rewrite-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: /(Judge another|Try another)/i }).click();
    await page.getByRole("button", { name: /(Hostile|Frustrated) support reply/i }).click();
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "BLOCK" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-block-desktop.png"), fullPage: true });

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
    await page.screenshot({ path: testInfo.outputPath("hold-hold-desktop.png"), fullPage: true });
  });

  test("does not send a meaningless draft", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("aaaa");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "SEND" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "REWRITE" })).toBeVisible();
  });

  test("runs conditional Evidence only after an explicit verification action", async ({ page }, testInfo) => {
    let evidenceRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/evidence") && request.method() === "POST") evidenceRequests += 1;
    });
    await page.route("**/api/evidence", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await page.goto("/");
    await waitForHydration(page);
    await page
      .getByLabel("Your draft Required")
      .fill("According to the latest research, this change will save 40% of the team's time.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "HOLD", exact: true })).toBeVisible();
    expect(evidenceRequests).toBe(0);
    const evidenceResponse = page.waitForResponse((response) => response.url().includes("/api/evidence"));
    await page.getByRole("button", { name: /Verify claims/i }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-evidence-loading.png"), fullPage: true });
    const response = await evidenceResponse;
    expect(response.request().method()).toBe("POST");
    expect(evidenceRequests).toBe(1);
    await expect(page.getByText("Evidence", { exact: true })).toBeVisible();
    await expect(page.getByText("Selected claim", { exact: true })).toBeVisible();
    await expect(page.getByText(/Evidence is insufficient|Evidence unavailable/i)).toBeVisible();
    await expect(page.getByText(/Evidence status: (INSUFFICIENT|UNAVAILABLE)/i)).toBeVisible();
    const links = await page
      .locator("a[href]")
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") || ""));
    expect(links.some((href) => href.includes("team%27s") || href.includes("research"))).toBe(false);
  });

  test("renders supported Evidence with inspectable source metadata", async ({ page }, testInfo) => {
    await page.route("**/api/evidence", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "SUPPORTED",
          claim: {
            sentenceId: "sentence-1",
            text: "The change improves recovery by 20%.",
            existenceProbability: 0.92,
            consequenceScore: 2,
            selectionConfidence: 0.86,
          },
          candidates: [
            {
              id: "source-1",
              title: "Independent study",
              url: "https://research.example/study",
              snippet: "The study reports the measured outcome.",
              source: "research.example",
              publishedDate: "2026-01-10",
              originalRank: 1,
              relevance: 0.94,
              supportsClaim: 0.91,
              contradictsClaim: 0.04,
              authoritativeSource: 0.88,
            },
          ],
          supportCount: 1,
          disputeCount: 0,
          independentDomainCount: 1,
          partialFailure: true,
          receipt: { latencyMs: 321, estimatedCostUsd: 0.0002, model: "jev-latest", requestCount: 3, provider: "test" },
          policyVersion: "hold-evidence-policy-1.0.0",
        }),
      }),
    );
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("The change improves recovery by 20%.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "HOLD", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Verify claims/i }).click();
    await expect(page.getByText("Evidence supports the claim")).toBeVisible();
    await expect(page.getByText(/Some search lanes failed/i)).toBeVisible();
    await expect(page.getByText("research.example")).toBeVisible();
    await expect(page.getByText("2026-01-10")).toBeVisible();
    await expect(page.locator('a[href="https://research.example/study"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /Include selected claim/i })).toBeVisible();
    const claimDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Include selected claim/i }).click();
    const claimDownload = await claimDownloadPromise;
    expect(claimDownload.suggestedFilename()).toMatch(/^hold-hold-card\.(png|svg)$/);
    await page.screenshot({ path: testInfo.outputPath("hold-evidence-supported.png"), fullPage: true });
  });

  test("promotes disputed Evidence to HOLD without hiding the communication verdict", async ({ page }, testInfo) => {
    await page.route("**/api/evidence", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "DISPUTED",
          claim: {
            sentenceId: "sentence-1",
            text: "The change improves recovery by 20%.",
            existenceProbability: 0.92,
            consequenceScore: 2,
            selectionConfidence: 0.86,
          },
          candidates: [],
          supportCount: 0,
          disputeCount: 1,
          independentDomainCount: 1,
          partialFailure: false,
          receipt: { latencyMs: 321, estimatedCostUsd: 0.0002, model: "jev-latest", requestCount: 3, provider: "test" },
          policyVersion: "hold-evidence-policy-1.0.0",
        }),
      }),
    );
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("The change improves recovery by 20%.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "HOLD", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Verify claims/i }).click();
    await expect(page.getByText("Evidence disputes the claim")).toBeVisible();
    await expect(page.getByText(/Evidence status: DISPUTED/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "HOLD", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-evidence-disputed.png"), fullPage: true });
  });

  test("surfaces Evidence provider failure without exposing provider output", async ({ page }) => {
    await page.route("**/api/evidence", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "EVIDENCE_FAILED",
          message: "Evidence could not be retrieved. Please try again.",
          retryable: true,
        }),
      }),
    );
    await page.goto("/");
    await waitForHydration(page);
    await page
      .getByLabel("Your draft Required")
      .fill("According to the latest research, this change will save 40% of time.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "HOLD", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Verify claims/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Evidence could not be retrieved" })).toBeVisible();
    await expect(page.getByText(/Evidence status: UNAVAILABLE/i)).toBeVisible();
    await expect(page.getByText(/TypeSafeError|stack trace|EVIDENCE_FAILED/i)).toHaveCount(0);
  });

  test("renders the method and transparency page", async ({ page }, testInfo) => {
    await page.goto("/method");
    await expect(page.getByRole("heading", { name: /deterministic pre-send judgment/i })).toBeVisible();
    await expect(page.getByText(/Active policy thresholds/i)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-method.png"), fullPage: true });
  });

  test("renders a usable mobile layout and respects reduced motion", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: /Should this be sent\?/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("hold-initial-mobile.png"), fullPage: true });
    await page
      .getByLabel("Your draft Required")
      .fill("Please review this clear professional draft before the meeting.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("heading", { name: "SEND" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
    const animationDuration = await page
      .locator(".hero h1")
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(animationDuration)).toBeLessThan(0.001);
  });

  test("supports dark theme, 200% zoom, and keyboard-only judging", async ({ page }, testInfo) => {
    // A 1280px viewport at 200% browser zoom exposes roughly 640 CSS pixels.
    await page.setViewportSize({ width: 640, height: 800 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");
    await waitForHydration(page);
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await expect(page.locator("html")).toHaveClass(/dark/);
    const draft = page.getByLabel("Your draft Required");
    await draft.focus();
    await page.keyboard.type("Please review this clear professional draft before the meeting.");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("heading", { name: "SEND" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("hold-dark-zoom-200.png"), fullPage: true });
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

  test("copies a draft-free verdict and sends only one evaluation on a double action", async ({ page }) => {
    let evaluationRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/evaluate") && request.method() === "POST") evaluationRequests += 1;
    });
    await page.addInitScript(() => {
      const state = window as Window & { __holdCopied?: string };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            state.__holdCopied = text;
          },
          readText: async () => state.__holdCopied || "",
        },
      });
    });
    await page.goto("/");
    await waitForHydration(page);
    const draft = "Hi team, the release is ready for review. Please add comments by Friday.";
    await page.getByLabel("Your draft Required").fill(draft);
    await page.getByRole("button", { name: /Judge before sending/i }).dblclick();
    await expect(page.getByRole("heading", { name: "SEND" })).toBeVisible();
    expect(evaluationRequests).toBe(1);
    await page.getByRole("button", { name: /Copy verdict/i }).click();
    await expect(page.getByText("Verdict copied to clipboard")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("HOLD verdict: SEND");
    expect(copied).not.toContain(draft);
  });

  test("renders rate-limit feedback without exposing provider details", async ({ page }) => {
    await page.route("**/api/evaluate", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "30" },
        contentType: "application/json",
        body: JSON.stringify({
          error: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          retryable: true,
        }),
      }),
    );
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Your draft Required").fill("Please review this clear professional draft.");
    await page.getByRole("button", { name: /Judge before sending/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Too many requests" })).toBeVisible();
    await expect(page.getByText(/TypeSafeError|stack trace|RATE_LIMITED/i)).toHaveCount(0);
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
          evidenceStatus: "NOT_NEEDED",
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
