# Melexis IO Tools

Browser utilities for the Melexis.IO device and the chips it talks to — no install, no build
step, no drivers. Everything runs client-side from a static page.

**Live: https://icis4.github.io/ag1**

| Tool | Page | Uses |
|---|---|---|
| SCPI Terminal | [terminal.html](terminal.html) | Web Serial |
| DFU Updater | [dfuupdate.html](dfuupdate.html) | WebUSB |
| Pressure | [pressure.html](pressure.html) | Web Serial → I2C/SPI |
| Infrared | [infrared.html](infrared.html) | Web Serial → I2C |

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

Connect tries to put the board into DFU mode by itself: the Terminal page cannot hand over its
open port, but ports already granted to this origin are visible here, so one is opened briefly to
send `:SYSTem:DFU 42` before the device picker appears. It is best effort — a busy port or a
device that rejects the command just falls through to selecting the device by hand.

For a board that is connected but should not be flashed, **Disconnect** releases the interface and
leaves it in DFU mode, and **Run Application** performs the DfuSe leave sequence at the application
base so the firmware starts.

## Pressure

Reads an MLX90835 over I2C or SPI through the Melexis IO board, with a live chart and CSV export.
Its own help and licence are served from `pressure-README.md` and `pressure-LICENSE`, kept under
those names so they do not collide with this repo's own files.

## Infrared

Index for the Melexis infrared sensors — MLX90632, MLX90640, MLX90641 and MLX90642 — each read
over I2C through the Melexis IO board. **MLX90642** is built; the other three are listed as
upcoming rather than linking to pages that do not exist.

The 90642 computes temperatures on the chip, so the page has no calibration maths to run: it reads
768 pixel values plus the ambient word in one I2C transaction and paints them. Its configuration is
shown but not written — refresh rate, emissivity and output format go through a command shape that
the datasheet documents and the driver library does not. The protocol contract for all
four, and the traps in porting their calibration maths, are in
[.claude/skills/melexis-infrared/SKILL.md](.claude/skills/melexis-infrared/SKILL.md).

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
pressure.html         MLX90835 readout, Bootstrap-based
pressure-README.md    Pressure help text, shown in its Help modal
pressure-LICENSE      Pressure licence, shown in its Help modal
infrared.html         infrared sensor index
mlx90642.html         MLX90642 thermal array readout
theme.css             shared Bootstrap theme
favicon.svg           shared icon
manifest.webmanifest  PWA manifest
service-worker.js     offline shell
```

Deployed straight from `master` by GitHub Pages.
