"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[38;5;75m",
  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  red: "\x1b[31;1m",
  magenta: "\x1b[35m",
  muted: "\x1b[90m",
  white: "\x1b[97m",
};

// Strip ANSI escape codes to measure visible terminal columns
function stripAnsi(str) {
  return String(str || "").replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(str) {
  return Array.from(stripAnsi(str)).length;
}

// Truncate string with ANSI sequences to max visible columns cleanly
function fitToWidth(str, maxWidth) {
  if (!maxWidth || maxWidth <= 0) return str;
  if (visibleLength(str) <= maxWidth) return str;

  const target = Math.max(1, maxWidth - 1);
  let visible = 0;
  let out = "";
  let i = 0;
  while (i < str.length && visible < target) {
    if (str[i] === "\x1b" && str[i + 1] === "[") {
      const end = str.indexOf("m", i);
      if (end !== -1) {
        out += str.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    const codePoint = str.codePointAt(i);
    const ch = String.fromCodePoint(codePoint);
    out += ch;
    i += ch.length;
    visible += 1;
  }
  return `${out}…${ANSI.reset}`;
}

function colorForRemainingPct(pct) {
  if (pct <= 10) return ANSI.red;
  if (pct <= 25) return ANSI.orange;
  if (pct <= 50) return ANSI.yellow;
  return ANSI.green;
}

function colorForUsedPct(usedPct) {
  if (usedPct >= 85) return ANSI.red;
  if (usedPct >= 70) return ANSI.orange;
  if (usedPct >= 50) return ANSI.yellow;
  return ANSI.green;
}

function renderBar(pct, width, fillColor) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  return `${fillColor}${"█".repeat(filled)}${ANSI.muted}${"░".repeat(empty)}${ANSI.reset}`;
}

function formatResetCountdown(resetTimeIso, nowMs = Date.now()) {
  if (!resetTimeIso || typeof resetTimeIso !== "string") return "";
  const targetMs = Date.parse(resetTimeIso);
  if (!Number.isFinite(targetMs)) return "";
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  if (diffSec <= 0) return "ahora";

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (days > 0) {
    return `${days}d${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h${String(mins).padStart(2, "0")}m`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return `${diffSec}s`;
}

function formatCompactTokens(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(Math.round(n));
}

function resolveGitBranch(payload) {
  if (payload?.vcs?.branch && typeof payload.vcs.branch === "string") {
    return payload.vcs.branch.trim();
  }
  const startDir =
    payload?.workspace?.current_dir ||
    payload?.workspace?.project_dir ||
    payload?.cwd ||
    process.cwd();
  if (!startDir || typeof startDir !== "string") return "";

  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 6; depth++) {
    const headPath = path.join(dir, ".git", "HEAD");
    try {
      if (fs.existsSync(headPath)) {
        const content = fs.readFileSync(headPath, "utf8").trim();
        if (content.startsWith("ref: refs/heads/")) {
          return content.slice("ref: refs/heads/".length).trim();
        }
        if (/^[0-9a-f]{7,40}$/i.test(content)) {
          return content.slice(0, 7);
        }
      }
    } catch {
      // ignore
    }
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return "";
}

function formatModelName(rawModel) {
  const raw = String(rawModel || "Gemini").trim();
  let clean = raw
    .replace(/\bThinking\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > 26) {
    clean = `${clean.slice(0, 24).trim()}…`;
  }
  return clean || "Gemini";
}

function formatTierBadge(rawTier) {
  if (!rawTier || typeof rawTier !== "string") return "";
  const lower = rawTier.toLowerCase();
  if (lower.includes("ultra")) return "Ultra";
  if (lower.includes("pro")) return "Pro";
  if (lower.includes("free") || lower.includes("standard")) return "Free";
  return rawTier.replace(/^Google\s+AI\s+/i, "").trim();
}

function formatCycleMode(rawMode) {
  if (!rawMode || typeof rawMode !== "string") return "";
  const mode = rawMode.trim().toLowerCase();
  if (!mode || mode === "default" || mode === "normal") return "";
  if (mode === "plan") return `${ANSI.magenta}[Plan]${ANSI.reset}`;
  if (mode === "auto") return `${ANSI.cyan}[Auto]${ANSI.reset}`;
  if (mode.includes("accept") || mode.includes("edit")) return `${ANSI.yellow}[Edit]${ANSI.reset}`;
  return `${ANSI.cyan}[${rawMode.trim()}]${ANSI.reset}`;
}

function detectActiveGroupKey(rawModel) {
  const lower = String(rawModel || "").toLowerCase();
  if (lower.includes("argon")) return "argon";
  if (lower.includes("claude") || lower.includes("opus") || lower.includes("sonnet") || lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) {
    return "3p";
  }
  return "gemini";
}

function renderAgentState(rawState) {
  const s = String(rawState || "idle").trim().toLowerCase();
  if (s === "idle" || s === "") {
    return `${ANSI.green}● Idle${ANSI.reset}`;
  }
  if (s.includes("think")) {
    return `${ANSI.brightCyan}◐ Thinking${ANSI.reset}`;
  }
  if (s.includes("tool") || s.includes("exec") || s.includes("work") || s.includes("run")) {
    return `${ANSI.yellow}⚙ Working${ANSI.reset}`;
  }
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `${ANSI.brightCyan}◐ ${label}${ANSI.reset}`;
}

function renderLine1(payload, quotaResult, width) {
  const sep = ` ${ANSI.muted}│${ANSI.reset} `;
  const modelDisplay = payload?.model?.display_name || payload?.model?.id || "Gemini";
  const modelName = formatModelName(modelDisplay);
  const tier = formatTierBadge(payload?.plan_tier);
  const tierStr = tier ? ` ${ANSI.cyan}[${tier}]${ANSI.reset}` : "";
  const modeStr = formatCycleMode(payload?.cycle_mode);
  const modePart = modeStr ? ` ${modeStr}` : "";

  const modelSegment = `${ANSI.bold}${ANSI.blue}◆ ${modelName}${ANSI.reset}${tierStr}${modePart}`;

  // Context segment
  const cw = payload?.context_window || {};
  const inputTokens =
    typeof cw.total_input_tokens === "number" && cw.total_input_tokens > 0
      ? cw.total_input_tokens
      : 0;
  const windowSize =
    typeof cw.context_window_size === "number" && cw.context_window_size > 0
      ? cw.context_window_size
      : 0;
  const usedPct =
    typeof cw.used_percentage === "number" && Number.isFinite(cw.used_percentage)
      ? Math.round(cw.used_percentage)
      : windowSize > 0
      ? Math.round((inputTokens / windowSize) * 100)
      : 0;
  const ctxColor = colorForUsedPct(usedPct);
  const ctxBar = renderBar(usedPct, 8, ctxColor);
  const tokenDetail =
    windowSize > 0
      ? ` ${ANSI.muted}(${formatCompactTokens(inputTokens)}/${formatCompactTokens(windowSize)})${ANSI.reset}`
      : "";
  const ctxSegmentFull = `Ctx ${ctxBar} ${ctxColor}${usedPct}%${ANSI.reset}${tokenDetail}`;
  const ctxSegmentShort = `Ctx ${ctxColor}${usedPct}%${ANSI.reset}`;

  // Workspace + Git segment
  const rawDir = payload?.workspace?.current_dir || payload?.cwd || "";
  const dirName = rawDir ? path.basename(path.resolve(String(rawDir))) : "";
  const branch = resolveGitBranch(payload);
  let wsParts = [];
  if (dirName) wsParts.push(`${ANSI.yellow}${dirName}${ANSI.reset}`);
  if (branch) wsParts.push(`${ANSI.magenta}⎇ ${branch}${ANSI.reset}`);
  const wsSegment = wsParts.join(" ");

  // State + Cost + Live badge
  const stateStr = renderAgentState(payload?.agent_state);
  const usd = payload?.cost?.total_usd;
  const costStr =
    typeof usd === "number" && Number.isFinite(usd) && usd > 0
      ? ` ${ANSI.cyan}${usd >= 0.01 ? `$${usd.toFixed(2)}` : `<$0.01`}${ANSI.reset}`
      : "";
  const syncAgeSec =
    quotaResult?.cacheAgeMs !== undefined && Number.isFinite(quotaResult.cacheAgeMs)
      ? Math.floor(quotaResult.cacheAgeMs / 1000)
      : null;
  const syncBadge =
    syncAgeSec !== null && syncAgeSec <= 30
      ? ` ${ANSI.green}⚡${ANSI.reset}`
      : syncAgeSec !== null
      ? ` ${ANSI.muted}${syncAgeSec}s${ANSI.reset}`
      : "";
  const stateSegment = `${stateStr}${costStr}${syncBadge}`;

  const candidates = [
    [modelSegment, ctxSegmentFull, wsSegment, stateSegment].filter(Boolean).join(sep),
    [modelSegment, ctxSegmentShort, wsSegment, stateSegment].filter(Boolean).join(sep),
    [modelSegment, ctxSegmentShort, stateSegment].filter(Boolean).join(sep),
    [modelSegment, stateSegment].filter(Boolean).join(sep),
  ];

  for (const line of candidates) {
    if (visibleLength(line) <= width) {
      return line;
    }
  }
  return fitToWidth(candidates[candidates.length - 1], width);
}

function formatBucketItem(bucket, { barWidth = 4, showReset = true, nowMs = Date.now() } = {}) {
  const pct =
    typeof bucket.remainingPct === "number"
      ? bucket.remainingPct
      : Math.round((bucket.remainingFraction || 0) * 100);
  const color = colorForRemainingPct(pct);
  const bar = barWidth > 0 ? `${renderBar(pct, barWidth, color)} ` : "";
  const countdown = showReset ? formatResetCountdown(bucket.resetTime, nowMs) : "";
  const resetPart = countdown ? ` ${ANSI.muted}(${countdown})${ANSI.reset}` : "";
  return `${ANSI.white}${bucket.shortWindow}${ANSI.reset} ${bar}${color}${pct}%${ANSI.reset}${resetPart}`;
}

function renderLine2(payload, quotaResult, width, nowMs = Date.now()) {
  const bucketsMap = quotaResult?.buckets || {};
  const list = Object.values(bucketsMap).sort((a, b) => (a.order || 99) - (b.order || 99));

  if (list.length === 0) {
    return `${ANSI.muted}Cuotas /quota: sincronizando en tiempo real…${ANSI.reset}`;
  }

  const activeGroup = detectActiveGroupKey(payload?.model?.display_name || payload?.model?.id || "");

  // Group buckets by groupKey preserving order (gemini -> 3p -> argon -> any other)
  const groupsOrder = [];
  const groupsMap = new Map();
  for (const b of list) {
    const gKey = b.groupKey || "other";
    if (!groupsMap.has(gKey)) {
      groupsMap.set(gKey, {
        key: gKey,
        shortGroup: b.shortGroup || gKey,
        buckets: [],
      });
      groupsOrder.push(gKey);
    }
    groupsMap.get(gKey).buckets.push(b);
  }

  const buildLine = ({ barWidth, showReset, ultraShortLabels }) => {
    const groupSep = ` ${ANSI.muted}│${ANSI.reset} `;
    const bucketSep = ` ${ANSI.muted}·${ANSI.reset} `;

    const renderedGroups = groupsOrder.map((gKey) => {
      const g = groupsMap.get(gKey);
      const isActive = gKey === activeGroup;
      let label = g.shortGroup;
      if (ultraShortLabels && label === "Claude/GPT") {
        label = "C/GPT";
      }
      const prefix = isActive
        ? `${ANSI.bold}${ANSI.brightCyan}▸${label}${ANSI.reset}`
        : `${ANSI.bold}${ANSI.cyan}${label}${ANSI.reset}`;

      const items = g.buckets.map((b) =>
        formatBucketItem(b, { barWidth, showReset, nowMs })
      );
      return `${prefix} ${items.join(bucketSep)}`;
    });

    return renderedGroups.join(groupSep);
  };

  // Try progressively more compact layouts so all 5 buckets + reset timers fit on 1 line
  const layouts = [
    { barWidth: 4, showReset: true, ultraShortLabels: false },
    { barWidth: 3, showReset: true, ultraShortLabels: true },
    { barWidth: 0, showReset: true, ultraShortLabels: true },
    { barWidth: 0, showReset: false, ultraShortLabels: true },
  ];

  for (const layout of layouts) {
    const candidate = buildLine(layout);
    if (visibleLength(candidate) <= width) {
      return candidate;
    }
  }

  return fitToWidth(buildLine(layouts[layouts.length - 1]), width);
}

function renderHud(payload, quotaResult, nowMs = Date.now()) {
  const width =
    typeof payload?.terminal_width === "number" && payload.terminal_width > 20
      ? payload.terminal_width
      : 140;
  const line1 = renderLine1(payload, quotaResult, width);
  const line2 = renderLine2(payload, quotaResult, width, nowMs);
  return `${line1}\n${line2}`;
}

module.exports = {
  renderHud,
  stripAnsi,
  visibleLength,
  formatResetCountdown,
};
