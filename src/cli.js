#!/usr/bin/env node
"use strict";

const {
  CACHE_PATH,
  readCache,
  readOrchestratorSettings,
  writeCache,
  refreshQuotaCache,
  spawnBackgroundRefresh,
  mergeQuotas,
} = require("./quota");
const { TOKEN_CACHE_PATH, getAccessToken } = require("./token");
const {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  readConfig,
  writeConfig,
  resetConfig,
  cleanupStaleTempFiles,
} = require("./config");
const { renderHud, formatResetCountdown } = require("./render");
const {
  AGY_SETTINGS_PATH,
  ensureStatusLineConfigured,
  uninstallStatusLine,
} = require("./installer");

function readStdin(timeoutMs = 250) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    const chunks = [];
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(done, timeoutMs);
    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

async function handleStatusline() {
  const raw = await readStdin(250);
  let payload = {};
  if (raw && raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
  }

  const nowMs = Date.now();
  let cache = readCache();
  const cacheAgeMs = cache?.fetchedAt ? Math.max(0, nowMs - cache.fetchedAt) : Infinity;
  const prevState = String(cache?.lastAgentState || "").toLowerCase();
  const currState = String(payload?.agent_state || "idle").toLowerCase();
  const version = payload?.version || cache?.version || "";

  const hasAllGroups =
    cache?.buckets &&
    Boolean(cache.buckets["gemini-weekly"] || cache.buckets["gemini-5h"]) &&
    Boolean(cache.buckets["3p-weekly"] || cache.buckets["3p-5h"]) &&
    Boolean(cache.buckets["gemini-argon-wtu-weekly"]);

  const justReturnedToIdle = Boolean(prevState && prevState !== "idle" && currState === "idle");

  // Inline fast refresh when:
  // 1) Cache is missing or missing the full 3-group bucket set
  // 2) Agent just transitioned from active -> idle and cache is > 3s old
  // 3) Cache is older than 45s
  if (!hasAllGroups || (justReturnedToIdle && cacheAgeMs > 3_000) || cacheAgeMs > 45_000) {
    const updated = await refreshQuotaCache({
      timeoutMs: 950,
      force: true,
      version,
    });
    if (updated) cache = updated;
  } else {
    // Non-blocking background refresh every 6s while working, or every 15s while idle
    const thresholdMs = currState !== "idle" ? 6_000 : 15_000;
    if (cacheAgeMs > thresholdMs) {
      spawnBackgroundRefresh(__filename, version);
    }
  }

  if (currState && currState !== prevState) {
    cache = writeCache({ lastAgentState: currState, version });
  }

  const config = readConfig();
  const modelText = String(payload?.model?.display_name || payload?.model?.id || "").toLowerCase();
  const orchestratorConfig = modelText.includes("orchestrator") ? readOrchestratorSettings() : null;
  const merged = mergeQuotas(cache, payload?.quota, Date.now());
  const output = renderHud(payload, merged, Date.now(), { config, orchestratorConfig });
  process.stdout.write(`${output}\n`);
}

async function handleHookSessionStart() {
  await readStdin(100);
  cleanupStaleTempFiles();
  ensureStatusLineConfigured({ force: false });
  spawnBackgroundRefresh(__filename);
  process.stdout.write("{}\n");
}

async function handleHookPost() {
  // Drain stdin quickly, ensure statusLine is wired, and trigger non-blocking background refresh
  await readStdin(100);
  ensureStatusLineConfigured({ force: false });
  spawnBackgroundRefresh(__filename);
  process.stdout.write("{}\n");
}

async function handleHookStop() {
  await readStdin(100);
  await refreshQuotaCache({ timeoutMs: 1100, force: true });
  process.stdout.write(JSON.stringify({ decision: "stop" }) + "\n");
}

async function handleRefresh() {
  const version = process.argv[3] || "";
  await refreshQuotaCache({ timeoutMs: 3500, force: false, version });
}

async function handleInstall() {
  cleanupStaleTempFiles();
  const res = ensureStatusLineConfigured({ force: true });
  await refreshQuotaCache({ timeoutMs: 3500, force: true });
  console.log("✔ agy-quota-live configured in Antigravity CLI!");
  console.log(`  settings.json:      ${res.settingsPath}`);
  console.log(`  statusLine.command: ${res.command}`);
}

async function handleUninstall() {
  const res = uninstallStatusLine();
  console.log(
    res.removed
      ? `✔ Removed agy-quota-live from ${res.settingsPath}`
      : `ℹ statusLine in ${res.settingsPath} was not pointing to agy-quota-live`
  );
}

function parseBoolArg(val) {
  const lower = String(val || "").toLowerCase();
  if (lower === "true" || lower === "1" || lower === "on" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "off" || lower === "no") return false;
  return null;
}

function handleConfig() {
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  if (!arg1 || arg1 === "show") {
    const cfg = readConfig();
    console.log("=== agy-quota-live Config ===");
    console.log(`Config Path:     ${CONFIG_PATH}`);
    console.log(`layout:          ${cfg.layout}  (2line | 3line)`);
    console.log(`showGroupModels: ${cfg.showGroupModels}  (auto | always | never)`);
    console.log(`smoothBars:      ${cfg.smoothBars}  (true | false)`);
    console.log(`showTelemetry:   ${cfg.showTelemetry}  (true | false)`);
    console.log("");
    console.log("Update with: node src/cli.js config <key> <value>");
    console.log("Reset with:  node src/cli.js config reset");
    return;
  }

  if (arg1.toLowerCase() === "reset") {
    const reset = resetConfig();
    console.log(`✔ Reset config at ${CONFIG_PATH} to defaults:`);
    console.log(JSON.stringify(reset, null, 2));
    return;
  }

  const key = arg1;
  if (arg2 === undefined) {
    console.error(`Missing value for "${key}". Run "node src/cli.js config" to see valid values.`);
    process.exitCode = 1;
    return;
  }

  if (key === "layout") {
    const val = String(arg2).toLowerCase();
    if (val !== "2line" && val !== "3line") {
      console.error(`Invalid layout "${arg2}". Use "2line" or "3line".`);
      process.exitCode = 1;
      return;
    }
    const updated = writeConfig({ layout: val });
    console.log(`✔ layout = ${updated.layout} (saved to ${CONFIG_PATH})`);
    return;
  }

  if (key === "showGroupModels") {
    const val = String(arg2).toLowerCase();
    if (val !== "auto" && val !== "always" && val !== "never") {
      console.error(`Invalid showGroupModels "${arg2}". Use "auto", "always", or "never".`);
      process.exitCode = 1;
      return;
    }
    const updated = writeConfig({ showGroupModels: val });
    console.log(`✔ showGroupModels = ${updated.showGroupModels} (saved to ${CONFIG_PATH})`);
    return;
  }

  if (key === "smoothBars" || key === "showTelemetry") {
    const boolVal = parseBoolArg(arg2);
    if (boolVal === null) {
      console.error(`Invalid boolean "${arg2}" for ${key}. Use true or false.`);
      process.exitCode = 1;
      return;
    }
    const updated = writeConfig({ [key]: boolVal });
    console.log(`✔ ${key} = ${updated[key]} (saved to ${CONFIG_PATH})`);
    return;
  }

  console.error(
    `Unknown config key "${key}". Valid keys: ${Object.keys(DEFAULT_CONFIG).join(", ")}`
  );
  process.exitCode = 1;
}

async function handleDoctor() {
  cleanupStaleTempFiles(undefined, 0);
  const token = getAccessToken({ forceRefresh: false });
  const cache = await refreshQuotaCache({ timeoutMs: 3500, force: true });
  const config = readConfig();
  const orchestratorConfig = readOrchestratorSettings();
  const nowMs = Date.now();
  const buckets = cache?.buckets || {};

  console.log("=== agy-quota-live Status ===");
  console.log(`OAuth Token:   ${token ? `OK (${token.length} chars)` : "MISSING"}`);
  console.log(`CLI Version:   ${cache?.version || "unknown"}`);
  console.log(`Settings Path: ${AGY_SETTINGS_PATH}`);
  console.log(`Config Path:   ${CONFIG_PATH} (layout=${config.layout}, models=${config.showGroupModels})`);
  console.log(`Token Cache:   ${TOKEN_CACHE_PATH}`);
  console.log(`Quota Cache:   ${CACHE_PATH}`);
  console.log(
    `Last Sync:     ${cache?.fetchedAt ? new Date(cache.fetchedAt).toISOString() : "never"}`
  );
  console.log("");
  console.log("Buckets & Models (/quota):");
  const seenGroups = new Set();
  for (const b of Object.values(buckets).sort((a, c) => (a.order || 99) - (c.order || 99))) {
    if (!seenGroups.has(b.groupKey)) {
      seenGroups.add(b.groupKey);
      const modelsStr =
        Array.isArray(b.groupModels) && b.groupModels.length > 0 ? b.groupModels.join(", ") : "";
      console.log(`  [${b.groupTitle}]${modelsStr ? ` (${modelsStr})` : ""}`);
    }
    const resetIn = formatResetCountdown(b.resetTime, nowMs);
    const statusText = b.disabled
      ? "disabled"
      : `${b.remainingPct}% remaining (${(b.remainingFraction * 100).toFixed(2)}%) | resets in ${resetIn} (${b.resetTime})`;
    console.log(`    - ${b.id} (${b.shortWindow}): ${statusText}`);
  }

  const samplePayload = {
    model: { display_name: "Gemini 4 Hydrogen (XHigh)", id: "gemini-4-hydrogen-xhigh", effort: "xhigh" },
    plan_tier: "Google AI Pro",
    cycle_mode: "auto",
    context_window: {
      total_input_tokens: 58400,
      context_window_size: 1048576,
      used_percentage: 6,
    },
    cwd: process.cwd(),
    agent_state: "idle",
    terminal_width: 140,
  };
  const merged = mergeQuotas(cache, {}, nowMs);
  console.log(`\nPreview (${config.layout} HUD @ 140 cols):`);
  console.log(renderHud(samplePayload, merged, nowMs, { config, orchestratorConfig }));
}

async function main() {
  const cmd = (process.argv[2] || "statusline").toLowerCase();
  if (cmd === "refresh") {
    await handleRefresh();
    return;
  }
  if (cmd === "hook-session-start") {
    await handleHookSessionStart();
    return;
  }
  if (cmd === "hook-post") {
    await handleHookPost();
    return;
  }
  if (cmd === "hook-stop") {
    await handleHookStop();
    return;
  }
  if (cmd === "install" || cmd === "setup") {
    await handleInstall();
    return;
  }
  if (cmd === "uninstall") {
    await handleUninstall();
    return;
  }
  if (cmd === "config") {
    handleConfig();
    return;
  }
  if (cmd === "status" || cmd === "doctor") {
    await handleDoctor();
    return;
  }
  await handleStatusline();
}

main().catch(() => {
  // Never crash statusline or hooks
  const cmd = (process.argv[2] || "statusline").toLowerCase();
  if (cmd === "hook-session-start" || cmd === "hook-post") {
    process.stdout.write("{}\n");
  } else if (cmd === "hook-stop") {
    process.stdout.write(JSON.stringify({ decision: "stop" }) + "\n");
  }
});
