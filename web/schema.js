/*
 * The stock format, once.
 *
 * Every control, its range, and how it is written to a .fs come from
 * this table. The UI is generated from it and the file is serialised
 * from it, so a control cannot drift from the key it writes -- which is
 * the whole failure this editor exists to avoid.
 *
 * Ranges match engine/stock.c. Where a key takes a vector the engine
 * wants exactly that many numbers, so `n` is not decoration.
 */
export const HUES = [
  { key: "red",     label: "Red",     css: "#d2443a" },
  { key: "yellow",  label: "Yellow",  css: "#c8a21f" },
  { key: "green",   label: "Green",   css: "#4f9a46" },
  { key: "cyan",    label: "Cyan",    css: "#3fa0a8" },
  { key: "blue",    label: "Blue",    css: "#4169b0" },
  { key: "magenta", label: "Magenta", css: "#a8509c" },
];

export const SCHEMA = [
  { group: "Identity", fields: [
    { id: "name", key: "NAME", type: "text", def: "UNTITLED", max: 23,
      help: "Shown in the camera's picker. Kept short because the screen is 720 px wide." },
    { id: "desc", key: "DESC", type: "text", def: "", max: 63,
      help: "A line of your own. The camera does not display it." },
  ]},

  { group: "Tone", fields: [
    { id: "exposure", key: "EXPOSURE", type: "range", min: -2, max: 2, step: 0.05, def: 0, unit: " EV",
      help: "Applied before the curves. Think of it as the stock's rated speed against the meter." },
    { id: "contrast", type: "curve", def: 0,
      help: "Generates the CURVE line: an S through the midtones, with the toe lifted or dropped." },
  ]},

  { group: "Colour", fields: [
    { id: "sat", key: "SAT", type: "range", min: 0, max: 200, step: 1, def: 100, unit: "%",
      help: "Global chroma. Above about 160 the engine's rolloff starts fighting you, which is intended." },
  ]},

  { group: "Per hue", fields: [
    { id: "hue_sat", key: "HUE_SAT", type: "hues", min: 0, max: 200, step: 1, def: 100, unit: "%",
      help: "Saturation per hue sector. This is what separates Velvia from Provia." },
    { id: "hue_rot", key: "HUE_ROT", type: "hues", min: -30, max: 30, step: 1, def: 0, unit: "°",
      help: "Rotates a sector toward its neighbours. Small numbers go a long way." },
    { id: "hue_lum", key: "HUE_LUM", type: "hues", min: 50, max: 150, step: 1, def: 100, unit: "%",
      help: "How dense a hue prints. Dropping green is most of what makes a stock look like film." },
  ]},

  { group: "Split tone", fields: [
    { id: "split_sh", key: "SPLIT_SH", type: "rgb", min: -30, max: 30, step: 1, def: 0,
      help: "Added to the shadows, in RGB. Cool shadows are the cheapest route to a cinema look." },
    { id: "split_hi", key: "SPLIT_HI", type: "rgb", min: -30, max: 30, step: 1, def: 0,
      help: "Added to the highlights. Warm here plus cool above reads as print film." },
  ]},

  { group: "Halation", fields: [
    { id: "hal_amount", key: null, type: "range", min: 0, max: 200, step: 1, def: 0, unit: "%",
      help: "Strength of the glow bleeding out of clipped highlights. 0 switches the whole stage off." },
    { id: "hal_thresh", key: null, type: "range", min: 128, max: 255, step: 1, def: 220,
      help: "How bright a pixel must be to bleed. Lower catches more of the frame." },
    { id: "hal_radius", key: null, type: "range", min: 1, max: 64, step: 1, def: 24, unit: " px",
      help: "How far it spreads. The camera reduces this if it will not fit in its row budget." },
    { id: "hal_tint", key: "HAL_TINT", type: "rgb", min: 0, max: 255, step: 1, def: [255, 64, 24],
      help: "The colour of the glow. Red-orange is what the anti-halation layer failed to stop." },
  ]},

  { group: "Grain", fields: [
    { id: "grain", key: "GRAIN", type: "range", min: 0, max: 100, step: 1, def: 0, unit: "%",
      help: "Luminance grain, strongest in the midtones where film's actually is." },
    { id: "grain_size", key: "GRAIN_SIZE", type: "range", min: 10, max: 100, step: 1, def: 30,
      help: "Grain cell size. Scales with the frame, so the preview matches what the camera writes." },
  ]},
];

/* A curve from one knob: contrast as an S about the midpoint. */
export function curvePoints(c) {
  if (!c) return [[0, 0], [255, 255]];
  const k = c / 100;
  const lo = Math.round(Math.max(0, Math.min(90, 56 - 56 * k)));
  const hi = Math.round(Math.max(165, Math.min(255, 199 + 56 * k)));
  return [[0, Math.round(Math.max(0, -6 * k))], [64, lo], [192, hi], [255, 255]];
}

/*
 * The keys this editor owns. Anything else in a loaded file is kept
 * verbatim and written back out, because the alternative is quiet
 * destruction: every shipped stock carries CURVE_R/G/B and WB, which
 * are most of what makes Gold look like Gold, and an editor that
 * dropped them on save would hand back a different film.
 *
 * Only at the top level, or under [JPEG]/[COMMON]. Inside a [RAW] block
 * the same key names mean the raw overrides, so those lines are
 * preserved untouched rather than absorbed.
 *
 * CURVE is deliberately NOT owned. One contrast number cannot describe
 * the curves these stocks use -- Gold's is
 *
 *   CURVE 0,12 64,74 128,136 192,199 255,249
 *
 * a lifted toe and a rolled-off top, which is its whole faded-print
 * character. Reducing that to a knob and regenerating it gave
 *
 *   CURVE 0,2 64,74 192,181 255,255
 *
 * which matched at the one point the knob was read from and threw away
 * the rest. So a loaded curve is kept exactly, and the contrast slider
 * replaces it only when somebody deliberately moves it.
 */
const OWNED = new Set([
  "VERSION", "NAME", "DESC", "EXPOSURE", "SAT",
  "HUE_SAT", "HUE_ROT", "HUE_LUM", "SPLIT_SH", "SPLIT_HI",
  "HALATION", "HAL_TINT", "GRAIN", "GRAIN_SIZE",
]);

/* Serialise the live values to .fs text. This is the file, byte for
 * byte -- what the editor previewed is what it writes out. */
export function toFs(v, version) {
  const L = [];
  L.push(`# Written with the Soup Engine stock editor.`);
  L.push(`#`);
  L.push(`# Tuned against a preview that ran engine/look.c compiled to`);
  L.push(`# WebAssembly, so what you saw is what the camera renders.`);
  L.push(``);
  L.push(`VERSION   ${version}`);
  L.push(`NAME      ${(v.name || "UNTITLED").toUpperCase().slice(0, 23)}`);
  if (v.desc) L.push(`DESC      ${v.desc.slice(0, 63)}`);
  L.push(``);

  if (v._curveFromFile && v._curveLine) {
    L.push(v._curveLine);
  } else {
    const pts = curvePoints(v.contrast);
    L.push(`CURVE     ${pts.map(p => p[0] + "," + p[1]).join(" ")}`);
  }
  if (+v.exposure) L.push(`EXPOSURE  ${(+v.exposure).toFixed(2)}`);
  L.push(``);

  if (v.sat !== 100) L.push(`SAT       ${v.sat}`);
  const vec = (k, a, d) => {
    if (a.every(x => x === d)) return;
    L.push(`${k.padEnd(9)} ${a.join(",")}`);
  };
  vec("HUE_SAT", v.hue_sat, 100);
  vec("HUE_ROT", v.hue_rot, 0);
  vec("HUE_LUM", v.hue_lum, 100);
  vec("SPLIT_SH", v.split_sh, 0);
  vec("SPLIT_HI", v.split_hi, 0);

  if (+v.hal_amount > 0) {
    L.push(``);
    L.push(`HALATION  ${v.hal_amount} ${v.hal_thresh} ${v.hal_radius}`);
    L.push(`HAL_TINT  ${v.hal_tint.join(",")}`);
  }
  if (+v.grain > 0) {
    L.push(``);
    L.push(`GRAIN     ${v.grain}`);
    L.push(`GRAIN_SIZE ${v.grain_size}`);
  }

  /* Everything from the loaded file this editor has no control for, in
   * the order it appeared: per-channel curves, white balance, and any
   * [RAW] block with its own overrides. */
  if (v._extra && v._extra.length) {
    L.push(``);
    L.push(`# Kept from the file this was opened from.`);
    for (const line of v._extra) L.push(line);
  }
  return L.join("\n") + "\n";
}

/* Read a .fs back, so a stock can be opened and kept working on. */
export function fromFs(text, v) {
  const num = s => parseFloat(s);
  const extra = [];
  let inRaw = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const sect = line.toUpperCase();
    if (sect === "[RAW]" || sect === "[JPEG]" || sect === "[COMMON]") {
      inRaw = (sect === "[RAW]");
      extra.push(line);
      continue;
    }

    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const k = line.slice(0, sp).toUpperCase();
    const rest = line.slice(sp).trim();

    /* Not ours, or ours but in a [RAW] block where the name means
     * something else: keep the line exactly as it was. */
    if (inRaw || !OWNED.has(k)) {
      /* The common master curve is held on its own rather than mixed
       * into the preserved lines. A [RAW] block can carry its own CURVE,
       * so picking one out of that list by prefix would take both. */
      if (k === "CURVE" && !inRaw) {
        v._curveLine = line;
        v._curveFromFile = true;
      } else {
        extra.push(line);
      }
      continue;
    }

    const nums = rest.split(/[,\s]+/).filter(Boolean).map(num);
    switch (k) {
      case "NAME":       v.name = rest; break;
      case "DESC":       v.desc = rest; break;
      case "EXPOSURE":   v.exposure = nums[0]; break;
      case "SAT":        v.sat = nums[0]; break;
      case "HUE_SAT":    if (nums.length === 6) v.hue_sat = nums; break;
      case "HUE_ROT":    if (nums.length === 6) v.hue_rot = nums; break;
      case "HUE_LUM":    if (nums.length === 6) v.hue_lum = nums; break;
      case "SPLIT_SH":   if (nums.length === 3) v.split_sh = nums; break;
      case "SPLIT_HI":   if (nums.length === 3) v.split_hi = nums; break;
      case "HAL_TINT":   if (nums.length === 3) v.hal_tint = nums; break;
      case "GRAIN":      v.grain = nums[0]; break;
      case "GRAIN_SIZE": v.grain_size = nums[0]; break;
      case "HALATION":
        v.hal_amount = nums[0] || 0;
        if (nums.length > 1) v.hal_thresh = nums[1];
        if (nums.length > 2) v.hal_radius = nums[2];
        break;
    }
  }
  v._extra = extra;
  return v;
}
