# Melexis IO Tools

Browser utilities for the STM32 USB CDC boards — no install, no build step, no drivers.
Everything runs client-side from a static page.

**Live: https://icis4.github.io/ag1**

| Tool | Page | Uses |
|---|---|---|
| SCPI Terminal | [terminal.html](terminal.html) | Web Serial |
| DFU Updater | [dfuupdate.html](dfuupdate.html) | WebUSB |

## Requirements

- A Chromium-based browser — Chrome, Edge or Opera. Firefox and Safari implement neither
  Web Serial nor WebUSB.
- A secure context: `https://` or `http://localhost`. The hosted site qualifies.

## SCPI Terminal

A serial console for SCPI command sets over USB CDC.

- Port settings: 300–921600 baud, 7/8 data bits, 1/2 stop bits, parity, hardware flow control.
  Baud rate is ignored by CDC devices but is sent anyway for real UART bridges.
- ASCII, HEX or both display modes, optional timestamps, local echo, auto-scroll.
- Command history across sessions (stored in the browser), browsable with Up/Down.
- Autocomplete and per-command help, both discovered from the device on connect.
- Log export with timestamps and direction labels.

### Line endings

Pick **LF**. The `melexis_io` and `evb-gen3` parsers strip only the trailing `\n`, so CR+LF leaves
a stray `\r` glued to the last argument and the command is rejected; CR alone never terminates a
line at all. `mip-firmware` accepts LF, CR and `;`, but LF is the only choice that works
everywhere.

### Supported firmware

| | `melexis_io_fw` | `evb-gen3-fw` | `mip-firmware` |
|---|---|---|---|
| command catalog | `:SYST:HELP:LIST` | `:SYST:HELP:LIST` | `:FILE:CAT 0:/commands.txt` |
| line terminators | LF | LF | LF, CR or `;` |
| prompt | `\n(OK)>` | `\n(OK)>` | `\n(OK)>\n` |

The terminal probes for each catalog source in turn and falls through to `:SYST:HELP`, which all
three implement, so connecting works without telling it which board is attached.

The full protocol contract — framing, prompt parsing, probe order, per-firmware divergences — is
in [.claude/skills/melexis-scpi/SKILL.md](.claude/skills/melexis-scpi/SKILL.md).

## DFU Updater

Flashes ST DfuSe `.dfu` images over WebUSB, talking to STM DFU bootloaders directly. Parses DfuSe
targets and elements, reads DFU functional descriptors, recovers STM memory maps from USB string
descriptors, and supports a manual memory-map override for bootloaders that expose none.

On `melexis_io`, `:SYSTem:DFU 42` from the terminal reboots the board into its bootloader, where
this tool picks it up.

## Running locally

```bash
python3 -m http.server 3000 --bind 127.0.0.1
```

Then open http://localhost:3000. Any static file server works; `localhost` is a secure context, so
both Web Serial and WebUSB are available.

## Installing as an app

The suite is a PWA. Chrome offers an install button on the frontpage, or use *Install page as app*
from the browser menu.

The service worker is deliberately **network-first**: a cache-first worker keeps serving stale
pages during development, so the cache here is only an offline fallback. If that is ever reversed,
`CACHE` in [service-worker.js](service-worker.js) has to be versioned per deploy.

## Layout

```
index.html            frontpage and install prompt
terminal.html         SCPI terminal markup
app.js                terminal logic — serial I/O, rendering, probes
style.css             terminal and frontpage styles
dfuupdate.html        DFU updater, self-contained
favicon.svg           shared icon
manifest.webmanifest  PWA manifest
service-worker.js     offline shell
```

Deployed straight from `master` by GitHub Pages.
