---
name: melexis-triaxis
description: Building the Triaxis section — magnetic position sensors (MLX90396 today) read over I2C through the Melexis IO board. Covers the command set, the three-byte channel bitmap, the CRC-8 and the status byte. Load when creating or changing a Triaxis page, decoding a status byte, or adding another part from this family.
---

# Triaxis magnetometer pages

`triaxis/index.html` serves the section, one subpage per chip, exactly as `fir/` does — read
`.claude/skills/melexis-infrared/SKILL.md` for the page conventions and
`.claude/skills/melexis-scpi/SKILL.md` for the transport; neither is repeated here.

## Source

**MLX90396 preliminary datasheet V0.5, 8 June 2026** — `~/projects/ai/`. Preliminary: the
register map and the command encoding can still move, so re-check against a newer revision
before trusting anything here for production.

Not to be confused with the MLX90393/90395, whose datasheets are public and whose protocol is
**similar but not the same**: those take a single command byte with a `zyxt` nibble and shift
the register address left by one on I2C. The 90396 has four magnetic pixels, a three-byte
channel bitmap, and plain register numbers.

## What the part measures

Four Triaxis pixels, so twelve magnetic channels (X0…Z3), six differential channels between
pixel pairs (ΔX02…ΔZ13), the supply voltage and the temperature. **At most six magnetic
measurements can be read in one go.** Temperature is 1 LSB/°C with 0 LSB at 0 °C, so the raw
count is already roughly degrees; the magnetic LSB depends on the configured range, so a page
that has not read the configuration should show raw counts, not microtesla.

## Commands

A command goes to **register 0x80** and the reply is read after a repeated start — the board's
`:I2C:EXCHange <dev>,<bytes to read>,<bytes to write>…` is exactly that shape.

| command | bytes |
|---|---|
| SB / SWOC / SM | `0b0001/0b0010/0b0011` + selection[18:15], selection[14:7], selection[6:0]≪1, CRC |
| RM — read measurement | `0b0100 T000`, CRC |
| RR — read register | `0b0101 dddd`, REG, CRC |
| WR — write register | `0b0110 dddd`, REG, DATA hi, DATA lo, CRC |
| EX — exit mode | `0b1000` + target (0 ready, 1 idle, 2 sleep), CRC |
| HR / HS — recall / store | `0xD0` / `0xE0`, CRC |
| RT — reset | `0xF0`, CRC |

The 19 selection bits run X0 Y0 Z0 X1 Y1 Z1 X2 Y2 Z2 X3 Y3 Z3 ΔX02 ΔY02 ΔZ02 ΔX13 ΔY13 ΔZ13
VDD, MSB first, ending with one don't-care bit. Verified against the datasheet's own example:
Bz on all four pixels plus both differential Bz gives `0x12 0x49 0x24`.

The reply to RM is the status byte, then one 16-bit word per selected channel **in that same
order**, temperature last when requested, then the CRC.

## CRC-8

Poly `0x2F` (Koopman `0x97`), **init 0xFF, final XOR 0xFF**. AAA-variant parts use 0x00 for
both instead. It covers the whole message including the I2C address byte with its R/W bit, so
the write phase and the read phase carry different CRCs — `crc8([addr << 1, …])` going out,
`crc8([(addr << 1) | 1, …])` coming back.

**The datasheet contradicts itself here.** Its figure gives `0x82` for a reset at address 0x13
and its numbered steps compute `0x14` for the same frame. `0x82` is right for a standard part:
init/XOR of 0xFF reproduce both `0x82` (I2C) and `0x65` (the SPI example). The steps describe
the AAA parameters, which is where `0x14` comes from.

Whether CRC is checked at all depends on `NV_COMM_CRC` (register 0x22, bit 14) in that part's
NVRAM, which cannot be read without first talking to it — so a page needs a toggle, not an
assumption.

## Addressing and status

Default I2C address is **0x12** (`NV_COMM_I2C_ADDR`, register 0x1E). The MS_A0_A1 pin selects
SPI or one of four I2C address variants by voltage band — below ⅛ VDD is SPI mode, the four
bands above it set A0/A1.

Status byte: bits 7:6 are the function ID (0b11 single, 0b10 burst, 0b01 WOC, 0b00 exit or
memory), bits 5:3 a measurement counter in burst and WOC, then ERROR, INFO/WARN, DRDY. A
rejected command answers with the status of the mode the part is *currently* in, with ERROR
set — so a surprising status usually means the part is still in a mode nobody exited. Details
live in the warning register at 0x42, and reading it clears the flag.
