# ⚡ agy-quota-live — Real-Time `/quota` Status-Line HUD for Antigravity CLI

<p align="center">
  <img src="assets/logo.svg" alt="agy-quota-live logo" width="110" />
</p>

<p align="center">
  <b><a href="#-english-documentation">🇬🇧 English Documentation</a></b> · <b><a href="#-documentación-en-español">🇪🇸 Documentación en Español</a></b> · <b><a href="README.es.md">🇪🇸 README.es.md</a></b>
</p>

---

## 🇬🇧 English Documentation

**`agy-quota-live`** is a zero-dependency, cross-platform (Windows, macOS, Linux) status-line HUD plugin for **Google Antigravity CLI (`agy`)** that displays session telemetry and **all `/quota` model groups in real time** in a compact **2-line layout**.

```text
◆ Gemini 4 Argon (High) [Pro] [Auto] │ Ctx ██░░░░░░ 29% (58k/200k) │ kalabs ⎇ main │ ● Idle ⚡
Gem 5h ████ 100% (5h00m) · Sem ████ 99% (6d13h) │ Claude/GPT 5h ████ 100% (5h00m) · Sem ██░░ 54% (6d13h) │ ▸Argon Sem ██░░ 62% (6d12h)
```

### Why `agy-quota-live`?

Existing HUD plugins (such as `agy-hud`) suffer from three critical issues on recent Antigravity CLI versions (`1.4.x+`):
1. **Missing Quota Groups (`Gemini` & `Gemini 4 Argon`)**: Legacy HUDs call `retrieveUserQuotaSummary` with an outdated `User-Agent` (`antigravity/0.3.x`), causing Google's backend to return only the `Claude and GPT models` group and omit `Gemini Models` and `Gemini 4 Argon`.
2. **Incomplete Bucket Parsing**: `gemini-argon-wtu-weekly` is ignored by legacy parsers, and Protobuf JSON's omission of `remainingFraction: 0` when a bucket reaches `0%` causes exhausted buckets to be misreported.
3. **Stale Quota Numbers**: Relying on 2-minute caches or overwriting cloud quota with `stdin` `payload.quota` causes the status bar to lag behind `/quota` after turns complete.

### Key Features

- **All 3 Groups & 5 Buckets from `/quota`**:
  - **Gemini Models**: 5-Hour (`gemini-5h`) & Weekly (`gemini-weekly`)
  - **Claude & GPT Models**: 5-Hour (`3p-5h`) & Weekly (`3p-weekly`)
  - **Gemini 4 Argon**: Weekly (`gemini-argon-wtu-weekly`) + any future buckets dynamically
- **Same Convention as `/quota`**: Shows **% remaining** (color-coded: Green `>50%`, Yellow `25–50%`, Orange `10–25%`, Red `≤10%`) + **reset countdown** (`4h59m`, `6d12h`) and highlights the active model's quota group with `▸`.
- **True Real-Time Sync (~200ms, 0 Token Cost)**:
  - **`PostInvocation` & `Stop` Lifecycle Hooks (`hooks.json`)**: Triggers a non-blocking background refresh during tool loops (`<5ms` overhead) and a synchronous cloud sync right when a turn ends so the idle redraw is immediately up-to-date.
  - **Monotonic Window Merger**: Combines `retrieveUserQuotaSummary` cloud data with `stdin` `payload.quota` using `Math.min` within the same reset window so whichever source updates first wins immediately.
  - **Fast Cross-Platform OAuth Keychain Cache**: Reads the Antigravity OAuth token from Windows Credential Manager (`gemini:antigravity` via P/Invoke `CredRead`), macOS Keychain (`security`), or Linux `secret-tool`, caching it locally with `0600` permissions and auto-refreshing on expiry/HTTP 401.
- **Responsive 2-Line Layout**: Automatically adapts to narrow terminals (`terminal_width`) without wrapping into 3+ lines.

---

### Installation (English)

#### Requirements
- **Antigravity CLI (`agy`)** `1.3.5+` (tested on `1.4.5`)
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

#### Option B: Install via `agy plugin install`
If you cloned the repository to another folder, stage a clean folder (without `.git`) and install it:

```bash
node src/cli.js install
```
> Note: Once the plugin is enabled in Antigravity, its `SessionStart` and `PostInvocation` hooks in `hooks.json` will also automatically ensure `statusLine` is wired in `~/.gemini/antigravity-cli/settings.json`.

---

### CLI Commands & Diagnostics

```bash
# Inspect OAuth token status, all 5 /quota buckets, and preview the 2-line HUD
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js doctor

# Force a background quota cache refresh
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js refresh

# Wire statusLine in ~/.gemini/antigravity-cli/settings.json
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js install

# Remove statusLine wiring from settings.json
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js uninstall
```

---

## 🇪🇸 Documentación en Español

**`agy-quota-live`** es un plugin de barra de estado (HUD) sin dependencias externas y multiplataforma (Windows, macOS y Linux) para **Google Antigravity CLI (`agy`)**. Muestra toda la telemetría de tu sesión y **todos los grupos de cuotas de `/quota` en tiempo real** en un diseño compacto de **2 líneas**.

```text
◆ Gemini 4 Argon (High) [Pro] [Auto] │ Ctx ██░░░░░░ 29% (58k/200k) │ kalabs ⎇ main │ ● Idle ⚡
Gem 5h ████ 100% (5h00m) · Sem ████ 99% (6d13h) │ Claude/GPT 5h ████ 100% (5h00m) · Sem ██░░ 54% (6d13h) │ ▸Argon Sem ██░░ 62% (6d12h)
```

### ¿Por qué `agy-quota-live`?

Los plugins de HUD anteriores (como `agy-hud`) tienen tres problemas críticos en las versiones actuales de Antigravity CLI (`1.4.x+`):
1. **Faltan grupos de cuotas (`Gemini` y `Gemini 4 Argon`)**: llaman al endpoint `retrieveUserQuotaSummary` con un `User-Agent` viejo (`antigravity/0.3.x`), por lo que el servidor de Google solo devuelve el grupo `Claude and GPT models` y omite `Gemini Models` y `Gemini 4 Argon`.
2. **Parser incompleto**: ignoran el bucket `gemini-argon-wtu-weekly` y no contemplan que Protobuf JSON omite `remainingFraction: 0` cuando una cuota llega a `0%`.
3. **Datos desactualizados**: usan cachés de 2 minutos y pisan la respuesta de la nube con el objeto `quota` de `stdin`, haciendo que el HUD quede atrasado respecto a `/quota`.

### Características Principales

- **Los 3 Grupos y 5 Buckets de `/quota` en una sola línea**:
  - **Gemini Models**: 5 horas (`gemini-5h`) y Semanal (`gemini-weekly`)
  - **Claude & GPT Models**: 5 horas (`3p-5h`) y Semanal (`3p-weekly`)
  - **Gemini 4 Argon**: Semanal (`gemini-argon-wtu-weekly`) + soporte dinámico para nuevos buckets
- **Misma convención que `/quota`**: muestra el **% restante** (codificado por color: Verde `>50%`, Amarillo `25–50%`, Naranja `10–25%`, Rojo `≤10%`) + **cuenta regresiva de reinicio** (`4h59m`, `6d12h`), destacando con `▸` el grupo que consume tu modelo activo.
- **Sincronización en Tiempo Real (~200ms, 0 consumo de tokens)**:
  - **Hooks de ciclo de vida (`PostInvocation` y `Stop` en `hooks.json`)**: lanza una actualización en segundo plano sin bloqueo entre llamadas a herramientas (`<5ms`) y sincroniza la cuota en `Stop` apenas termina cada respuesta del modelo.
  - **Fusión Monotónica (`mergeQuotas`)**: combina los datos en vivo de `retrieveUserQuotaSummary` con el payload de `stdin` tomando `Math.min` dentro de la misma ventana de reinicio para reflejar el consumo al instante.
  - **Lectura Rápida de Credenciales OAuth**: obtiene el token desde el Administrador de Credenciales de Windows (`gemini:antigravity` vía P/Invoke `CredRead`), Keychain de macOS (`security`) o `secret-tool` en Linux, guardando una caché local con permisos `0600` y renovándola automáticamente si expira o recibe HTTP `401`.
- **Diseño Adaptativo de 2 Líneas**: se ajusta automáticamente al ancho de la terminal (`terminal_width`) sin desbordarse en más líneas.

---

### Instalación (Español)

#### Requisitos
- **Antigravity CLI (`agy`)** `1.3.5+` (probado en `1.4.5`)
- **Node.js** `18+`

#### Opción A: Clonar directamente en la carpeta de plugins de Antigravity (Recomendado)

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

> Nota: si tienes instalado `agy-hud`, puedes deshabilitarlo con `agy plugin disable agy-hud`. Además, cuando `agy-quota-live` está habilitado, el hook `SessionStart` configura automáticamente `statusLine` en `~/.gemini/antigravity-cli/settings.json`.

---

### Comandos de Diagnóstico y Utilidades

```powershell
# Ver estado del token OAuth, detalle de los 5 buckets de /quota y vista previa del HUD
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" doctor

# Forzar actualización manual de la caché de cuotas
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" refresh

# Configurar statusLine en ~/.gemini/antigravity-cli/settings.json
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" install

# Desinstalar statusLine de settings.json
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" uninstall
```

---

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
│   ├── cli.js                  # Entrypoint (statusline, doctor, install, hooks)
│   ├── installer.js            # Auto-configures statusLine in settings.json
│   ├── quota.js                # Cloud Code retrieveUserQuotaSummary client & cache merger
│   ├── render.js               # 2-line responsive ANSI HUD renderer
│   └── token.js                # Cross-platform OAuth token reader & local cache
└── skills/
    └── quota-live/
        └── SKILL.md            # Built-in skill for agent diagnostics
```

## License / Licencia

MIT © [Lautaro Zapata](https://github.com/LautaroZapata)
