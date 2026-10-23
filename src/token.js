"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const AGY_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli");
const TOKEN_CACHE_PATH = path.join(AGY_DIR, "agy-quota-live-token.json");

const FALLBACK_TOKEN_FILES = [
  path.join(AGY_DIR, "antigravity-oauth-token"),
  path.join(os.homedir(), ".gemini", "antigravity-oauth-token"),
  path.join(os.homedir(), ".gemini", "oauth_creds.json"),
];

const WIN_CRED_PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredReader {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr cred);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    public static string Read(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) return null;
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (c.CredentialBlobSize <= 0 || c.CredentialBlob == IntPtr.Zero) return null;
            byte[] bytes = new byte[c.CredentialBlobSize];
            Marshal.Copy(c.CredentialBlob, bytes, 0, c.CredentialBlobSize);
            return Encoding.UTF8.GetString(bytes);
        } finally {
            CredFree(ptr);
        }
    }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
$val = [CredReader]::Read('gemini:antigravity')
if (-not $val) { $val = [CredReader]::Read('LegacyGeneric:target=gemini:antigravity') }
if ($val) { [Console]::Out.Write($val) }
`;

function parseExpiryMs(val) {
  if (!val) return 0;
  if (typeof val === "number" && Number.isFinite(val)) {
    return val < 1e11 ? val * 1000 : val;
  }
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseTokenBlob(raw) {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim().replace(/\0+$/g, "");
  if (!text) return null;

  if (text.startsWith("go-keyring-base64:")) {
    try {
      text = Buffer.from(text.slice("go-keyring-base64:".length), "base64").toString("utf8").trim();
    } catch {
      return null;
    }
  } else if (!text.startsWith("{") && /^[A-Za-z0-9+/=_-]+$/.test(text) && !text.startsWith("ya29.")) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8").trim();
      if (decoded.startsWith("{") || decoded.startsWith("ya29.")) {
        text = decoded;
      }
    } catch {
      // keep raw
    }
  }

  if (text.startsWith("ya29.")) {
    return {
      accessToken: text,
      expiryMs: Date.now() + 15 * 60 * 1000,
    };
  }

  try {
    const obj = JSON.parse(text);
    const tokenObj = obj && typeof obj.token === "object" && obj.token !== null ? obj.token : obj;
    const accessToken =
      tokenObj?.access_token ||
      tokenObj?.accessToken ||
      (typeof obj?.token === "string" ? obj.token : "");
    if (typeof accessToken === "string" && accessToken.trim().length > 10) {
      const expiryMs =
        parseExpiryMs(tokenObj?.expiry) ||
        parseExpiryMs(tokenObj?.expiry_date) ||
        parseExpiryMs(tokenObj?.expires_at) ||
        parseExpiryMs(obj?.expiry) ||
        Date.now() + 15 * 60 * 1000;
      return {
        accessToken: accessToken.trim(),
        expiryMs,
      };
    }
  } catch {
    // ignore invalid json
  }
  return null;
}

function isTokenFresh(entry, minRemainingMs = 90_000) {
  if (!entry || typeof entry.accessToken !== "string" || !entry.accessToken) return false;
  if (!entry.expiryMs || !Number.isFinite(entry.expiryMs)) return true;
  return entry.expiryMs > Date.now() + minRemainingMs;
}

function readCachedToken() {
  try {
    const raw = fs.readFileSync(TOKEN_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (isTokenFresh(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeCachedToken(entry) {
  if (!entry || !entry.accessToken) return;
  try {
    fs.mkdirSync(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
    const tmpPath = `${TOKEN_CACHE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({
        accessToken: entry.accessToken,
        expiryMs: entry.expiryMs || Date.now() + 15 * 60 * 1000,
        updatedAt: Date.now(),
      }),
      { mode: 0o600 }
    );
    fs.renameSync(tmpPath, TOKEN_CACHE_PATH);
  } catch {
    // ignore write failures
  }
}

function invalidateTokenCache() {
  try {
    fs.unlinkSync(TOKEN_CACHE_PATH);
  } catch {
    // ignore
  }
}

function readTokenFromFiles() {
  for (const filePath of FALLBACK_TOKEN_FILES) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const entry = parseTokenBlob(raw);
      if (isTokenFresh(entry, 30_000)) {
        return entry;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function readTokenFromOSKeychain() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WIN_CRED_PS_SCRIPT],
        {
          encoding: "utf8",
          timeout: 3500,
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        }
      );
      return parseTokenBlob(out);
    }
    if (process.platform === "darwin") {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"],
        {
          encoding: "utf8",
          timeout: 2500,
          stdio: ["ignore", "pipe", "ignore"],
        }
      );
      return parseTokenBlob(out);
    }
    if (process.platform === "linux") {
      const out = execFileSync(
        "secret-tool",
        ["lookup", "service", "gemini", "account", "antigravity"],
        {
          encoding: "utf8",
          timeout: 2500,
          stdio: ["ignore", "pipe", "ignore"],
        }
      );
      return parseTokenBlob(out);
    }
  } catch {
    // ignore keychain lookup errors
  }
  return null;
}

function getAccessToken({ forceRefresh = false } = {}) {
  if (process.env.ANTIGRAVITY_OAUTH_TOKEN) {
    const envToken = parseTokenBlob(process.env.ANTIGRAVITY_OAUTH_TOKEN);
    if (envToken) return envToken.accessToken;
  }

  if (!forceRefresh) {
    const cached = readCachedToken();
    if (cached) return cached.accessToken;
  }

  const fromFiles = readTokenFromFiles();
  if (fromFiles && isTokenFresh(fromFiles, 30_000)) {
    writeCachedToken(fromFiles);
    return fromFiles.accessToken;
  }

  const fromKeychain = readTokenFromOSKeychain();
  if (fromKeychain && fromKeychain.accessToken) {
    writeCachedToken(fromKeychain);
    return fromKeychain.accessToken;
  }

  if (fromFiles && fromFiles.accessToken) {
    return fromFiles.accessToken;
  }

  return null;
}

module.exports = {
  TOKEN_CACHE_PATH,
  getAccessToken,
  invalidateTokenCache,
};
