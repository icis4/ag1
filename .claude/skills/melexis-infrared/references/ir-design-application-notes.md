# Melexis IR application notes that are not chip-specific

The four chips in this section share one design application note, and the Melexis document
index lists only one array-specific note. This file records what those say and — just as
useful — what does **not** exist, so nobody searches for it twice.

## What Melexis actually publishes for these four chips

Taken from `https://www.melexis.com/sitemap.xml`, which lists every document page:

| chip | chip-specific application notes |
|---|---|
| MLX90632 | measurement modes; changing the refresh rate — see `mlx90632-application-notes.md` |
| MLX90640 | **none** |
| MLX90641 | start-up behaviour — see `mlx90641-start-up.md` |
| MLX90642 | **none** — only datasheet, EVB90642 user manual and EVB software |

Chip-agnostic notes that apply to all four: *Thermal/Mechanical design recommendations - IR
products* (summarised below) and *Recommendations for a robust I2C communication* (distilled
in the sibling skill, `.claude/skills/melexis-scpi/references/robust-i2c.md`). A third,
*Solder techniques for IR sensor products*, is assembly guidance and out of scope here.

For the arrays, the substantive protocol documentation is the datasheet plus the driver PDF
that ships in each library repo (`~/projects/infrared/mlx9064x-library/MLX9064x driver.pdf`),
not an application note.

## Thermal/mechanical design recommendations — IR products

`https://www.melexis.com/-/media/files/documents/application-notes/thermal-mechanical-design-recommendations-ir-products-application-note-melexis.pdf`
(revision 001, docserver 3901190600). Mostly enclosure and PCB guidance — the parts that
matter when a page shows numbers a user may not believe:

- **FOV in the datasheet is the 50 % signal angle**, not the full cone. The real FOV is
  wider, so a page that draws a coverage cone from the datasheet figure understates what the
  sensor sees. Distance-to-spot (D:S) is distance ÷ spot diameter, and the object must fill
  the spot — otherwise the reading is a mix of object and background, which is the single
  most common cause of "the temperature is too low".
- **Thermal gradient is the accuracy killer.** The sensor must be in isothermal equilibrium
  when it measures. Nearby hot electronics, a hand touching the housing, fast ambient
  changes and draughts all break that. Symptom: ambient and object readings drift together
  after power-up or after the board is handled.
- **Thermal noise** scales inversely with the package's thermal mass — a bare package
  without a metal cap is the most sensitive to air movement.
- MLX90640Bxx and MLX90641Bxx **do** have thermal gradient compensation and it is
  **direction independent**, so unlike the MLX90614xCx there is no preferred orientation
  toward the heat source. They are still not immune to gradients.
- Any cover in front of the sensor must be outside the FOV: the sensor must not "see" it.

Practical consequence for a page: when readings look wrong, the cause is usually the thermal
environment or a partially filled spot, not the maths. Worth saying so in the UI rather than
letting a user chase a calibration bug that is not there.

## Deliberately not tracked

*Solder techniques for IR sensor products* is assembly guidance for putting the part on a
board. This repo is a software product driving a sensor that is already soldered, so the
note is out of scope — it is listed here only so its absence does not read as an oversight.

Local copies of the notes that are in hand live in `~/projects/infrared/`.
