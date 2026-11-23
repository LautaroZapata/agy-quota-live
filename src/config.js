"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const AGY_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli");
const CONFIG_PATH = path.join(AGY_DIR, "agy-quota-live.json");

const DEFAULT_CONFIG = Object.freeze({
  layout: "2line",
  showGroupModels: "auto",
  smoothBars: true,
  showTelemetry: true,
});

const VALID_LAYOUTS = new Set(["2line", "3line"]);
const VALID_GROUP_MODELS = new Set(["auto", "always", "never"]);

function writeFileAtomicSync(targetPath, content, options = { mode: 0o600 }) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, options);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.renameSync(tmpPath, targetPath);
        return true;
      } catch (err) {
        const code = err && err.code;
        if ((code === "EPERM" || code === "EBUSY" || code === "EACCES") && attempt < 2) {
          continue;
        }
        if (code === "EPERM" || code === "EBUSY" || code === "EACCES") {
          fs.writeFileSync(targetPath, content, options);
          return true;
        }
        throw err;
      }
    }
    return false;
  } finally {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // ignore cleanup error
    }
  }
}

function normalizeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const layout = VALID_LAYOUTS.has(String(src.layout || "").toLowerCase())
    ? String(src.layout).toLowerCase()
    : DEFAULT_CONFIG.layout;
  const showGroupModels = VALID_GROUP_MODELS.has(String(src.showGroupModels || "").toLowerCase())
    ? String(src.showGroupModels).toLowerCase()
    : DEFAULT_CONFIG.showGroupModels;
  const smoothBars =
    typeof src.smoothBars === "boolean" ? src.smoothBars : DEFAULT_CONFIG.smoothBars;
  const showTelemetry =
    typeof src.showTelemetry === "boolean" ? src.showTelemetry : DEFAULT_CONFIG.showTelemetry;

  return {
    layout,
    showGroupModels,
    smoothBars,
    showTelemetry,
  };
}

function readConfig(configPath = CONFIG_PATH) {
  try {
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(configPath, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(nextPartial, configPath = CONFIG_PATH) {
  const current = readConfig(configPath);
  const merged = normalizeConfig({ ...current, ...(nextPartial || {}) });
  writeFileAtomicSync(configPath, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  return merged;
}

function resetConfig(configPath = CONFIG_PATH) {
  const defaults = { ...DEFAULT_CONFIG };
  writeFileAtomicSync(configPath, JSON.stringify(defaults, null, 2) + "\n", { mode: 0o600 });
  return defaults;
}

function cleanupStaleTempFiles(dirPath = AGY_DIR, maxAgeMs = 30_000) {
  let removed = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const now = Date.now();
    for (const name of fs.readdirSync(dirPath)) {
      if (!name.startsWith("agy-quota-live-") || !name.endsWith(".tmp")) continue;
      const fullPath = path.join(dirPath, name);
      try {
        const stat = fs.statSync(fullPath);
        if (maxAgeMs <= 0 || now - stat.mtimeMs >= maxAgeMs) {
          fs.unlinkSync(fullPath);
          removed += 1;
        }
      } catch {
        // ignore individual unlink errors
      }
    }
  } catch {
    // ignore
  }
  return removed;
}

module.exports = {
  AGY_DIR,
  CONFIG_PATH,
  DEFAULT_CONFIG,
  normalizeConfig,
  readConfig,
  writeConfig,
  resetConfig,
  writeFileAtomicSync,
  cleanupStaleTempFiles,
};
