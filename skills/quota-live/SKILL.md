---
name: quota-live
description: Diagnose, inspect, or force-refresh the agy-quota-live real-time /quota status-line HUD plugin for Antigravity CLI.
---

# agy-quota-live Skill

`agy-quota-live` renders a real-time 2-line HUD in the Antigravity CLI status bar showing session/context telemetry on Line 1 and all 5 `/quota` buckets (`gemini-5h`, `gemini-weekly`, `3p-5h`, `3p-weekly`, `gemini-argon-wtu-weekly`) with remaining percentage and reset countdown on Line 2.

## Diagnostic & Manual Refresh Commands

Run the diagnostic check and force a live cloud sync:

```powershell
node "C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\cli.js" doctor
```

## Architecture & Files

- Plugin manifest: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\plugin.json`
- Lifecycle hooks (`PostInvocation` & `Stop`): `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\hooks.json`
- Windows statusLine launcher: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\bin\agy-quota-live.cmd`
- OAuth token reader & cache: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\token.js`
- Real-time `/quota` client & monotonic merger: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\quota.js`
- 2-line responsive ANSI renderer: `C:\Users\yovng\.gemini\config\plugins\agy-quota-live\src\render.js`
