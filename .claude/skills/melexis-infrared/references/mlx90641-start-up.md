# MLX90641 start-up behaviour

Melexis application note *MLX90641 start-up behaviour* (AN rev 001, DOC#390119064101,
19 Apr 2026), covering both the BCA (wide FOV) and BCB (narrow FOV) types. Local copy in
`~/projects/infrared/`. It is the only chip-specific note Melexis publishes for the arrays.

Its subject is duty-cycling the sensor in a battery-powered product, but the part that
matters for any host — ours included — is that **the first frames after power-on are not
trustworthy**.

## The first frame is bad by construction

Two independent reasons, per the note:

1. The internal electronics and the sensor array need time to reach thermal equilibrium, so
   an early frame carries a thermal-transient error and a higher noise floor.
2. Temporal filtering compares a frame against the previous one, and the first frame has no
   predecessor, so its processed quality is inherently lower.

**Melexis recommends omitting the first frame and using the 4th and 5th.** In their worked
example the sensor is given a start-up delay of ≈140 ms, frames 1-3 are skipped, and frames
4 and 5 are read.

During this transient the device does **not** meet its datasheet absolute accuracy. An
application that reads contrast or uniformity (people detection is the note's example)
needs far less warm-up than one quoting absolute temperatures.

## Duty-cycling, if a design ever needs it

Power is cut with a high-side or low-side switch — there is no sleep mode to use instead.
The I2C bus is 5 V tolerant, so the pull-ups may stay powered while the sensor's VDD is
switched off, and the bus stays usable for other devices.

Numbers from the note: typical consumption ≈ **12 mA**; with a 0.5 s power-off window and 5
frames per burst the average drops to ≈ **3.3 mA**. 16 Hz or 32 Hz is the optimal refresh
rate for this pattern — fast enough to keep the burst short, slow enough to keep noise
down. The pull-ups add current of their own, roughly `I_avg = VDD / R_pullup × (duty cycle
of LOW)`, which the note's figures exclude.

## What this means for `fir/mlx90641.html`

The page streams from a continuously powered sensor, so the power-saving scheme does not
apply — but the transient does. On a sensor that was just powered up, the first frames the
page renders are the unreliable ones, and it currently renders every frame from the first.
If start-up artefacts show up in practice, discard the first few frames after connecting
rather than treating them as a calibration problem, and do not quote absolute temperatures
from a sensor that has only just been powered.
