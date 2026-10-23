/*
 * Open a stock, change one slider, save it: nothing else may move.
 *
 * This is the failure it exists to catch. Every shipped stock carries
 * per-channel curves, a white balance and a five-point master curve,
 * and none of those have a control in the editor. The first version
 * dropped CURVE_R/G/B and WB on save, and the second kept them but
 * regenerated the master curve from a one-knob contrast control:
 *
 *   gold.fs  CURVE 0,12 64,74 128,136 192,199 255,249
 *   re-saved CURVE 0,2  64,74 192,181 255,255
 *
 * which matched at the single point the knob was read from and threw
 * away the lifted toe and the rolled-off top -- Gold's whole character.
 * Both bugs were silent. You would only find out from the card.
 *
 * So: anything the editor has no control for is preserved verbatim, and
 * this checks it, including a [RAW] block where the same key names mean
 * the raw overrides instead.
 */
import * as m from "../web/schema.js";

const SRC = `# a stock with every awkward thing in it
VERSION   3
NAME      FIXTURE
DESC      ALL THE KEYS THE EDITOR DOES NOT OWN
EXPOSURE  0.25
WB        CLOUDY

CURVE     0,12 64,74 128,136 192,199 255,249
CURVE_R   0,9 64,79 128,145 192,207 255,255
CURVE_G   0,5 128,131 255,250
CURVE_B   0,2 64,58 128,118 192,182 255,238

SAT       110
HUE_SAT   110,130,81,91,96,104
HUE_ROT   9,7,-15,-7,5,2
HUE_LUM   105,113,86,91,78,103
SPLIT_SH  -16,-4,26
SPLIT_HI  26,14,-22
HALATION  50 226 16
HAL_TINT  255,84,30
GRAIN     24
GRAIN_SIZE 30

[RAW]
CURVE     0,0 128,120 255,255
EXPOSURE  -0.30
GRAIN     40
`;

let fails = 0;
const ok = (cond, what) => {
  console.log(`  ${cond ? "[pass]" : "[FAIL]"} ${what}`);
  if (!cond) fails++;
};
const line = (text, k) => {
  const re = new RegExp("^" + k + "\\s+(.*)$", "m");
  const hit = text.match(re);
  return hit ? hit[1].trim() : null;
};

/* --- open it, change one thing, save it ------------------------------- */

const v = m.fromFs(SRC, {});
v.sat = 130;
const out = m.toFs(v, 3);

ok(line(out, "CURVE") === line(SRC, "CURVE"),
   "the master curve is the file's, not regenerated");
for (const k of ["CURVE_R", "CURVE_G", "CURVE_B"]) {
  ok(line(out, k) === line(SRC, k), `${k} survives untouched`);
}
ok(line(out, "WB") === "CLOUDY", "WB survives, though nothing edits it");
ok(line(out, "SAT") === "130", "the one edited value is written");
ok(line(out, "HUE_ROT") === line(SRC, "HUE_ROT"), "HUE_ROT round-trips exactly");
ok(line(out, "HALATION") === line(SRC, "HALATION"), "HALATION round-trips exactly");
ok(out.includes("[RAW]"), "the [RAW] block is still there");
ok((out.match(/^CURVE\s/gm) || []).length === 2,
   "exactly two CURVE lines: the common one and the raw override");
ok((out.match(/^EXPOSURE\s/gm) || []).length === 2,
   "the raw EXPOSURE override is not merged into the common one");

/* --- and moving contrast replaces the curve, deliberately ------------- */

const v2 = m.fromFs(SRC, {});
v2._curveFromFile = false;                       /* what the slider does */
v2.contrast = 40;
const out2 = m.toFs(v2, 3);
ok(line(out2, "CURVE") !== line(SRC, "CURVE"),
   "moving contrast does replace the curve");
ok((out2.match(/^CURVE\s/gm) || []).length === 2,
   "and leaves one common curve plus the raw override, never a duplicate");
ok(line(out2, "CURVE_R") === line(SRC, "CURVE_R"),
   "replacing the master curve leaves the per-channel ones alone");

/* --- opening a second stock must not inherit from the first ---------- */

const WITHOUT_SAT = `VERSION 3\nNAME PLAIN\nCURVE 0,0 255,255\n`;
const first = m.fromFs(SRC, { sat: 100 });
ok(first.sat === 110, "the first file's SAT is read");
const second = m.fromFs(WITHOUT_SAT, { sat: 100 });   /* fresh defaults */
ok(second.sat === 100,
   "a stock with no SAT line does not inherit the previous one's");
ok(!second._curveFromFile === false,
   "its own curve is still recognised as coming from the file");

console.log(fails ? `\n  ${fails} failed` : "\n  all round-trips clean");
process.exit(fails ? 1 : 0);
