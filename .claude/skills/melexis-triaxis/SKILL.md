---
name: melexis-triaxis
description: Building the Triaxis section — the MLX90396 magnetic position sensor driven over SPI (or I2C) through the Melexis IO board. Covers the command set, the 20-bit channel mask, the CRC-8, the status byte, and where a working reference implementation disagrees with the preliminary datasheet. Load when creating or changing a Triaxis page, decoding a status byte or a measurement word, or adding another part from this family.
---

# Triaxis magnetometer pages

`triaxis/index.html` serves the section, one subpage per chip, exactly as `fir/` does — read
`.claude/skills/melexis-infrared/SKILL.md` for the page conventions and
`.claude/skills/melexis-scpi/SKILL.md` for the transport; neither is repeated here.

## Sources, and which one wins

1. **MLX90396 preliminary datasheet V0.5, 8 June 2026** (`~/projects/ai/`). Preliminary: the
   register map and the command encoding can still move.
2. **A colleague's working WebSerial app**, `github.com/wirtyfromtheunknownW/MLX90396-WebUI` —
   `mlx_api.js` is the interesting file: a complete command builder driven from a browser
   through the same kind of SCPI bridge this suite uses.

Where the two disagree, the app has been run against hardware and the datasheet has not been
corrected — but neither is proof. **Both readings are listed below; check on the part.**

Do not reach for the MLX90393/90395 datasheets. Those are public and the protocol looks
similar, but they take a single command byte with a `zyxt` nibble and shift the register
address on I2C. The 90396 is a different part: four magnetic pixels, a 20-bit channel mask,
plain register numbers.

## The part is wired for SPI here

The MS_A0_A1 pin picks the bus by voltage band: **below ⅛ VDD is SPI**, the four bands above
it are I2C with the A0/A1 combinations. On the boards in this project the chip is strapped for
SPI, so a page that only speaks I2C cannot talk to it at all.

SPI is mode 3 (CPOL 1, CPHA 1), MSB first, and the transfer is one CS-low window per command.
The board's commands (`commands_spi.c`):

```
:SPI:Init <0-CS0(A2), 1-CS1(A3), 2-Both, 3-None>
:SPI:WriteReaD <data>[,<data>…]        full-duplex, returns what came back on MISO
:SPI:EXCHange <count>,<data>[,…]       same with an explicit read count
:SPI:0:WriteReaD …                     drives CS0 for you — prefer it to toggling by hand
:SPI:CS0 <0|1>                          manual CS
:VDD:3V3 | :VDD:5V | :VDD:OFF           the board powers the part
```

The reference app brings the bus up like this, then holds CS itself:

```
:SPI:Init 0 · :CON:CS1:GPIO:INIT:OUT 0 · :SPI:BUFfer 1,1,1,1,0 · :VDD:3V3
:SPI:CS0 0 → :SPI:WriteReaD <mosi…,0,0,…> → :SPI:CS0 1
```

MISO bytes are clocked out by sending padding zeros: to read *n* bytes, append *n* zeros to
the command and take the last *n* bytes of the reply.

Over I2C instead, the same command bytes go to **register 0x80** and the reply is read after a
repeated start — `:I2C:EXCHange <dev>,<read count>,<bytes to write>`. Default address 0x12
(`NV_COMM_I2C_ADDR`, register 0x1E).

## Commands

| command | bytes |
|---|---|
| SB / SWOC / SM | `0x10 / 0x20 / 0x30` \| mask[19:16], mask[15:8], mask[7:0], CRC |
| RM — read measurement | `0x40`, CRC — plus the temperature bit, see below |
| RR — read register | `0x50`, REG, CRC → status, DATA hi, DATA lo, CRC |
| WR — write register | `0x60`, REG, DATA hi, DATA lo, CRC → status, CRC |
| EX — exit mode | `0x80 \| target` (0 ready, 1 idle, 2 sleep), CRC |
| HR / HS — recall / store | `0xD0` / `0xE0`, CRC |
| RT — reset | `0xF0`, CRC |

**The channel mask is 20 bits**, x0 at bit 19 down to VDD at bit 1, bit 0 unused:

```
x0 y0 z0 x1 y1 z1 x2 y2 z2 x3 y3 z3 Δx02 Δy02 Δz02 Δx13 Δy13 Δz13 vdd –
```

So `0xFC000` is XYZ of pixels 0 and 1, `0x03F00` is XYZ of pixels 2 and 3 — the two masks the
reference app alternates to cover all four pixels. **At most six magnetic channels per
measurement**; VDD does not count toward the six (the app checks `mask & 0xFFFFFC`).

Encoding verified against the datasheet's own example: Bz on all four pixels plus both
differential Bz gives command bytes `0x12 0x49 0x24`.

## Three places the reference app differs from the datasheet

- **Temperature comes first in the RM reply.** The app reads status, then temperature, then
  the selected channels. The datasheet's tables put temperature after them. Getting this wrong
  shifts every value by one word.
- **Measurements are 12-bit, not 16.** The app sign-extends from bit 11 (`(u << 4)` then an
  arithmetic `>> 4`), which matches the datasheet's "selectable 12-bit digital output" feature
  line. Treating the word as plain int16 gives values 16× too large and the wrong sign near
  full scale.
- **The RM temperature bit.** The app uses `0x41` (bit 0); the datasheet's table says
  `0b0100 T000`, which is `0x48` (bit 3). One of them is wrong and the part decides.

## CRC-8

Poly `0x2F` (Koopman `0x97`), **init 0xFF, final XOR 0xFF**; AAA-variant parts use 0x00 for
both. Over SPI it covers the command bytes alone. Over I2C it covers the whole message
*including* the address byte with its R/W bit, so the write phase and the read phase carry
different CRCs.

The datasheet contradicts itself here: its figure gives `0x82` for a reset at address 0x13 and
its numbered steps compute `0x14` for the same frame. `0x82` is right for a standard part —
init/XOR of 0xFF reproduce both `0x82` (I2C) and `0x65` (the SPI example); the steps describe
the AAA parameters. The reference app sidesteps the whole question by **accepting either**
parameter set when verifying, which is the pragmatic thing to do when the variant is unknown.

Whether the part checks CRC at all is `NV_COMM_CRC` (register 0x22, bit 14), which cannot be
read without talking to it first — so offer a toggle, not an assumption.

## Status byte

Bits 7:6 are the function ID (0b11 single, 0b10 burst, 0b01 WOC, 0b00 exit or memory), bits
5:3 a measurement counter in burst and WOC, then ERROR, INFO/WARN, DRDY. A rejected command
answers with the status of the mode the part is *currently* in, with ERROR set — so a
surprising status usually means the part is still in a mode nobody exited. Details are in the
warning register at 0x42, and reading it clears the flag.
