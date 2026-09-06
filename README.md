# OpenCode System Metrics TUI

OpenCode TUI plugin that adds live CPU, RAM, GPU, GPU VRAM, temperature, and network metrics to the `sidebar_content` slot.

The README is available in **Español**, **English**, and **Português**.

---

## Español

### Características

- CPU: utilización y temperatura.
- RAM: memoria usada, total y porcentaje.
- GPU: utilización y temperatura.
- GPU VRAM: memoria usada, total y porcentaje.
- Red: velocidad de descarga y subida en tiempo real.
- Actualización cada 2 segundos.
- Colores compatibles con el tema activo de OpenCode.
- Iconos Hack Nerd Font con fallback Unicode.
- En Windows usa iconos Unicode visibles de forma predeterminada, porque OpenCode no puede detectar la fuente activa de la terminal.
- Soporte para Linux, macOS y Windows cuando el sistema expone las métricas.
- En Windows, la temperatura de CPU requiere LibreHardwareMonitor ejecutándose como administrador con **Remote Web Server** activo en `http://127.0.0.1:8085`.
- En Windows, la velocidad de red usa PowerShell y `Get-NetAdapterStatistics`; no agrega una dependencia npm.

### Requisitos

- OpenCode `1.18.29` o posterior con soporte para plugins TUI.
- Node.js 18 o superior.
- Bun para compilar el plugin.

### Instalación local

```bash
npm install
npm run build
npm run install-font
opencode
```

`npm run install-font` instala **Hack Nerd Font** únicamente para el usuario actual. No se ejecuta automáticamente durante `npm install` y solicita confirmación antes de descargar la fuente oficial.

Comandos adicionales:

```bash
npm run install-font -- --check  # comprobar sin descargar
npm run install-font -- --yes    # instalar sin confirmación interactiva
```

### Hack Nerd Font

Se recomienda seleccionar **Hack Nerd Font Mono** en la configuración de la terminal. El instalador utiliza la distribución oficial de [Nerd Fonts](https://www.nerdfonts.com/) y descarga los archivos desde el [repositorio oficial de Hack](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/Hack).

La fuente se instala solo para el usuario actual:

- Linux: `~/.local/share/fonts`
- macOS: `~/Library/Fonts`
- Windows: `%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts`

Después de instalarla, selecciona **Hack Nerd Font Mono** en la terminal y reinicia la terminal y OpenCode. Si no se selecciona una Nerd Font, el plugin usa iconos Unicode de fallback.

### Publicación e instalación desde npm

Antes de publicar, cambia el nombre del paquete en `package.json` por un nombre disponible en tu cuenta u organización npm:

```bash
npm run build
npm publish --access public
```

En otro equipo:

```bash
opencode plugin opencode-system-metrics-tui
```

El instalador de OpenCode configura el plugin TUI automáticamente. Reinicia OpenCode después de instalarlo.

Publicar en npm e instalar en OpenCode son pasos distintos:

- `npm publish --access public` publica el paquete en npm.
- `opencode plugin opencode-system-metrics-tui` lo instala solo en el proyecto actual.
- `opencode plugin -g opencode-system-metrics-tui` lo instala globalmente para todos los proyectos.

### Verificación

```bash
npm test
npm run typecheck
npm run build
```

---

## English

### Features

- CPU: utilization and temperature.
- RAM: used memory, total memory, and percentage.
- GPU: utilization and temperature.
- GPU VRAM: used memory, total memory, and percentage.
- Network: live download and upload speeds.
- Refreshes every 2 seconds.
- Uses the active OpenCode theme colors.
- Hack Nerd Font icons with Unicode fallback.
- On Windows, visible Unicode icons are used by default because OpenCode cannot detect the terminal's active font.
- Supports Linux, macOS, and Windows when the operating system exposes the metrics.
- On Windows, CPU temperature requires LibreHardwareMonitor running as administrator with **Remote Web Server** enabled at `http://127.0.0.1:8085`.
- On Windows, network speed uses PowerShell and `Get-NetAdapterStatistics`; it adds no npm dependency.

### Requirements

- OpenCode `1.18.29` or newer with TUI plugin support.
- Node.js 18 or newer.
- Bun to build the plugin.

### Local installation

```bash
npm install
npm run build
npm run install-font
opencode
```

`npm run install-font` installs **Hack Nerd Font** for the current user only. It is not executed automatically by `npm install` and asks for confirmation before downloading the official font.

Extra commands:

```bash
npm run install-font -- --check  # check without downloading
npm run install-font -- --yes    # install without an interactive prompt
```

### Hack Nerd Font

Select **Hack Nerd Font Mono** in your terminal settings. The installer uses the official [Nerd Fonts](https://www.nerdfonts.com/) distribution and downloads files from the [official Hack repository](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/Hack).

The font is installed for the current user only:

- Linux: `~/.local/share/fonts`
- macOS: `~/Library/Fonts`
- Windows: `%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts`

After installation, select **Hack Nerd Font Mono** in the terminal and restart the terminal and OpenCode. If a Nerd Font is not selected, the plugin uses Unicode fallback icons.

### Publishing and npm installation

Before publishing, change the package name in `package.json` to a name available in your npm account or organization:

```bash
npm run build
npm publish --access public
```

On another machine:

```bash
opencode plugin opencode-system-metrics-tui
```

The OpenCode installer configures the TUI plugin automatically. Restart OpenCode after installation.

Publishing to npm and installing in OpenCode are separate steps:

- `npm publish --access public` publishes the package to npm.
- `opencode plugin opencode-system-metrics-tui` installs it for the current project only.
- `opencode plugin -g opencode-system-metrics-tui` installs it globally for all projects.

### Verification

```bash
npm test
npm run typecheck
npm run build
```

---

## Português

### Funcionalidades

- CPU: utilização e temperatura.
- RAM: memória usada, total e porcentagem.
- GPU: utilização e temperatura.
- GPU VRAM: memória usada, total e porcentagem.
- Rede: velocidades de download e upload em tempo real.
- Atualização a cada 2 segundos.
- Usa as cores do tema ativo do OpenCode.
- Ícones Hack Nerd Font com fallback Unicode.
- No Windows, ícones Unicode visíveis são usados por padrão porque o OpenCode não consegue detectar a fonte ativa do terminal.
- Suporte para Linux, macOS e Windows quando o sistema disponibiliza as métricas.
- No Windows, a temperatura da CPU requer o LibreHardwareMonitor executado como administrador com o **Remote Web Server** ativo em `http://127.0.0.1:8085`.
- No Windows, a velocidade da rede usa o PowerShell e `Get-NetAdapterStatistics`; nenhuma dependência npm é adicionada.

### Requisitos

- OpenCode `1.18.29` ou posterior com suporte a plugins TUI.
- Node.js 18 ou superior.
- Bun para compilar o plugin.

### Instalação local

```bash
npm install
npm run build
npm run install-font
opencode
```

`npm run install-font` instala a **Hack Nerd Font** somente para o usuário atual. O comando não é executado automaticamente durante `npm install` e pede confirmação antes de baixar a fonte oficial.

Comandos adicionais:

```bash
npm run install-font -- --check  # verificar sem baixar
npm run install-font -- --yes    # instalar sem confirmação interativa
```

### Hack Nerd Font

Selecione **Hack Nerd Font Mono** nas configurações do terminal. O instalador usa a distribuição oficial da [Nerd Fonts](https://www.nerdfonts.com/) e baixa os arquivos do [repositório oficial da Hack](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/Hack).

A fonte é instalada somente para o usuário atual:

- Linux: `~/.local/share/fonts`
- macOS: `~/Library/Fonts`
- Windows: `%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts`

Depois da instalação, selecione **Hack Nerd Font Mono** no terminal e reinicie o terminal e o OpenCode. Se uma Nerd Font não estiver selecionada, o plugin usará ícones Unicode de fallback.

### Publicação e instalação pelo npm

Antes de publicar, altere o nome do pacote em `package.json` para um nome disponível na sua conta ou organização npm:

```bash
npm run build
npm publish --access public
```

Em outro computador:

```bash
opencode plugin opencode-system-metrics-tui
```

O instalador do OpenCode configura o plugin TUI automaticamente. Reinicie o OpenCode após a instalação.

Publicar no npm e instalar no OpenCode são etapas diferentes:

- `npm publish --access public` publica o pacote no npm.
- `opencode plugin opencode-system-metrics-tui` instala o plugin apenas no projeto atual.
- `opencode plugin -g opencode-system-metrics-tui` instala o plugin globalmente para todos os projetos.

### Verificação

```bash
npm test
npm run typecheck
npm run build
```

---

## License

This plugin is released under the [MIT License](LICENSE). The Hack Nerd Font files are third-party assets; see the [official Hack Nerd Fonts repository](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/Hack) for their applicable license and notices.

Este plugin está publicado bajo la [licencia MIT](LICENSE). Los archivos Hack Nerd Font son recursos de terceros; consulta el [repositorio oficial](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/Hack) para conocer su licencia y avisos.

Este plugin é distribuído sob a [licença MIT](LICENSE). Os arquivos Hack Nerd Font são recursos de terceiros; consulte o [repositório oficial](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/Hack) para obter a licença e os avisos aplicáveis.
