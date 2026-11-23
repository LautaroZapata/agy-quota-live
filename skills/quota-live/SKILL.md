---
name: quota-live
description: Diagnose, inspect, configure, or force-refresh the agy-quota-live real-time /quota status-line HUD plugin for Antigravity CLI.
---

# agy-quota-live Skill

`agy-quota-live` renders a real-time 2-line (or optional 3-line dashboard) HUD in the Antigravity CLI status bar showing session/context/subagent telemetry on Line 1 and all `/quota` groups & models (`Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash`, `Gemini 4 Carbon`, `Gemini 4 Argon`, `Claude Opus/Sonnet 5.5`, `GPT-OSS 120B`, and `Orchestrator`) with remaining percentage, smooth sub-character bars, and reset countdowns.

## Diagnostic, Config & Refresh Commands

Run the diagnostic check and force a live cloud sync:

```powershell
node "C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\cli.js" doctor
```

Inspect or change HUD display settings (`layout`: `2line` | `3line`, `showGroupModels`: `auto` | `always` | `never`, `smoothBars`: `true` | `false`, `showTelemetry`: `true` | `false`):

```powershell
node "C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\cli.js" config
node "C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\cli.js" config layout 3line
```

## Architecture & Files

- Plugin manifest: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\plugin.json`
- Lifecycle hooks (`SessionStart`, `PostInvocation` & `Stop`): `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\hooks.json`
- Windows statusLine launcher: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\bin\agy-quota-live.cmd`
- HUD user config store & atomic file writer: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\config.js`
- OAuth token reader & cache: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\token.js`
- Real-time `/quota` client, dynamic group model parser & monotonic merger: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\quota.js`
- Responsive 2-line / 3-line ANSI renderer: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\render.js`
