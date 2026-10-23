"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { getAccessToken, invalidateTokenCache } = require("./token");

const AGY_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli");
const CACHE_PATH = path.join(AGY_DIR, "agy-quota-live-cache.json");
const LOCK_PATH = path.join(AGY_DIR, "agy-quota-live.lock");

const QUOTA_ENDPOINT = "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const DEFAULT_PROJECT = "aicode-consumers";
const DEFAULT_CLI_VERSION = "1.4.5";

const BUCKET_META = {
  "gemini-5h": {
    groupKey: "gemini",
    groupTitle: "Gemini Models",
    shortGroup: "Gem",
    window: "5h",
    shortWindow: "5h",
    order: 1,
  },
  "gemini-weekly": {
    groupKey: "gemini",
    groupTitle: "Gemini Models",
    shortGroup: "Gem",
    window: "weekly",
    shortWindow: "Sem",
    order: 2,
  },
  "3p-5h": {
    groupKey: "3p",
    groupTitle: "Claude and GPT models",
    shortGroup: "Claude/GPT",
    window: "5h",
    shortWindow: "5h",
    order: 3,
  },
  "3p-weekly": {
    groupKey: "3p",
    groupTitle: "Claude and GPT models",
    shortGroup: "Claude/GPT",
    window: "weekly",
    shortWindow: "Sem",
    order: 4,
  },
  "gemini-argon-wtu-weekly": {
    groupKey: "argon",
    groupTitle: "Gemini 4 Argon",
    shortGroup: "Argon",
    window: "weekly",
    shortWindow: "Sem",
    order: 5,
  },
  "gemini-argon-wtu-5h": {
    groupKey: "argon",
    groupTitle: "Gemini 4 Argon",
    shortGroup: "Argon",
    window: "5h",
    shortWindow: "5h",
    order: 6,
  },
};

function buildUserAgent(version) {
  const ver = typeof version === "string" && /^\d+\.\d+/.test(version.trim()) ? version.trim() : DEFAULT_CLI_VERSION;
  const osType = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `antigravity/cli/${ver} (aidev_client; os_type=${osType}; arch=${arch}; cl=1004422050; auth_method=consumer)`;
}

function clamp01(num) {
  if (typeof num !== "number" || !Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

function inferMeta(bucketId, groupDisplayName = "", windowStr = "", displayName = "") {
  if (BUCKET_META[bucketId]) return BUCKET_META[bucketId];
  const lowerId = String(bucketId || "").toLowerCase();
  const lowerGroup = String(groupDisplayName || "").toLowerCase();
  const is5h = windowStr === "5h" || lowerId.includes("5h");
  const shortWindow = is5h ? "5h" : "Sem";

  if (lowerId.includes("argon") || lowerGroup.includes("argon")) {
    return {
      groupKey: "argon",
      groupTitle: groupDisplayName || "Gemini 4 Argon",
      shortGroup: "Argon",
      window: is5h ? "5h" : "weekly",
      shortWindow,
      order: is5h ? 5 : 6,
    };
  }
  if (lowerId.startsWith("3p") || lowerGroup.includes("claude") || lowerGroup.includes("gpt")) {
    return {
      groupKey: "3p",
      groupTitle: groupDisplayName || "Claude and GPT models",
      shortGroup: "Claude/GPT",
      window: is5h ? "5h" : "weekly",
      shortWindow,
      order: is5h ? 3 : 4,
    };
  }
  if (lowerId.startsWith("gemini") || lowerGroup.includes("gemini")) {
    return {
      groupKey: "gemini",
      groupTitle: groupDisplayName || "Gemini Models",
      shortGroup: "Gem",
      window: is5h ? "5h" : "weekly",
      shortWindow,
      order: is5h ? 1 : 2,
    };
  }
  return {
    groupKey: lowerId || "other",
    groupTitle: groupDisplayName || displayName || bucketId,
    shortGroup: groupDisplayName || bucketId,
    window: windowStr || "weekly",
    shortWindow,
    order: 99,
  };
}

function parseQuotaSummaryResponse(json) {
  if (!json || typeof json !== "object") return null;
  const buckets = {};
  const groups = Array.isArray(json.groups) ? json.groups : [];

  for (const group of groups) {
    const groupName = group?.displayName || "";
    const groupDesc = group?.description || "";
    const list = Array.isArray(group?.buckets) ? group.buckets : [];
    for (const raw of list) {
      const id = raw?.bucketId;
      if (!id || typeof id !== "string") continue;
      // Note: proto3 JSON omits numeric fields equal to 0
      const remainingFraction = clamp01(typeof raw.remainingFraction === "number" ? raw.remainingFraction : 0);
      const meta = inferMeta(id, groupName, raw.window, raw.displayName);
      buckets[id] = {
        id,
        remainingFraction,
        remainingPct: Math.round(remainingFraction * 100),
        resetTime: typeof raw.resetTime === "string" ? raw.resetTime : "",
        window: raw.window || meta.window,
        displayName: raw.displayName || "",
        description: raw.description || "",
        groupTitle: groupName || meta.groupTitle,
        groupDescription: groupDesc,
        groupKey: meta.groupKey,
        shortGroup: meta.shortGroup,
        shortWindow: meta.shortWindow,
        order: meta.order,
      };
    }
  }

  if (Object.keys(buckets).length === 0) return null;
  return buckets;
}

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // ignore missing or corrupt cache
  }
  return null;
}

function writeCache(nextData) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const existing = readCache() || {};
    const merged = {
      ...existing,
      ...nextData,
      updatedAt: Date.now(),
    };
    const tmpPath = `${CACHE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, CACHE_PATH);
    return merged;
  } catch {
    return nextData;
  }
}

function acquireLock(maxAgeMs = 10_000) {
  try {
    fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
    if (fs.existsSync(LOCK_PATH)) {
      const stat = fs.statSync(LOCK_PATH);
      if (Date.now() - stat.mtimeMs < maxAgeMs) {
        return false;
      }
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        // ignore
      }
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
}

async function callQuotaApi(accessToken, version, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(QUOTA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": buildUserAgent(version),
      },
      body: JSON.stringify({ project: DEFAULT_PROJECT }),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { unauthorized: true, status: res.status };
    }
    if (!res.ok) {
      return { error: `HTTP ${res.status}`, status: res.status };
    }
    const json = await res.json();
    const buckets = parseQuotaSummaryResponse(json);
    return { buckets, raw: json, status: 200 };
  } catch (err) {
    return { error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function refreshQuotaCache({ timeoutMs = 1500, force = false, version = "" } = {}) {
  if (!force && !acquireLock(8_000)) {
    return readCache();
  }
  const hasLock = true;
  try {
    const existing = readCache();
    const cliVersion = version || existing?.version || DEFAULT_CLI_VERSION;
    let token = getAccessToken({ forceRefresh: false });
    if (!token) {
      token = getAccessToken({ forceRefresh: true });
    }
    if (!token) {
      return existing;
    }

    let result = await callQuotaApi(token, cliVersion, timeoutMs);
    if (result.unauthorized) {
      invalidateTokenCache();
      const freshToken = getAccessToken({ forceRefresh: true });
      if (freshToken && freshToken !== token) {
        result = await callQuotaApi(freshToken, cliVersion, timeoutMs);
      }
    }

    if (result.buckets && Object.keys(result.buckets).length > 0) {
      return writeCache({
        fetchedAt: Date.now(),
        version: cliVersion,
        buckets: result.buckets,
      });
    }
    return existing;
  } finally {
    if (hasLock) releaseLock();
  }
}

function spawnBackgroundRefresh(cliScriptPath, version = "") {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const stat = fs.statSync(LOCK_PATH);
      if (Date.now() - stat.mtimeMs < 6_000) {
        return false;
      }
    }
    const args = [cliScriptPath, "refresh"];
    if (version) args.push(version);
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function mergeQuotas(cacheData, stdinQuota, nowMs = Date.now()) {
  const merged = {};
  const cacheBuckets = cacheData?.buckets && typeof cacheData.buckets === "object" ? cacheData.buckets : {};
  const cacheFetchedAt = typeof cacheData?.fetchedAt === "number" ? cacheData.fetchedAt : 0;
  const cacheAgeMs = cacheFetchedAt > 0 ? Math.max(0, nowMs - cacheFetchedAt) : Infinity;

  for (const [id, b] of Object.entries(cacheBuckets)) {
    if (!b || typeof b !== "object") continue;
    merged[id] = { ...b, source: "cloud" };
  }

  if (stdinQuota && typeof stdinQuota === "object") {
    for (const [id, sb] of Object.entries(stdinQuota)) {
      if (!sb || typeof sb !== "object") continue;
      const stdinFrac = clamp01(
        typeof sb.remaining_fraction === "number"
          ? sb.remaining_fraction
          : typeof sb.remainingFraction === "number"
          ? sb.remainingFraction
          : 0
      );
      const stdinReset =
        typeof sb.reset_time === "string"
          ? sb.reset_time
          : typeof sb.resetTime === "string"
          ? sb.resetTime
          : "";

      const meta = inferMeta(id);
      const cloudBucket = merged[id];

      if (!cloudBucket) {
        merged[id] = {
          id,
          remainingFraction: stdinFrac,
          remainingPct: Math.round(stdinFrac * 100),
          resetTime: stdinReset,
          window: meta.window,
          displayName: "",
          groupTitle: meta.groupTitle,
          groupKey: meta.groupKey,
          shortGroup: meta.shortGroup,
          shortWindow: meta.shortWindow,
          order: meta.order,
          source: "stdin",
        };
        continue;
      }

      const cloudResetMs = cloudBucket.resetTime ? Date.parse(cloudBucket.resetTime) : 0;
      const stdinResetMs = stdinReset ? Date.parse(stdinReset) : 0;
      const sameWindow =
        cloudResetMs > 0 && stdinResetMs > 0 && Math.abs(cloudResetMs - stdinResetMs) < 15 * 60 * 1000;

      if (sameWindow && cacheAgeMs < 5 * 60 * 1000) {
        // Within the same active reset window, quota only decreases as tokens are consumed.
        // Taking Math.min guarantees whichever source updates first wins immediately.
        const bestFrac = Math.min(cloudBucket.remainingFraction, stdinFrac);
        merged[id] = {
          ...cloudBucket,
          remainingFraction: bestFrac,
          remainingPct: Math.round(bestFrac * 100),
          resetTime: cloudBucket.resetTime || stdinReset,
          source: bestFrac < cloudBucket.remainingFraction ? "stdin-realtime" : "cloud",
        };
      } else if (cacheAgeMs > 5 * 60 * 1000 && stdinResetMs > cloudResetMs) {
        // Cloud cache is stale (>5m) and stdin has a newer window
        merged[id] = {
          ...cloudBucket,
          remainingFraction: stdinFrac,
          remainingPct: Math.round(stdinFrac * 100),
          resetTime: stdinReset || cloudBucket.resetTime,
          source: "stdin",
        };
      }
    }
  }

  return {
    buckets: merged,
    fetchedAt: cacheFetchedAt,
    cacheAgeMs,
  };
}

module.exports = {
  CACHE_PATH,
  LOCK_PATH,
  readCache,
  writeCache,
  refreshQuotaCache,
  spawnBackgroundRefresh,
  mergeQuotas,
};
