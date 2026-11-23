# ⚡ agy-quota-live — HUD de `/quota` en Tiempo Real para Antigravity CLI

<p align="center">
  <img src="assets/logo.svg" alt="agy-quota-live logo" width="110" />
</p>

<p align="center">
  <b><a href="README.md">🇬🇧 Read in English</a></b> · <b>🇪🇸 Español</b>
</p>

**`agy-quota-live`** es un plugin de barra de estado (HUD) sin dependencias externas y multiplataforma (Windows, macOS y Linux) para **Google Antigravity CLI (`agy`)**. Muestra la telemetría de tu sesión, el modelo activo y **todos los grupos y modelos de `/quota` en tiempo real** en un diseño compacto de **2 líneas** (o un modo **dashboard de 3 líneas** opcional).

```text
◆ Gemini 4 Hydrogen (XHigh) [Pro] [Auto] │ Ctx ▌░░░░░░░ 6% (58k/1M) │ development ⎇ main │ ◈ 1sub ⏱ 1 │ ● Idle $0.42 ⚡
▸Gem(Neon·Hydro·3.8F) 5h ███▌ 86% (4h43m) · Sem ███▊ 95% (6d2h) │ Claude 5.5/GPT 5h ████ 100% · Sem ████ 100% │ Argon Sem ████ 100%
```

## ¿Qué incluye esta versión (`v1.1.0`)?

1. **Todos los modelos y grupos actuales de `agy 1.5.14` en `/quota`**:
   - **Gemini Models**: `Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash` (`gemini-5h` y `gemini-weekly`).
   - **Claude & GPT Models**: `Claude Opus 5.5`, `Claude Sonnet 5.5`, `GPT-OSS 120B` (`3p-5h` y `3p-weekly`).
   - **Gemini 4 Argon**: Cuota semanal separada en Pro (`gemini-argon-wtu-weekly`) o compartida en Ultra (resalta `Gem` automáticamente cuando no existe bucket separado).
   - **Gemini 4 Carbon & Orchestrator**: Soporta `Gemini 4 Carbon` y todas las variantes de `Orchestrator` (`Orchestrator (Neon)`, `Orchestrator (Carbon)`, `Orchestrator (Argon)`, `Orchestrator (Opus 5.5)` y configuración en `settings.json`), marcando con `▸` el planificador y `▹` el ejecutor si consumen cuotas distintas.
   - **Detección dinámica desde la API**: Parsea automáticamente los modelos informados en `groupDescription` para adaptarse a futuros modelos sin esperar actualizaciones.
2. **Interfaz visual mejorada y más legible**:
   - **Barras suaves sub-carácter (`▏▎▍▌▋▊▉█`)**: 8× mayor precisión visual en barras de contexto y cuotas.
   - **Jerarquía de color clara**: Colores distintos para modelo, esfuerzo (`(XHigh)`/`(Max)`), plan (`[Pro]`/`[Ultra]`), modo (`[Auto]`/`[Plan]`/`[Edit]`) y grises neutros legibles en temas como Solarized Dark.
   - **Telemetría activa de `agy 1.5.x`**: Muestra subagentes activos (`◈ Nsub`), tareas en background (`⏱ N`), mensajes en cola (`✉ N`), confirmaciones pendientes (`⚠ Confirm`) y modo Vim (`[N]`/`[I]`/`[V]`) solo cuando están activos.
   - **Diseño adaptativo de 2 líneas + modo opcional de 3 líneas**: Mantiene barras visibles hasta ~100 columnas, muestra etiquetas de modelos en Línea 2 cuando el ancho lo permite, y ofrece una vista dashboard de 3 líneas configurable.
3. **Actualización en tiempo real (~200 ms, 0 costo de tokens)**:
   - **Hooks de ciclo de vida (`hooks.json`)**: Refresca en segundo plano en `SessionStart` y `PostInvocation`, y sincroniza en `Stop` apenas finaliza cada respuesta.
   - **Fusión monotónica (`mergeQuotas`)**: Combina la respuesta directa de `retrieveUserQuotaSummary` con el payload `stdin` tomando siempre el menor remanente dentro de la ventana activa.
   - **Escritura atómica segura en Windows**: Evita archivos `.tmp` huérfanos ante accesos concurrentes.

## Instalación Rápida

### Windows (PowerShell)
```powershell
git clone https://github.com/LautaroZapata/agy-quota-live.git "$HOME\.gemini\config\plugins\agy-quota-live"
agy plugin enable agy-quota-live
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" install
```

### macOS / Linux
```bash
git clone https://github.com/LautaroZapata/agy-quota-live.git ~/.gemini/config/plugins/agy-quota-live
agy plugin enable agy-quota-live
node ~/.gemini/config/plugins/agy-quota-live/src/cli.js install
```

## Comandos, Diagnóstico y Configuración

```powershell
# Diagnóstico completo de token OAuth, grupos/modelos de /quota y vista previa del HUD
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" doctor

# Ver o modificar preferencias del HUD (~/.gemini/antigravity-cli/agy-quota-live.json)
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" config
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" config layout 3line         # 2line | 3line
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" config showGroupModels auto  # auto | always | never
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" config smoothBars true     # true | false
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" config showTelemetry true  # true | false
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" config reset

# Forzar sincronización inmediata de la caché de cuotas
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" refresh

# Configurar o quitar statusLine de ~/.gemini/antigravity-cli/settings.json
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" install
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" uninstall
```

## Licencia

MIT © [Lautaro Zapata](https://github.com/LautaroZapata)
