"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const AGY_SETTINGS_PATH = path.join(os.homedir(), ".gemini", "antigravity-cli", "settings.json");

function getStatusLineCommandPath() {
  const binDir = path.resolve(__dirname, "..", "bin");
  if (process.platform === "win32") {
    return path.win32.normalize(path.join(binDir, "agy-quota-live.cmd"));
  }
  const shPath = path.join(binDir, "agy-quota-live.sh");
  try {
    fs.chmodSync(shPath, 0o755);
  } catch {
    // ignore
  }
  return shPath;
}

function ensureStatusLineConfigured({ force = false } = {}) {
  const targetCommand = getStatusLineCommandPath();
  let settings = {};
  try {
    if (fs.existsSync(AGY_SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(AGY_SETTINGS_PATH, "utf8"));
    }
  } catch {
    settings = {};
  }

  const currentCmd = settings?.statusLine?.command || "";
  const alreadyOurs = currentCmd === targetCommand;
  if (alreadyOurs) {
    return { updated: false, command: targetCommand, settingsPath: AGY_SETTINGS_PATH };
  }

  // Auto-configure if force=true, or if statusLine is empty, or if it points to a missing script or old agy-hud
  const shouldUpdate =
    force ||
    !currentCmd ||
    currentCmd.includes("agy-hud") ||
    currentCmd.includes("agy-quota-live") ||
    !fs.existsSync(currentCmd.replace(/^"|"$/g, ""));

  if (!shouldUpdate) {
    return { updated: false, command: currentCmd, settingsPath: AGY_SETTINGS_PATH };
  }

  settings.statusLine = {
    type: "command",
    command: targetCommand,
  };

  try {
    fs.mkdirSync(path.dirname(AGY_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(AGY_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
    return { updated: true, command: targetCommand, settingsPath: AGY_SETTINGS_PATH };
  } catch (err) {
    return { updated: false, error: err?.message || String(err), settingsPath: AGY_SETTINGS_PATH };
  }
}

function uninstallStatusLine() {
  try {
    if (!fs.existsSync(AGY_SETTINGS_PATH)) {
      return { removed: false, settingsPath: AGY_SETTINGS_PATH };
    }
    const settings = JSON.parse(fs.readFileSync(AGY_SETTINGS_PATH, "utf8"));
    const currentCmd = settings?.statusLine?.command || "";
    if (currentCmd.includes("agy-quota-live")) {
      delete settings.statusLine;
      fs.writeFileSync(AGY_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
      return { removed: true, settingsPath: AGY_SETTINGS_PATH };
    }
    return { removed: false, settingsPath: AGY_SETTINGS_PATH };
  } catch (err) {
    return { removed: false, error: err?.message || String(err), settingsPath: AGY_SETTINGS_PATH };
  }
}

module.exports = {
  AGY_SETTINGS_PATH,
  getStatusLineCommandPath,
  ensureStatusLineConfigured,
  uninstallStatusLine,
};
