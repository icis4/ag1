---
name: melexis-triaxis
description: Building the Triaxis section — magnetic position sensors (MLX90396 today) read over I2C through the Melexis IO board, using the MLX90393/90395 family command protocol. Load when creating or changing a Triaxis page, decoding the status byte or the zyxt field, or adding another part from this family.
---

# Triaxis magnetometer pages

`triaxis/index.html` serves the section, one subpage per chip, exactly as `fir/` does — read
`.claude/skills/melexis-infrared/SKILL.md` for the page conventions and
`.claude/skills/melexis-scpi/SKILL.md` for the transport; neither is repeated here.

## The 90396 has no public datasheet

Melexis publishes datasheets for the **MLX90391, 90392, 90393, 90394, 90395 and 90397** — the
sitemap has no entry for the 90396. Everything below is the **MLX90393/MLX90395 protocol**,
which the 90396 is assumed to share. It has not been confirmed against the part, and
`triaxis/mlx90396.html` says so on the page rather than quietly presenting it as fact.

What is definitely unknown per-variant: the gain and resolution settings, hence the µT per
LSB, and the temperature conversion. The page shows raw LSB counts for that reason.

## Commands (verified in the 90393 and 90395 datasheets)

The first command byte is `0b<op><zyxt>`, where the four `zyxt` bits select components:
bit 3 Z, bit 2 Y, bit 1 X, bit 0 T. `zyxt = 0` means "whatever the configuration says".

| command | op | note |
|---|---|---|
| SB — start burst | `0b0001` | free-running at the configured rate |
| SWOC — wake on change | `0b0010` | |
| SM — single measurement | `0b0011` | what a page should use for a readout loop |
| EX — exit mode | `0b1000 0000` | **the only way out of a mode**; RT during a mode is not allowed |
| RT — reset | `0b1111 0000` | warm reset, at least 1 ms after EX |
| HR / HS — memory recall / store | `0b1101` / `0b1110` | after HS wait 15 ms before the next command |

## I2C shape, and how it maps onto the board

The 7-bit address is `0b00011` then A1, A0 — so **0x0C to 0x0F**, set by pin strapping. Other
addresses are programmed by Melexis on request.

A command is written to **register 0x80** and the reply read after a repeated start. That is
exactly what the board's exchange primitive does, with the read count *before* the bytes to
write (`commands_i2c.c`):

```
:I2C:EXCHange <dev>,<bytes to read>,<byte to write>[,<byte>…]
```

- send a command: `:I2C:EXCHange 0x0C,1,0x80,0x3F` → SM with all components, returns the status byte
- read the result: `:I2C:EXCHange 0x0C,9,0x80` → status, then one 16-bit word per selected
  component in the order X, Y, Z, T — anything not measured is simply absent, so the byte count
  must match the `zyxt` used
- read a register: `:I2C:EXCHange 0x0C,2,<reg << 1>` → two data bytes, no status
- write a register: `:I2C:EXCHange 0x0C,1,<reg << 1>,<hi>,<lo>` → status

**Register access is word-wise and the I2C byte address is the register shifted left by one.**
Register 0x12 is byte address 0x24. (Over SPI it is shifted left by *two* instead — do not
carry the SPI form over.) Words are MSB first.

## Status byte

Returned by nearly every command; RT returns none.

| bit | meaning |
|---|---|
| 7-4 | which mode answered: burst sets bit 7 (bits 6:5 are a measurement counter), WOC bit 6, SM bit 5, idle and memory all zero |
| 3 | CE/DED — command rejected, or a double error detection |
| 2 | OVF — overflow (SEC after a memory command) |
| 1 | RST — the part reset since the last read |
| 0 | DRDY — data ready |

A rejected command answers with the status of the mode the part is *currently* in, not the one
the command implies, with CE set — so "the status looks wrong" usually means the part is still
in a mode nobody exited.

## Page conventions that differ from the infrared ones

Single measurement mode is a three-step loop: SM, poll the status for DRDY, then read. Do not
poll `:I2C:WaitMask` for this — that helper reads a 16-bit register at an address, while here
the status is a single byte behind the command register.
