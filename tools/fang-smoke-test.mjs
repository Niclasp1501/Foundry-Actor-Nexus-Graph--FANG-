#!/usr/bin/env node

/**
 * FANG smoke test for Foundry VTT (v13/v14).
 *
 * Default target:
 *   https://dnd.niclex.de
 *   user: dm
 *   password: dm!
 *
 * You can override with env vars or CLI flags:
 *   FANG_BASE_URL, FANG_USER, FANG_PASSWORD, FANG_HEADLESS, FANG_TIMEOUT_MS
 *   --url, --user, --password, --headless, --timeout
 *
 * Example:
 *   node tools/fang-smoke-test.mjs --url https://dnd.niclex.de --user dm --password "dm!" --headless false
 */

const DEFAULTS = {
  url: process.env.FANG_BASE_URL || "https://dnd.niclex.de",
  user: process.env.FANG_USER || "dm",
  password: process.env.FANG_PASSWORD || "dm!",
  headless: (process.env.FANG_HEADLESS || "true").toLowerCase() !== "false",
  timeoutMs: Number(process.env.FANG_TIMEOUT_MS || 30000)
};

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function parseBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const v = String(value).toLowerCase().trim();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("Missing dependency: playwright");
    console.error("Install first: npm i -D playwright");
    process.exit(2);
  }
}

async function waitForGameReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    return !!(globalThis.game && globalThis.game.ready && globalThis.ui);
  }, { timeout: timeoutMs });
}

async function selectUserIfPresent(page, username) {
  const userSelect = page.locator("select[name='userid']");
  if (await userSelect.count()) {
    const options = await userSelect.locator("option").allTextContents();
    const match = options.find((t) => t.trim().toLowerCase() === username.toLowerCase());
    if (match) {
      await userSelect.selectOption({ label: match.trim() });
      return true;
    }
    // Fallback: try selecting by value (some worlds use user IDs only)
    try {
      await userSelect.selectOption(username);
      return true;
    } catch {
      // no-op
    }
  }

  // Alternative user picker layout (clickable user list)
  const userButton = page.locator(".user-list [data-user-name], .players .player");
  if (await userButton.count()) {
    const count = await userButton.count();
    for (let i = 0; i < count; i++) {
      const candidate = userButton.nth(i);
      const text = (await candidate.textContent())?.trim().toLowerCase() || "";
      if (text.includes(username.toLowerCase())) {
        await candidate.click();
        return true;
      }
    }
  }
  return false;
}

async function loginIfNeeded(page, username, password, timeoutMs) {
  // Wait briefly; if no password field appears we assume active session.
  const passwordField = page.locator("input[name='password'], input[type='password']");
  const hasPasswordField = await passwordField.first().isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasPasswordField) return { needed: false, success: true };

  await selectUserIfPresent(page, username);
  await passwordField.first().fill(password);

  const submit = page.locator(
    "button[type='submit'], button:has-text('Join Game Session'), button:has-text('Spiel beitreten'), button:has-text('Join')"
  );
  if (await submit.count()) {
    await submit.first().click();
  } else {
    await passwordField.first().press("Enter");
  }

  await waitForGameReady(page, timeoutMs);
  return { needed: true, success: true };
}

async function run() {
  const config = {
    url: argValue("--url", DEFAULTS.url),
    user: argValue("--user", DEFAULTS.user),
    password: argValue("--password", DEFAULTS.password),
    headless: parseBool(argValue("--headless", undefined), DEFAULTS.headless),
    timeoutMs: Number(argValue("--timeout", DEFAULTS.timeoutMs))
  };

  const { chromium } = await loadPlaywright();

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });

  const report = {
    config: { ...config, password: "***" },
    checks: [],
    meta: {}
  };

  let failed = false;
  const check = (name, ok, detail = "") => {
    report.checks.push({ name, ok, detail });
    if (!ok) failed = true;
  };

  try {
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
    const login = await loginIfNeeded(page, config.user, config.password, config.timeoutMs);
    await waitForGameReady(page, config.timeoutMs);

    const meta = await page.evaluate(() => {
      const mod = game.modules.get("fang");
      return {
        foundryVersion: game.version || game.release?.version || "unknown",
        worldId: game.world?.id || "unknown",
        systemId: game.system?.id || "unknown",
        fangInstalled: !!mod,
        fangActive: !!mod?.active,
        fangApiToggle: typeof mod?.api?.toggleGraph === "function"
      };
    });
    report.meta = { ...meta, loginNeeded: login.needed };

    check("FANG installed", meta.fangInstalled, "Module present in game.modules");
    check("FANG active", meta.fangActive, "Module enabled in world");
    check("FANG API toggleGraph", meta.fangApiToggle, "module.api.toggleGraph is callable");

    if (meta.fangApiToggle) {
      await page.evaluate(() => game.modules.get("fang")?.api?.toggleGraph?.());
      await page.waitForSelector("#fang-app, .fang-app-window", { timeout: config.timeoutMs });
      check("FANG window opens", true, "Graph window selector detected");
    } else {
      check("FANG window opens", false, "toggleGraph API missing");
    }

    // Trigger ActorDirectory render to validate FANG directory button injection.
    await page.evaluate(() => ui.actors?.render?.(true));
    await page.waitForTimeout(700);
    const hasActorButton = await page.evaluate(() => !!document.querySelector("#fang-btn"));
    check("Actor Directory FANG button", hasActorButton, "#fang-btn injected");

    check("No console/page errors", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
  } catch (err) {
    failed = true;
    report.fatal = err?.stack || String(err);
    try {
      await page.screenshot({ path: "tools/fang-smoke-failure.png", fullPage: true });
      report.screenshot = "tools/fang-smoke-failure.png";
    } catch {
      // no-op
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
}

run();
