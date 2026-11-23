# ⚡ agy-quota-live — Real-Time `/quota` Status-Line HUD for Antigravity CLI

<p align="center">
  <img src="assets/logo.svg" alt="agy-quota-live logo" width="110" />
</p>

<p align="center">
  <b><a href="#-english-documentation">🇬🇧 English Documentation</a></b> · <b><a href="#-documentación-en-español">🇪🇸 Documentación en Español</a></b> · <b><a href="README.es.md">🇪🇸 README.es.md</a></b>
</p>

---

## 🇬🇧 English Documentation

**`agy-quota-live`** is a zero-dependency, cross-platform (Windows, macOS, Linux) status-line HUD plugin for **Google Antigravity CLI (`agy`)** that displays session telemetry, active models, and **all `/quota` model groups in real time** in a compact **2-line layout** (or an optional **3-line dashboard layout**).

```text
◆ Gemini 4 Hydrogen (XHigh) [Pro] [Auto] │ Ctx ▌░░░░░░░ 6% (58k/1M) │ development ⎇ main │ ◈ 1sub ⏱ 1 │ ● Idle $0.42 ⚡
▸Gem(Neon·Hydro·3.8F) 5h ███▌ 86% (4h43m) · Sem ███▊ 95% (6d2h) │ Claude 5.5/GPT 5h ████ 100% · Sem ████ 100% │ Argon Sem ████ 100%
```

### What's New in `v1.1.0`

- **Full Support for `agy 1.5.x` Models & Quotas**:
  - Dynamically parses model rosters from `retrieveUserQuotaSummary` (`groupDescription`), automatically listing **Gemini 4 Neon**, **Gemini 4 Hydrogen**, **Gemini 3.8 Flash**, **Claude Opus 5.5**, **Claude Sonnet 5.5**, **GPT-OSS 120B**, **Gemini 4 Argon**, and **Gemini 4 Carbon** (Ultra/Enterprise).
  - **Orchestrator & Effort Awareness**: Recognizes `Orchestrator (Neon)`, `Orchestrator (Carbon)`, `Orchestrator (Argon)`, `Orchestrator (Opus 5.5)`, and `settings.json` orchestrator settings—highlighting the planner group with `▸` and secondary executor group with `▹` when they span different buckets.
  - **Ultra Plan Fallback**: Correctly highlights `Gem` when running `Gemini 4 Argon` on Google AI Ultra (where Argon shares the Gemini bucket).
- **Refined Terminal UI**:
  - **Smooth 1/8th Sub-Character Bars (`▏▎▍▌▋▊▉█`)**: 8× higher visual precision so `92%` is visually distinct from `100%` and `6%` context never looks empty.
  - **Distinct Tier vs. Mode Badges**: Separates `[Pro]`/`[Ultra]` from `[Auto]`/`[Plan]`/`[Edit]` with distinct readable 256-color ANSI tokens (compatible with Solarized Dark and dark/light terminals).
  - **Live `agy 1.5.x` Telemetry (when active)**: Shows running subagents (`◈ Nsub`), background tasks (`⏱ N`), queued prompts (`✉ N`), pending confirmations (`⚠ Confirm`), and Vim mode (`[N]`/`[I]`/`[V]`).
  - **Smart Responsive Scaling & Optional 3-Line Mode**: Keeps bars visible down to ~100 columns, displays group model tags automatically when width permits, and includes a 3-line dashboard view (`node src/cli.js config layout 3line`).

### Key Features

- **All `/quota` Groups in Real Time**:
  - **Gemini Models**: `Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash` (`gemini-5h`, `gemini-weekly`)
  - **Claude & GPT Models**: `Claude Opus 5.5`, `Claude Sonnet 5.5`, `GPT-OSS 120B` (`3p-5h`, `3p-weekly`)
  - **Gemini 4 Argon**: Separate Pro weekly bucket (`gemini-argon-wtu-weekly`) or shared Ultra bucket
  - **Gemini 4 Carbon & Future Buckets**: Dynamic bucket metadata & `disabled` / `remainingAmount` support
- **Same Convention as `/quota`**: Shows **% remaining** (Green `>50%`, Yellow `25–50%`, Orange `10–25%`, Red `≤10%`) + **reset countdown** (`4h43m`, `6d2h`).
- **True Real-Time Sync (~200ms, 0 Token Cost)**:
  - **`SessionStart`, `PostInvocation` & `Stop` Hooks (`hooks.json`)**: Triggers non-blocking background refresh during tool loops and synchronous cloud sync on turn end.
  - **Monotonic Window Merger**: Combines `retrieveUserQuotaSummary` with `stdin` `payload.quota` via `Math.min` within the active reset window.
  - **Windows-Safe Atomic Cache Writes**: Handles concurrent statusline/hook updates cleanly without leaving `.tmp` files behind.

---

### Installation (English)

#### Requirements
- **Antigravity CLI (`agy`)** `1.3.5+` (tested on `1.5.14`)
- **Node.js** `18+`

#### Option A: Clone directly into Antigravity Plugins (Recommended)

**Windows (PowerShell):**
```powershell
git clone https://github.com/LautaroZapata/agy-quota-live.git "$HOME\.gemini\config\plugins\agy-quota-live"
agy plugin enable agy-quota-live
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" install
```

**macOS / Linux:**
```bash
git clone https://github.com/LautaroZapata/agy-quota-live.git ~/.gemini/config/plugins/agy-quota-live
agy plugin enable agy-quota-live
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js install
```

---

### CLI Commands & Configuration

```bash
# Inspect OAuth token status, all /quota groups & models, and preview the HUD
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js doctor

# View or change HUD preferences (~/.gemini/antigravity-cli/agy-quota-live.json)
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js config
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js config layout 3line        # 2line | 3line
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js config showGroupModels auto # auto | always | never
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js config smoothBars true    # true | false
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js config showTelemetry true # true | false
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js config reset

# Force a quota cache refresh
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js refresh

# Wire or remove statusLine in ~/.gemini/antigravity-cli/settings.json
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js install
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js uninstall
```

---

## 🇪🇸 Documentación en Español

**`agy-quota-live`** es un plugin de barra de estado (HUD) sin dependencias externas y multiplataforma (Windows, macOS y Linux) para **Google Antigravity CLI (`agy`)**. Muestra toda la telemetría de tu sesión, el modelo activo y **todos los grupos y modelos de `/quota` en tiempo real** en un diseño compacto de **2 líneas** (o modo **dashboard de 3 líneas** opcional).

```text
◆ Gemini 4 Hydrogen (XHigh) [Pro] [Auto] │ Ctx ▌░░░░░░░ 6% (58k/1M) │ development ⎇ main │ ◈ 1sub ⏱ 1 │ ● Idle $0.42 ⚡
▸Gem(Neon·Hydro·3.8F) 5h ███▌ 86% (4h43m) · Sem ███▊ 95% (6d2h) │ Claude 5.5/GPT 5h ████ 100% · Sem ████ 100% │ Argon Sem ████ 100%
```

### Novedades en `v1.1.0`

- **Soporte completo para los nuevos modelos de `agy 1.5.x`**:
  - Lee dinámicamente los modelos informados por `retrieveUserQuotaSummary` (`Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash`, `Claude Opus 5.5`, `Claude Sonnet 5.5`, `GPT-OSS 120B`, `Gemini 4 Argon` y `Gemini 4 Carbon`).
  - **Soporte para `Orchestrator` y esfuerzo (`XHigh`, `Max`, etc.)**: Detecta `Orchestrator (Neon)`, `Orchestrator (Carbon)`, `Orchestrator (Argon)`, `Orchestrator (Opus 5.5)` y configuración en `settings.json`, destacando con `▸` el grupo planificador y con `▹` el ejecutor si pertenecen a cuotas distintas.
  - **Fallback en planes Ultra**: Resalta `Gem` cuando usás `Gemini 4 Argon` en Google AI Ultra (donde Argon comparte cuota con Gemini).
- **Mejoras de interfaz**:
  - **Barras suaves de alta precisión (`▏▎▍▌▋▊▉█`)**: 8× más detalle visual para distinguir porcentajes altos y contextos bajos.
  - **Colores diferenciados y legibles en Solarized Dark**: Distinción clara entre plan (`[Pro]`/`[Ultra]`), modo (`[Auto]`/`[Plan]`/`[Edit]`) y nivel de esfuerzo (`(XHigh)`).
  - **Telemetría activa de `agy 1.5.x`**: Muestra subagentes corriendo (`◈ Nsub`), tareas en segundo plano (`⏱ N`), mensajes en cola (`✉ N`), confirmaciones pendientes (`⚠ Confirm`) y modo Vim (`[N]`/`[I]`/`[V]`).
  - **Escalado inteligente y modo opcional de 3 líneas**: Mantiene las barras visibles incluso a ~100 columnas y permite activar vista dashboard de 3 líneas con `node src/cli.js config layout 3line`.

Para la guía completa en español, consulta **[README.es.md](README.es.md)**.

### Project Structure / Estructura del Proyecto

```text
agy-quota-live/
├── plugin.json                 # Antigravity plugin manifest
├── hooks.json                  # Lifecycle hooks (SessionStart, PostInvocation, Stop)
├── package.json                # Node package metadata
├── assets/
│   └── logo.svg                # Plugin icon (128x128 SVG)
├── bin/
│   ├── agy-quota-live.cmd      # Windows statusLine launcher
│   └── agy-quota-live.sh       # macOS / Linux statusLine launcher
├── src/
│   ├── cli.js                  # Entrypoint (statusline, doctor, config, install, hooks)
│   ├── config.js               # User HUD preferences & atomic file writer
│   ├── installer.js            # Auto-configures statusLine in settings.json
│   ├── quota.js                # Cloud Code retrieveUserQuotaSummary client & merger
│   ├── render.js               # Responsive 2-line / 3-line ANSI HUD renderer
│   └── token.js                # Cross-platform OAuth token reader & local cache
├── skills/
│   └── quota-live/
│       └── SKILL.md            # Built-in skill for agent diagnostics
└── test/
    └── quota-live.test.js      # Automated test suite (node:test)
```

## License / Licencia

MIT © [Lautaro Zapata](https://github.com/LautaroZapata)
