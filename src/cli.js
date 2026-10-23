#!/usr/bin/env node
"use strict";

const {
  CACHE_PATH,
  readCache,
  writeCache,
  refreshQuotaCache,
  spawnBackgroundRefresh,
  mergeQuotas,
} = require("./quota");
const { TOKEN_CACHE_PATH, getAccessToken } = require("./token");
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

  const merged = mergeQuotas(cache, payload?.quota, Date.now());
  const output = renderHud(payload, merged, Date.now());
  process.stdout.write(`${output}\n`);
}

async function handleHookSessionStart() {
  await readStdin(100);
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

async function handleDoctor() {
  const token = getAccessToken({ forceRefresh: false });
  const cache = await refreshQuotaCache({ timeoutMs: 3500, force: true });
  const nowMs = Date.now();
  const buckets = cache?.buckets || {};

  console.log("=== agy-quota-live Status ===");
  console.log(`OAuth Token:   ${token ? `OK (${token.length} chars)` : "MISSING"}`);
  console.log(`Settings Path: ${AGY_SETTINGS_PATH}`);
  console.log(`Token Cache:   ${TOKEN_CACHE_PATH}`);
  console.log(`Quota Cache:   ${CACHE_PATH}`);
  console.log(
    `Last Sync:     ${cache?.fetchedAt ? new Date(cache.fetchedAt).toISOString() : "never"}`
  );
  console.log("");
  console.log("Buckets (/quota):");
  for (const b of Object.values(buckets).sort((a, c) => (a.order || 99) - (c.order || 99))) {
    const resetIn = formatResetCountdown(b.resetTime, nowMs);
    console.log(
      `  - [${b.groupTitle}] ${b.id} (${b.shortWindow}): ${b.remainingPct}% remaining (${(
        b.remainingFraction * 100
      ).toFixed(2)}%) | resets in ${resetIn} (${b.resetTime})`
    );
  }
  console.log("\nPreview (2-line HUD):");
  const samplePayload = {
    model: { display_name: "Gemini 4 Argon (High)" },
    plan_tier: "Google AI Pro",
    cycle_mode: "auto",
    context_window: {
      total_input_tokens: 42000,
      context_window_size: 200000,
      used_percentage: 21,
    },
    cwd: process.cwd(),
    agent_state: "idle",
    terminal_width: 140,
  };
  const merged = mergeQuotas(cache, {}, nowMs);
  console.log(renderHud(samplePayload, merged, nowMs));
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
