# Robust I2C — what the Melexis note means for this board

Melexis application note *Recommendations for a robust I2C communication*
(DOC 390110000025, revision 001, March 2026). Most of it is board-design advice; this file
keeps the parts that change what the terminal and the sensor pages should do, and records
one thing the firmware cannot do at all.

## Bus speed is not a "set it to maximum" knob

"A properly designed I2C bus operates at the speed of the slowest slave." Lowering SCL buys
settling time and cuts EMI; raising it is what makes the arrays usable. Both are true, so
the order of debugging matters: when a 90640/90641 frame read is intermittent, step the bus
down (`:I2C:FREQuency 400k`, then `100k`) before suspecting the hex parser or the framing.
If it becomes reliable at a lower clock, the problem is the bus, not the software.

The board accepts `100000|100k|400000|400k|1000000|1000k|1MA` (`commands_i2c.c`, the
`:I2C:FREQuency` help string).

## The board has no bus-recovery command

Per the I2C spec (§3.1.16, quoted by the note): if **SDA is stuck low**, the master must
send **nine clock pulses** so the slave holding it can release; if **SCL** is stuck low,
only a hardware reset or a power cycle clears it.

`melexis_io_fw` implements neither. `:I2C:DEINIT` calls `HAL_*_MspDeInit()` and `:I2C:INIT`
re-runs `HAL_I2C_Init()` — that reconfigures the peripheral, it does **not** clock the bus
free. There is no bit-banged recovery anywhere in the firmware. So a page that catches a
hung transfer and "recovers" by re-issuing `:I2C:INIT` is doing nothing useful: say so to
the user and have them power-cycle the sensor or the board.

## A page reload can leave the slave mid-transaction

The note: an unscheduled master restart desynchronises slaves, which then transmit faulty
values, and the fix is a scheduled slave reset after the master's reset. That is exactly
what a browser tab does — reload it during a frame read and the chip is left part-way
through a word.

So connecting is not the same as starting clean. Reset the slave rather than assuming a
fresh state. For the MLX90632 that is the addressed reset (device into step mode, then
`0x0006` to `0x3005`), which `fir/mlx90632.html` already performs inside
`selectContinuousMedical()`.

## NACKs and timeouts

Missing acknowledgment is named as one of the main causes of bus lockups — from timing skew
between SCL and SDA, missing or unexpected SCL pulses, or a truncated byte. The board
surfaces this as a non-OK status instead of data. Treat it as information, not noise:
retrying the same transfer in a tight loop hides a bus fault that a message would have made
obvious.

The note also asks for a watchdog on every exchange so nothing blocks forever on an
unresponsive sensor. The `:I2C:Wait*` commands take an explicit timeout, and the pages
scale it with the sensor's refresh period — keep that habit for any new page.

## Hardware, briefly

Only relevant when someone designs a board around this: pull-ups must be sized against the
actual bus capacitance (the spec caps it at 400 pF, routinely exceeded in practice), weak
pull-ups give a strong logic 0 and strong ones a strong logic 1, so the value is a
compromise that shifts with capacitance, clock and driver strength. Keep SDA/SCL short,
cross other signals at 90°, and treat long wires with weak pull-ups as an antenna. Melexis
passed their EMC susceptibility test with SDA/SCL on an inner layer between ground planes
plus ferrite beads on both lines.
