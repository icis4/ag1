# MLX90632 application notes — what they add on top of the library

Distilled from the two Melexis application notes for this chip. Read this when a page needs
to *choose* a measurement mode, control timing, or change the refresh rate — the library
headers tell you the function names, these notes tell you which sequence is correct.

| note | revision | source |
|---|---|---|
| MLX90632 measurement modes | 001 — 15 Feb 2023 | `https://www.melexis.com/-/media/files/documents/application-notes/mlx90632-measurement-modes-application-note-melexis.pdf` |
| Changing the refresh rate of the MLX90632 | 1 — Oct 2019 | `https://www.melexis.com/-/media/files/documents/application-notes/mlx90632-changing-refresh-rate-application-note-melexis.pdf` |

Everything below was cross-checked against `~/projects/infrared/mlx90632-library`; where the
note and the library disagree, that is called out.

## Register naming: the note's `RAM_n` vs the library's macros

The notes talk about `RAM_4 … RAM_9` and `RAM_52 … RAM_60`; the library has
`MLX90632_RAM_1/2/3(meas_num)` off `MLX90632_ADDR_RAM` (`0x4000`). The bridge is simply:

```
address = 0x4000 + (n - 1)          RAM_4 -> 0x4003, RAM_52 -> 0x4033
MLX90632_RAM_1(m) = 0x4000 + 3m     MLX90632_RAM_2(m) = +1     MLX90632_RAM_3(m) = +2
```

So the note's *medical* trio `RAM_4, RAM_5, RAM_6` is measurement slot 1
(`0x4003-0x4005`), `RAM_7, RAM_8, RAM_9` is slot 2 (`0x4006-0x4008`), and the *extended*
nine `RAM_52 … RAM_60` are slots 17, 18, 19 (`0x4033-0x403B`). `RAM_3(m)` is always the
ambient pair; `RAM_1(m)`/`RAM_2(m)` are the object pair.

## Measurement modes — `REG_CONTROL` (`0x3001`)

| bits | name | meaning |
|---|---|---|
| 11 | `sob` | start of burst — runs the whole measurement table once (sleeping step mode) |
| 8:4 | `meas_select` | `0x00` medical/standard range, `0x11` extended range |
| 3 | `soc` | start of conversion — one measurement (step mode) |
| 2:1 | `mode[1:0]` | `0b01` sleeping step, `0b10` step, `0b11` continuous |

Library equivalents: `MLX90632_PWR_STATUS_SLEEP_STEP / _STEP / _CONTINUOUS` (all already
shifted left by 1), `MLX90632_MTYP_MEDICAL` = `0x00`, `MLX90632_MTYP_EXTENDED` = `0x11`,
`MLX90632_START_BURST_MEAS`.

Power, from the note: continuous and step both draw **~1 mA** (the device is always active);
sleeping step drops to **~1.5 µA** asleep and averages with duty cycle — 20 % ≈ 201 µA,
100 % = 1 mA. Peak current is always I_dd, whatever the duty cycle.

Device type decides the range options: `MLX90632B##` (standard accuracy) has one range,
-20…200 °C. `MLX90632D##` (medical) is ±0.2 °C over 35…42 °C and -20…100 °C in medical
mode, and switches to -20…200 °C at standard accuracy in extended mode.

## Status — `REG_STATUS` (`0x3FFF`)

| bit | name | meaning |
|---|---|---|
| 10 | `device_busy` | always low in sleep, always **high in continuous**, high for one measurement in soc-step, high until the table finishes in sob-burst |
| 9 | `eeprom_busy` | EEPROM write/erase in flight |
| 6:2 | `cycle_position` | which slot the newest data came from |
| 0 | `new_data` | set by the device; **the host clears it** before waiting for the next sample |

Because `device_busy` is pinned high in continuous mode, a page must poll `new_data` there —
polling busy will hang forever. In burst mode it is the opposite: wait for `device_busy` to
fall, then read the whole table.

## The four flows worth implementing

Always: clear `new_data` *before* waiting, never after.

- **Continuous medical/standard** — `mode = 0b11`, `meas_select = 0x00`. Loop: clear
  `new_data` → poll it → read by `cycle_position` (1 → `0x4003-0x4005`, 2 → `0x4006-0x4008`)
  → maths. This is the default mode out of the factory and the right default for a page.
- **Continuous extended** — same, `meas_select = 0x11`, but wait until `cycle_position`
  reaches `0x13` (19) and then read all nine registers `0x4033-0x403B`.
- **Sleeping step burst, medical** — `mode = 0b01`, set `sob` → poll `device_busy` low →
  read both slots. One I2C round per sample instead of continuous polling.
- **Sleeping step burst, extended** — as above with `meas_select = 0x11` and the nine
  registers.

Plain step mode (`0b10`) exists but the note recommends against it unless the timing must be
controlled precisely: it needs one `soc` per measurement, two (medical) or three (extended)
before a result, at full 1 mA the whole time. Prefer sleeping step.

Extended mode is only present on some parts. Check `EE_VERSION` (`0x240B`) bits `[14:8]`
== `0x05` first — `mlx90632_init()` already does this and returns `ERANGE` (34) to mean
"extended supported", `0` for medical-only. A negative return is a real failure; `ERANGE` is
not an error.

## Refresh rate — `EE_MEAS_1` (`0x24E1`) and `EE_MEAS_2` (`0x24E2`)

Factory default is **2 Hz** (0.5 s). Bits `[10:8]` of both registers hold the rate; both must
be set to the same value. The note's literal values (low byte differs per register):

| `[10:8]` | rate | time | `EE_MEAS_1` | `EE_MEAS_2` |
|---|---|---|---|---|
| 0 | 0.5 Hz | 2000 ms | `0x800D` | `0x801D` |
| 1 | 1 Hz | 1000 ms | `0x810D` | `0x811D` |
| 2 | 2 Hz | 500 ms | `0x820D` | `0x821D` |
| 3 | 4 Hz | 250 ms | `0x830D` | `0x831D` |
| 4 | 8 Hz | 125 ms | `0x840D` | `0x841D` |
| 5 | 16 Hz | 62.5 ms | `0x850D` | `0x851D` |
| 6 | 32 Hz | 31.25 ms | `0x860D` | `0x861D` |
| 7 | 64 Hz | 15.625 ms | `0x870D` | `0x871D` |

The library does **not** write these constants — `mlx90632_set_refresh_rate()` reads each
register and rewrites only bits `[10:8]` (`MLX90632_NEW_REG_VALUE`), preserving the rest.
Prefer that read-modify-write in a page too; the table is a cross-check, not something to
blast in blindly.

A measurement in burst mode takes twice the standard time per the modes note
(e.g. `[10:8] = 0` → 2000 ms standard, 4000 ms burst); in **extended** mode the times are a
different set entirely — 6000, 3000, 1500, 750, 375, 200, 100, 50 ms — and live in
`EE_MEAS_17/18/19` (`0x24F1`, `0x24F2`, `0x24F3`). `mlx90632_set_refresh_rate()` touches only
the medical pair, so changing the rate does **not** change the extended rate. A page
offering both modes has to write the extended registers itself.

Faster sampling costs noise: NETD rises with refresh rate, and (thermal radiation being what
it is) noise is worse at low object temperatures.

## Writing EEPROM — the sequence the library uses

Never a bare write. From `mlx90632_write_eeprom()`:

1. unlock: write `0x554C` to `0x3005`
2. erase: write `0x0000` to the target address
3. poll `REG_STATUS` until `eeprom_busy` (bit 9) clears
4. unlock again: `0x554C` to `0x3005`
5. write the value to the target address
6. poll `eeprom_busy` clear again

Two extra rules from the note: put the device in **step mode before any EEPROM operation**
(the library does not do this for you), and issue an I2C stop condition after power-on to
initialise the lines. EEPROM has finite write endurance — a page must treat a refresh-rate
change as a deliberate action behind a button, never something it writes on load or on every
slider move.

## Host-side, not on the chip

The calibration constants only need reading **once** after power-on; keep them in JS and do
every subsequent conversion from RAM reads alone. Emissivity is purely a host-side
correction (`mlx90632_set_emissivity()` stores a `double`, it never reaches the device), so
an emissivity control in the UI changes nothing over I2C.

## Mapping to the library

| note step | library |
|---|---|
| check device, clear `new_data` | `mlx90632_init()` → `0` medical-only, `ERANGE` extended too |
| select mode | `mlx90632_set_meas_type(MLX90632_MTYP_MEDICAL / _MEDICAL_BURST / _EXTENDED / _EXTENDED_BURST)` |
| read a sample | `mlx90632_read_temp_raw()` / `_burst()` / `_extended()` / `_extended_burst()` |
| maths | `mlx90632_preprocess_temp_ambient/_object[_extended]()`, then `mlx90632_calc_temp_ambient[_extended]()` and `mlx90632_calc_temp_object[_extended]()` |
| refresh rate | `mlx90632_set_refresh_rate(MLX90632_MEAS_HZ_…)`, `mlx90632_get_refresh_rate()` |
