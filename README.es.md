# ⚡ agy-quota-live — HUD de `/quota` en Tiempo Real para Antigravity CLI

<p align="center">
  <img src="assets/logo.svg" alt="agy-quota-live logo" width="110" />
</p>

<p align="center">
  <b><a href="README.md">🇬🇧 Read in English</a></b> · <b>🇪🇸 Español</b>
</p>

**`agy-quota-live`** es un plugin de barra de estado (HUD) sin dependencias externas y multiplataforma (Windows, macOS y Linux) para **Google Antigravity CLI (`agy`)**. Muestra toda la telemetría de tu sesión y **todos los grupos de cuotas de `/quota` en tiempo real** en un diseño compacto de **2 líneas**.

```text
◆ Gemini 4 Argon (High) [Pro] [Auto] │ Ctx ██░░░░░░ 29% (58k/200k) │ kalabs ⎇ main │ ● Idle ⚡
Gem 5h ████ 100% (5h00m) · Sem ████ 99% (6d13h) │ Claude/GPT 5h ████ 100% (5h00m) · Sem ██░░ 54% (6d13h) │ ▸Argon Sem ██░░ 62% (6d12h)
```

## ¿Qué soluciona respecto a `agy-hud`?

1. **Muestra los 3 grupos y 5 buckets reales de `/quota`**:
   - **Gemini Models**: 5 horas (`gemini-5h`) y Semanal (`gemini-weekly`)
   - **Claude and GPT models**: 5 horas (`3p-5h`) y Semanal (`3p-weekly`)
   - **Gemini 4 Argon**: Semanal (`gemini-argon-wtu-weekly`)
   - Envía el `User-Agent` oficial de Antigravity CLI (`antigravity/cli/1.4.5 ...`) al endpoint `retrieveUserQuotaSummary`, evitando que el backend oculte los grupos de Gemini y Argon.
2. **Actualización verdaderamente en tiempo real (~200 ms, 0 costo de tokens)**:
   - **Hooks de ciclo de vida (`hooks.json`)**: refresca en segundo plano sin bloqueo en cada `PostInvocation` (`<5 ms`) y sincroniza la cuota en `Stop` apenas termina cada respuesta del modelo.
   - **Fusión monotónica (`mergeQuotas`)**: combina la respuesta directa de la nube con el objeto `quota` de `stdin`, eligiendo siempre el valor más actualizado dentro de la ventana activa.
3. **2 líneas limpias y adaptativas**:
   - **Línea 1**: Modelo activo, plan (`[Pro]`), modo (`[Auto]` / `[Plan]` / `[Edit]`), barra de uso de contexto + `%` + tokens (`(input/window)`), directorio + rama Git (`⎇`), estado del agente (`● Idle` / `◐ Thinking` / `⚙ Working`), costo de sesión e indicador `⚡` de sincronización en vivo.
   - **Línea 2**: Porcentaje **restante** (igual que `/quota`) + cuenta regresiva de reinicio (`5h00m`, `6d12h`) con barras de color (Verde `>50%`, Amarillo `25–50%`, Naranja `10–25%`, Rojo `≤10%`), resaltando con `▸` el grupo que consume tu modelo actual.

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

## Comandos Útiles

```powershell
# Diagnóstico completo de token OAuth, los 5 buckets de /quota y vista previa del HUD
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" doctor

# Forzar sincronización inmediata de la caché de cuotas
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" refresh

# Configurar statusLine en ~/.gemini/antigravity-cli/settings.json
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" install

# Quitar statusLine de settings.json
node "$HOME\.gemini\config\plugins\agy-quota-live\src\cli.js" uninstall
```

## Licencia

MIT © [Lautaro Zapata](https://github.com/LautaroZapata)
