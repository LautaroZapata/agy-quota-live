"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_CONFIG, normalizeConfig } = require("./config");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[38;5;75m",
  sky: "\x1b[38;5;117m",
  indigo: "\x1b[38;5;111m",
  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",
  green: "\x1b[38;5;114m",
  yellow: "\x1b[38;5;221m",
  amber: "\x1b[38;5;214m",
  orange: "\x1b[38;5;208m",
  red: "\x1b[38;5;203;1m",
  magenta: "\x1b[38;5;177m",
  pink: "\x1b[38;5;213m",
  muted: "\x1b[38;5;245m",
  track: "\x1b[38;5;239m",
  white: "\x1b[97m",
};

const SUB_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

// Strip ANSI escape codes to measure visible terminal columns
function stripAnsi(str) {
  return String(str || "").replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(str) {
  let cols = 0;
  for (const ch of stripAnsi(str)) {
    cols += ch === "⚡" ? 2 : 1;
  }
  return cols;
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

function renderBar(pct, width, fillColor, smooth = true) {
  if (!width || width <= 0) return "";
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));

  if (!smooth) {
    const filled = Math.round((clamped / 100) * width);
    const empty = Math.max(0, width - filled);
    return `${fillColor}${"█".repeat(filled)}${ANSI.track}${"░".repeat(empty)}${ANSI.reset}`;
  }

  let eighths = Math.round((clamped / 100) * width * 8);
  if (clamped > 0 && eighths === 0) {
    eighths = 1;
  }
  const fullBlocks = Math.floor(eighths / 8);
  const remEighths = eighths % 8;
  const partial = remEighths > 0 ? SUB_BLOCKS[remEighths] : "";
  const usedCells = fullBlocks + (partial ? 1 : 0);
  const emptyBlocks = Math.max(0, width - usedCells);

  return `${fillColor}${"█".repeat(fullBlocks)}${partial}${ANSI.track}${"░".repeat(emptyBlocks)}${ANSI.reset}`;
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

function normalizeEffortLabel(rawEffort) {
  const e = String(rawEffort || "").trim().toLowerCase();
  if (!e) return "";
  if (e === "xhigh" || e === "extra" || e === "extra_high" || e === "extra-high") return "XHigh";
  if (e === "max") return "Max";
  if (e === "high") return "High";
  if (e === "medium" || e === "med") return "Medium";
  if (e === "low") return "Low";
  return e.charAt(0).toUpperCase() + e.slice(1);
}

function formatModelParts(modelObj, { compact = false } = {}) {
  const rawModel =
    typeof modelObj === "string"
      ? modelObj
      : modelObj?.display_name || modelObj?.id || "Gemini";
  const rawEffort = typeof modelObj === "object" && modelObj ? modelObj.effort : "";

  let clean = String(rawModel || "Gemini")
    .trim()
    .replace(/\bThinking\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Convert slug IDs like gemini-4-hydrogen-xhigh if display_name is absent
  if (/^[a-z0-9._-]+$/i.test(clean) && clean.includes("-")) {
    const slugMap = {
      "gemini-pro-orchestrator-neon": "Orchestrator (Neon)",
      "gemini-pro-orchestrator-argon": "Orchestrator (Argon)",
      "gemini-pro-orchestrator-g1-pro": "Orchestrator (Argon)",
      "gemini-pro-orchestrator": "Orchestrator",
    };
    const lowerSlug = clean.toLowerCase();
    if (slugMap[lowerSlug]) {
      clean = slugMap[lowerSlug];
    } else if (lowerSlug.startsWith("gemini-") || lowerSlug.startsWith("claude-") || lowerSlug.startsWith("gpt-")) {
      const parts = clean.split("-");
      const maybeEffort = normalizeEffortLabel(parts[parts.length - 1]);
      if (["Low", "Medium", "High", "XHigh", "Max"].includes(maybeEffort)) {
        clean = `${parts
          .slice(0, -1)
          .map((p) => (p.toUpperCase() === "GPT" || p.toUpperCase() === "OSS" ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
          .join(" ")} (${maybeEffort})`;
      }
    }
  }

  // Extract trailing effort/planner tag in parentheses
  let base = clean;
  let suffix = "";
  const parenMatch = clean.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    base = parenMatch[1].trim();
    suffix = parenMatch[2].trim();
  }

  if (!suffix && rawEffort) {
    suffix = normalizeEffortLabel(rawEffort);
  }

  if (compact) {
    base = base.replace(/^Gemini\s+4\s+/i, "G4 ").replace(/^Gemini\s+/i, "G ").replace(/^Orchestrator$/i, "Orch");
    if (suffix === "Medium") suffix = "Med";
    if (suffix === "Orchestrator") suffix = "Orch";
  }

  const maxTotal = compact ? 20 : 28;
  const suffixLen = suffix ? suffix.length + 3 : 0;
  if (base.length + suffixLen > maxTotal) {
    const allowedBase = Math.max(8, maxTotal - suffixLen - 1);
    if (base.length > allowedBase) {
      base = `${base.slice(0, allowedBase).trim()}…`;
    }
  }

  return {
    base: base || "Gemini",
    suffix,
  };
}

function renderModelName(modelObj, options) {
  const { base, suffix } = formatModelParts(modelObj, options);
  const lowerSuffix = suffix.toLowerCase();
  const suffixColor =
    lowerSuffix === "xhigh" || lowerSuffix === "max"
      ? ANSI.pink
      : lowerSuffix === "high"
      ? ANSI.sky
      : lowerSuffix === "orch" || lowerSuffix === "orchestrator"
      ? ANSI.amber
      : ANSI.muted;
  const suffixPart = suffix ? ` ${suffixColor}(${suffix})${ANSI.reset}` : "";
  return `${ANSI.bold}${ANSI.blue}◆ ${base}${ANSI.reset}${suffixPart}`;
}

function formatTierBadge(rawTier) {
  if (!rawTier || typeof rawTier !== "string") return { label: "", color: ANSI.indigo };
  const lower = rawTier.toLowerCase();
  if (lower.includes("ultra")) return { label: "Ultra", color: ANSI.pink };
  if (lower.includes("pro")) return { label: "Pro", color: ANSI.indigo };
  if (lower.includes("free") || lower.includes("standard")) return { label: "Free", color: ANSI.muted };
  return { label: rawTier.replace(/^Google\s+AI\s+/i, "").trim(), color: ANSI.indigo };
}

function formatCycleMode(rawMode) {
  if (!rawMode || typeof rawMode !== "string") return "";
  const mode = rawMode.trim().toLowerCase();
  if (!mode || mode === "default" || mode === "normal") return "";
  if (mode === "plan") return `${ANSI.magenta}[Plan]${ANSI.reset}`;
  if (mode === "auto") return `${ANSI.amber}[Auto]${ANSI.reset}`;
  if (mode.includes("accept") || mode.includes("edit")) return `${ANSI.orange}[Edit]${ANSI.reset}`;
  return `${ANSI.cyan}[${rawMode.trim()}]${ANSI.reset}`;
}

function formatVimBadge(vimObj) {
  const mode = String(vimObj?.mode || "").trim().toUpperCase();
  if (!mode) return "";
  if (mode === "NORMAL") return `${ANSI.indigo}[N]${ANSI.reset}`;
  if (mode === "INSERT") return `${ANSI.green}[I]${ANSI.reset}`;
  if (mode === "VISUAL LINE") return `${ANSI.magenta}[VL]${ANSI.reset}`;
  if (mode === "VISUAL") return `${ANSI.magenta}[V]${ANSI.reset}`;
  return `${ANSI.muted}[${mode.slice(0, 2)}]${ANSI.reset}`;
}

function normalizeModelForMatch(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\((low|medium|med|high|xhigh|extra|max|thinking|orchestrator)\)/gi, " ")
    .replace(/\b(low|medium|high|xhigh|extra|max|thinking)\b/gi, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapSingleModelToGroup(rawModel, availableGroups, buckets = {}) {
  const lower = String(rawModel || "").toLowerCase();
  if (!lower) return availableGroups.has("gemini") ? "gemini" : "";

  const pickIfPresent = (...candidates) => {
    for (const c of candidates) {
      if (availableGroups.has(c)) return c;
    }
    return candidates[candidates.length - 1];
  };

  if (lower.includes("argon")) return pickIfPresent("argon", "gemini");
  if (lower.includes("carbon")) return pickIfPresent("carbon", "gemini");
  if (lower.includes("neon")) return pickIfPresent("neon", "gemini");
  if (lower.includes("hydrogen")) return pickIfPresent("hydrogen", "gemini");
  if (
    lower.includes("claude") ||
    lower.includes("opus") ||
    lower.includes("sonnet") ||
    lower.includes("haiku") ||
    lower.includes("gpt") ||
    lower.includes("oss") ||
    /\bo[134]\b/.test(lower)
  ) {
    return pickIfPresent("3p", "gemini");
  }

  // Dynamic match against backend-reported groupModels (covers future models automatically)
  const norm = normalizeModelForMatch(rawModel);
  if (norm) {
    for (const b of Object.values(buckets)) {
      const models = Array.isArray(b?.groupModels) ? b.groupModels : [];
      for (const m of models) {
        const mNorm = normalizeModelForMatch(m);
        if (mNorm && (norm.includes(mNorm) || mNorm.includes(norm))) {
          return b.groupKey;
        }
      }
    }
  }

  if (lower.includes("gemini") || lower.includes("flash")) {
    return pickIfPresent("gemini");
  }
  return availableGroups.has("gemini") ? "gemini" : "";
}

function detectActiveGroups(rawModel, buckets = {}, orchestratorConfig = null) {
  const availableGroups = new Set(
    Object.values(buckets)
      .map((b) => b?.groupKey)
      .filter(Boolean)
  );
  const str = String(rawModel || "");
  const lower = str.toLowerCase();

  if (lower.includes("orchestrator")) {
    const plannerParen = str.match(/\(([^)]+)\)/);
    let plannerRaw = plannerParen ? plannerParen[1] : "";
    let executorRaw = "gemini";

    if (!plannerRaw || plannerRaw.toLowerCase() === "orchestrator") {
      if (orchestratorConfig?.plannerModel || orchestratorConfig?.orchestratorModel) {
        plannerRaw = String(
          orchestratorConfig.plannerModel || orchestratorConfig.orchestratorModel
        );
      } else if (lower.includes("argon")) {
        plannerRaw = "argon";
      } else if (lower.includes("carbon")) {
        plannerRaw = "carbon";
      } else if (lower.includes("opus") || lower.includes("claude")) {
        plannerRaw = "claude";
      } else {
        plannerRaw = "neon";
      }
    }
    if (orchestratorConfig?.executorModel) {
      executorRaw = String(orchestratorConfig.executorModel);
    }

    const primary = mapSingleModelToGroup(plannerRaw, availableGroups, buckets) || "gemini";
    const secondaryCandidate = mapSingleModelToGroup(executorRaw, availableGroups, buckets);
    const secondary = secondaryCandidate && secondaryCandidate !== primary ? secondaryCandidate : "";
    return { primary, secondary };
  }

  return {
    primary: mapSingleModelToGroup(str, availableGroups, buckets),
    secondary: "",
  };
}

function detectActiveGroupKey(rawModel, buckets = {}, orchestratorConfig = null) {
  return detectActiveGroups(rawModel, buckets, orchestratorConfig).primary;
}

function renderAgentState(rawState) {
  const s = String(rawState || "idle").trim().toLowerCase();
  if (s === "idle" || s === "") {
    return `${ANSI.green}● Idle${ANSI.reset}`;
  }
  if (s.includes("error")) {
    return `${ANSI.red}✕ Error${ANSI.reset}`;
  }
  if (s.includes("auth")) {
    return `${ANSI.cyan}◈ Auth${ANSI.reset}`;
  }
  if (s.includes("init")) {
    return `${ANSI.sky}◌ Init${ANSI.reset}`;
  }
  if (s.includes("review")) {
    return `${ANSI.amber}◐ Review${ANSI.reset}`;
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

function renderTelemetrySegment(payload, config) {
  if (!config.showTelemetry) return "";
  const parts = [];
  if (payload?.tool_confirmation_pending === true) {
    parts.push(`${ANSI.amber}${ANSI.bold}⚠ Confirm${ANSI.reset}`);
  }
  const subagents = Array.isArray(payload?.subagents) ? payload.subagents : [];
  const runningSubs = subagents.filter((s) => String(s?.status || "").toLowerCase() === "running").length;
  if (runningSubs > 0) {
    parts.push(`${ANSI.cyan}◈ ${runningSubs}sub${ANSI.reset}`);
  }
  const taskCount = typeof payload?.task_count === "number" ? payload.task_count : 0;
  if (taskCount > 0) {
    parts.push(`${ANSI.sky}⏱ ${taskCount}${ANSI.reset}`);
  }
  const pendingInput =
    typeof payload?.pending_input_count === "number" ? payload.pending_input_count : 0;
  if (pendingInput > 0) {
    parts.push(`${ANSI.amber}✉ ${pendingInput}${ANSI.reset}`);
  }
  return parts.join(" ");
}

function renderLine1(payload, quotaResult, width, config = DEFAULT_CONFIG) {
  const sep = ` ${ANSI.muted}│${ANSI.reset} `;
  const modelInput = payload?.model || "Gemini";
  const tier = formatTierBadge(payload?.plan_tier);
  const tierStr = tier.label ? ` ${tier.color}[${tier.label}]${ANSI.reset}` : "";
  const modeStr = formatCycleMode(payload?.cycle_mode);
  const modePart = modeStr ? ` ${modeStr}` : "";
  const agentStr = payload?.agent?.name ? ` ${ANSI.cyan}@${payload.agent.name}${ANSI.reset}` : "";
  const vimStr = config.showTelemetry ? formatVimBadge(payload?.vim) : "";
  const vimPart = vimStr ? ` ${vimStr}` : "";

  const modelSegmentFull = `${renderModelName(modelInput, { compact: false })}${agentStr}${tierStr}${modePart}${vimPart}`;
  const modelSegmentCompact = `${renderModelName(modelInput, { compact: true })}${tierStr}${modePart}`;

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
  const ctxColor =
    payload?.exceeds_200k_tokens === true && usedPct < 70 ? ANSI.orange : colorForUsedPct(usedPct);
  const ctxBar = renderBar(usedPct, 8, ctxColor, config.smoothBars);
  const tokenDetail =
    windowSize > 0
      ? ` ${ANSI.muted}(${formatCompactTokens(inputTokens)}/${formatCompactTokens(windowSize)})${ANSI.reset}`
      : "";
  const ctxSegmentFull = `Ctx ${ctxBar} ${ctxColor}${usedPct}%${ANSI.reset}${tokenDetail}`;
  const ctxSegmentNoDetail = `Ctx ${ctxBar} ${ctxColor}${usedPct}%${ANSI.reset}`;
  const ctxSegmentShort = `Ctx ${ctxColor}${usedPct}%${ANSI.reset}`;

  // Workspace + Git segment
  const rawDir = payload?.workspace?.current_dir || payload?.cwd || "";
  const dirName = rawDir ? path.basename(path.resolve(String(rawDir))) : "";
  const branch = resolveGitBranch(payload);
  const wsParts = [];
  if (dirName) wsParts.push(`${ANSI.yellow}${dirName}${ANSI.reset}`);
  if (branch) wsParts.push(`${ANSI.magenta}⎇ ${branch}${ANSI.reset}`);
  const wsSegment = wsParts.join(" ");

  const telemetrySegment = renderTelemetrySegment(payload, config);

  // State + Cost + Live badge
  const stateStr = renderAgentState(payload?.agent_state);
  const usd = payload?.cost?.total_usd;
  const estPrefix = payload?.cost?.estimated === true ? "~" : "";
  const costStr =
    typeof usd === "number" && Number.isFinite(usd) && usd > 0
      ? ` ${ANSI.sky}${estPrefix}${usd >= 0.01 ? `$${usd.toFixed(2)}` : `<$0.01`}${ANSI.reset}`
      : "";
  const syncAgeSec =
    quotaResult?.cacheAgeMs !== undefined && Number.isFinite(quotaResult.cacheAgeMs)
      ? Math.floor(quotaResult.cacheAgeMs / 1000)
      : null;
  const syncBadge =
    syncAgeSec !== null && syncAgeSec <= 30
      ? ` ${ANSI.green}⚡${ANSI.reset}`
      : syncAgeSec !== null && syncAgeSec < 300
      ? ` ${ANSI.muted}${syncAgeSec}s${ANSI.reset}`
      : syncAgeSec !== null
      ? ` ${ANSI.amber}${Math.floor(syncAgeSec / 60)}m${ANSI.reset}`
      : "";
  const stateSegment = `${stateStr}${costStr}${syncBadge}`;
  const stateSegmentMinimal = `${stateStr}${syncBadge}`;

  const candidates = [
    [modelSegmentFull, ctxSegmentFull, wsSegment, telemetrySegment, stateSegment].filter(Boolean).join(sep),
    [modelSegmentFull, ctxSegmentFull, wsSegment, stateSegment].filter(Boolean).join(sep),
    [modelSegmentFull, ctxSegmentNoDetail, wsSegment, stateSegment].filter(Boolean).join(sep),
    [modelSegmentFull, ctxSegmentShort, wsSegment, stateSegment].filter(Boolean).join(sep),
    [modelSegmentFull, ctxSegmentShort, stateSegment].filter(Boolean).join(sep),
    [modelSegmentCompact, ctxSegmentShort, stateSegmentMinimal].filter(Boolean).join(sep),
    [modelSegmentCompact, stateSegmentMinimal].filter(Boolean).join(sep),
  ];

  for (const line of candidates) {
    if (visibleLength(line) <= width) {
      return line;
    }
  }
  return fitToWidth(candidates[candidates.length - 1], width);
}

function abbreviateModelName(name, mode = "compact") {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("neon")) return "Neon";
  if (lower.includes("hydrogen")) return mode === "full" ? "Hydrogen" : "Hydro";
  if (lower.includes("carbon")) return "Carbon";
  if (lower.includes("argon")) return "Argon";
  if (lower.includes("flash")) {
    const ver = raw.match(/(\d+(?:\.\d+)?)\s*flash/i);
    if (ver) return mode === "full" ? `${ver[1]} Flash` : `${ver[1]}F`;
    return "Flash";
  }
  if (lower.includes("opus")) {
    const ver = raw.match(/opus\s*(\d+(?:\.\d+)?)/i);
    return ver ? `Opus ${ver[1]}` : "Opus";
  }
  if (lower.includes("sonnet")) {
    const ver = raw.match(/sonnet\s*(\d+(?:\.\d+)?)/i);
    return ver ? `Sonnet ${ver[1]}` : "Sonnet";
  }
  if (lower.includes("gpt-oss") || lower.includes("gpt oss")) {
    return mode === "full" ? "GPT-OSS" : "GPT";
  }
  if (lower.includes("gpt")) return "GPT";
  return raw.replace(/^Gemini\s+(?:\d+(?:\.\d+)?\s+)?/i, "").replace(/^Claude\s+/i, "").trim() || raw;
}

function formatGroupLabel(group, { labelStyle = "short" } = {}) {
  const models = Array.isArray(group.models) ? group.models : [];
  if (labelStyle === "full") {
    if (group.key === "gemini" && models.length > 0) {
      return `Gemini (${models.map((m) => abbreviateModelName(m, "full")).join(" · ")})`;
    }
    if (group.key === "3p" && models.length > 0) {
      return `Claude/GPT (${models.map((m) => abbreviateModelName(m, "full")).join(" · ")})`;
    }
    if (group.key === "argon") return "Gemini 4 Argon";
    if (group.key === "carbon") return "Gemini 4 Carbon";
    return group.groupTitle || group.shortGroup;
  }

  if (labelStyle === "withModels") {
    if (group.key === "gemini" && models.length > 0) {
      const tags = models.map((m) => abbreviateModelName(m, "compact")).filter(Boolean);
      return `Gem(${tags.join("·")})`;
    }
    if (group.key === "3p" && models.length > 0) {
      const has55 = models.some((m) => m.includes("5.5"));
      if (has55) return "Claude 5.5/GPT";
      const tags = models.map((m) => abbreviateModelName(m, "compact")).filter(Boolean);
      return tags.slice(0, 3).join("/");
    }
    return group.shortGroup;
  }

  if (labelStyle === "withModelsWide") {
    if (group.key === "gemini" && models.length > 0) {
      const tags = models.map((m) => abbreviateModelName(m, "compact")).filter(Boolean);
      return `Gem(${tags.join("·")})`;
    }
    if (group.key === "3p" && models.length > 0) {
      const tags = models.map((m) => abbreviateModelName(m, "full")).filter(Boolean);
      return tags.join("·");
    }
    return group.shortGroup;
  }

  if (labelStyle === "ultraShort") {
    if (group.shortGroup === "Claude/GPT") return "C/GPT";
    return group.shortGroup;
  }

  return group.shortGroup;
}

function buildGroupRecords(quotaResult) {
  const bucketsMap = quotaResult?.buckets || {};
  const list = Object.values(bucketsMap).sort((a, b) => (a.order || 99) - (b.order || 99));
  const groupsOrder = [];
  const groupsMap = new Map();

  for (const b of list) {
    const gKey = b.groupKey || "other";
    if (!groupsMap.has(gKey)) {
      groupsMap.set(gKey, {
        key: gKey,
        shortGroup: b.shortGroup || gKey,
        groupTitle: b.groupTitle || b.shortGroup || gKey,
        models: Array.isArray(b.groupModels) ? [...b.groupModels] : [],
        buckets: [],
      });
      groupsOrder.push(gKey);
    }
    const g = groupsMap.get(gKey);
    if (g.models.length === 0 && Array.isArray(b.groupModels) && b.groupModels.length > 0) {
      g.models = [...b.groupModels];
    }
    g.buckets.push(b);
  }

  return groupsOrder.map((k) => groupsMap.get(k));
}

function formatBucketItem(
  bucket,
  { barWidth = 4, resetMode = "all", smoothBars = true, nowMs = Date.now() } = {}
) {
  if (bucket.disabled) {
    return `${ANSI.white}${bucket.shortWindow}${ANSI.reset} ${ANSI.muted}off${ANSI.reset}`;
  }
  const pct =
    typeof bucket.remainingPct === "number"
      ? bucket.remainingPct
      : Math.round((bucket.remainingFraction || 0) * 100);
  const color = colorForRemainingPct(pct);
  const bar = barWidth > 0 ? `${renderBar(pct, barWidth, color, smoothBars)} ` : "";
  const shouldShowReset =
    resetMode === "all" || (resetMode === "usedOnly" && pct < 100);
  const countdown = shouldShowReset ? formatResetCountdown(bucket.resetTime, nowMs) : "";
  const resetPart = countdown ? ` ${ANSI.muted}(${countdown})${ANSI.reset}` : "";
  return `${ANSI.white}${bucket.shortWindow}${ANSI.reset} ${bar}${color}${pct}%${ANSI.reset}${resetPart}`;
}

function renderGroupPrefix(group, label, activeGroups, { alignLeading = false } = {}) {
  const isPrimary = group.key === activeGroups.primary;
  const isSecondary = group.key === activeGroups.secondary;
  if (isPrimary) {
    return `${ANSI.bold}${ANSI.brightCyan}▸${label}${ANSI.reset}`;
  }
  if (isSecondary) {
    return `${ANSI.bold}${ANSI.sky}▹${label}${ANSI.reset}`;
  }
  const pad = alignLeading ? " " : "";
  return `${ANSI.bold}${ANSI.cyan}${pad}${label}${ANSI.reset}`;
}

function renderLine2Compact(payload, quotaResult, width, nowMs, config, orchestratorConfig) {
  const groups = buildGroupRecords(quotaResult);
  if (groups.length === 0) {
    return `${ANSI.muted}Cuotas /quota: sincronizando en tiempo real…${ANSI.reset}`;
  }

  const activeGroups = detectActiveGroups(
    payload?.model?.display_name || payload?.model?.id || "",
    quotaResult?.buckets || {},
    orchestratorConfig
  );

  const buildLine = ({ barWidth, resetMode, labelStyle }) => {
    const groupSep = ` ${ANSI.muted}│${ANSI.reset} `;
    const bucketSep = ` ${ANSI.muted}·${ANSI.reset} `;

    return groups
      .map((g) => {
        const label = formatGroupLabel(g, { labelStyle });
        const prefix = renderGroupPrefix(g, label, activeGroups);
        const items = g.buckets.map((b) =>
          formatBucketItem(b, {
            barWidth,
            resetMode,
            smoothBars: config.smoothBars,
            nowMs,
          })
        );
        return `${prefix} ${items.join(bucketSep)}`;
      })
      .join(groupSep);
  };

  const allowModelTags = config.showGroupModels !== "never";
  const forceModelTags = config.showGroupModels === "always";

  const layouts = [];
  if (allowModelTags) {
    layouts.push({ barWidth: 4, resetMode: "all", labelStyle: "withModelsWide" });
    layouts.push({ barWidth: 4, resetMode: "all", labelStyle: "withModels" });
    layouts.push({ barWidth: 4, resetMode: "usedOnly", labelStyle: "withModels" });
    layouts.push({ barWidth: 3, resetMode: "usedOnly", labelStyle: "withModels" });
    if (forceModelTags) {
      layouts.push({ barWidth: 0, resetMode: "usedOnly", labelStyle: "withModels" });
      layouts.push({ barWidth: 0, resetMode: "none", labelStyle: "withModels" });
    }
  }
  layouts.push(
    { barWidth: 4, resetMode: "all", labelStyle: "short" },
    { barWidth: 3, resetMode: "all", labelStyle: "ultraShort" },
    { barWidth: 3, resetMode: "usedOnly", labelStyle: "ultraShort" },
    { barWidth: 3, resetMode: "none", labelStyle: "ultraShort" },
    { barWidth: 0, resetMode: "all", labelStyle: "ultraShort" },
    { barWidth: 0, resetMode: "usedOnly", labelStyle: "ultraShort" },
    { barWidth: 0, resetMode: "none", labelStyle: "ultraShort" }
  );

  for (const layout of layouts) {
    const candidate = buildLine(layout);
    if (visibleLength(candidate) <= width) {
      return candidate;
    }
  }

  return fitToWidth(buildLine(layouts[layouts.length - 1]), width);
}

function renderDashboardRow(groupList, activeGroups, width, nowMs, config, { barWidth, resetMode, labelStyle }) {
  const groupSep = `  ${ANSI.muted}│${ANSI.reset}  `;
  const bucketSep = ` ${ANSI.muted}·${ANSI.reset} `;
  const line = groupList
    .map((g, idx) => {
      const label = formatGroupLabel(g, { labelStyle });
      const prefix = renderGroupPrefix(g, label, activeGroups, { alignLeading: idx === 0 });
      const items = g.buckets.map((b) =>
        formatBucketItem(b, {
          barWidth,
          resetMode,
          smoothBars: config.smoothBars,
          nowMs,
        })
      );
      return `${prefix}  ${items.join(bucketSep)}`;
    })
    .join(groupSep);
  return line;
}

function renderLines2And3Dashboard(payload, quotaResult, width, nowMs, config, orchestratorConfig) {
  const groups = buildGroupRecords(quotaResult);
  if (groups.length === 0) {
    return `${ANSI.muted}Cuotas /quota: sincronizando en tiempo real…${ANSI.reset}`;
  }

  const activeGroups = detectActiveGroups(
    payload?.model?.display_name || payload?.model?.id || "",
    quotaResult?.buckets || {},
    orchestratorConfig
  );

  // Split across 2 dashboard rows: Gemini + Argon/Carbon on row 1, Claude/GPT + extras on row 2
  const row1Groups = groups.filter((g) => g.key !== "3p");
  const row2Groups = groups.filter((g) => g.key === "3p");
  if (row2Groups.length === 0 && row1Groups.length > 1) {
    row2Groups.push(row1Groups.pop());
  }

  const row1Final = row1Groups.length > 0 ? row1Groups : groups;
  const row2Final = row2Groups;

  const optsList = [
    { barWidth: 5, resetMode: "all", labelStyle: "full" },
    { barWidth: 5, resetMode: "all", labelStyle: "withModelsWide" },
    { barWidth: 5, resetMode: "usedOnly", labelStyle: "withModels" },
    { barWidth: 4, resetMode: "all", labelStyle: "withModelsWide" },
    { barWidth: 4, resetMode: "usedOnly", labelStyle: "withModels" },
    { barWidth: 4, resetMode: "usedOnly", labelStyle: "short" },
    { barWidth: 3, resetMode: "usedOnly", labelStyle: "short" },
    { barWidth: 0, resetMode: "usedOnly", labelStyle: "ultraShort" },
    { barWidth: 0, resetMode: "none", labelStyle: "ultraShort" },
  ];

  // Try unified bar widths first so both dashboard rows stay visually aligned
  const barWidths = [5, 4, 3, 0];
  for (const bw of barWidths) {
    const tierCandidates = optsList.filter((o) => o.barWidth === bw);
    const r1 = tierCandidates
      .map((o) => renderDashboardRow(row1Final, activeGroups, width, nowMs, config, o))
      .find((line) => visibleLength(line) <= width);
    const r2 =
      row2Final.length === 0
        ? ""
        : tierCandidates
            .map((o) => renderDashboardRow(row2Final, activeGroups, width, nowMs, config, o))
            .find((line) => visibleLength(line) <= width);
    if (r1 && (row2Final.length === 0 || r2)) {
      return r2 ? `${r1}\n${r2}` : r1;
    }
  }

  const fallbackOpts = optsList[optsList.length - 1];
  const r1 = fitToWidth(
    renderDashboardRow(row1Final, activeGroups, width, nowMs, config, fallbackOpts),
    width
  );
  if (row2Final.length === 0) return r1;
  const r2 = fitToWidth(
    renderDashboardRow(row2Final, activeGroups, width, nowMs, config, fallbackOpts),
    width
  );
  return `${r1}\n${r2}`;
}

function renderHud(payload, quotaResult, nowMs = Date.now(), options = {}) {
  const config = normalizeConfig(options.config || DEFAULT_CONFIG);
  const orchestratorConfig = options.orchestratorConfig || null;
  const width =
    typeof payload?.terminal_width === "number" && payload.terminal_width > 20
      ? payload.terminal_width
      : 140;
  const line1 = renderLine1(payload, quotaResult, width, config);
  const rest =
    config.layout === "3line"
      ? renderLines2And3Dashboard(payload, quotaResult, width, nowMs, config, orchestratorConfig)
      : renderLine2Compact(payload, quotaResult, width, nowMs, config, orchestratorConfig);
  return `${line1}\n${rest}`;
}

module.exports = {
  renderHud,
  renderBar,
  stripAnsi,
  visibleLength,
  formatResetCountdown,
  formatModelParts,
  abbreviateModelName,
  detectActiveGroupKey,
  detectActiveGroups,
};
