/*
 * The editor.
 *
 * Everything that decides what a pixel becomes happens in WebAssembly,
 * in engine/look.c. This file loads an image, collects slider values,
 * writes them out as a .fs, and hands bytes across. It deliberately
 * knows nothing about what a curve or a hue rotation means, because the
 * moment it did, the preview could disagree with the camera.
 */
import { SCHEMA, HUES, toFs, fromFs } from "./schema.js";
import loadEngine from "./soup.js";

const MAX_PREVIEW = 1400;   /* working size; bigger is slower, not truer */

const $ = id => document.getElementById(id);
const els = {};
let wasm = null, api = null;
let source = null;          /* ImageData at working size, untouched */

/* The frame the camera will write. Not the one being previewed: the
 * halation radius is clamped to fit a 192 KB delay line, and how far it
 * clamps depends on the output width, so a radius-30 stock keeps 7 px
 * at 4368 wide and 23 at 1536. Previewing against the preview's own
 * width would show a glow the camera never makes. */
let camW = 1536, camScale = 1;
let pending = false, showOriginal = false;

/* ---- values, defaulted from the schema ------------------------------- */

/*
 * Built from the schema, and rebuilt from it when a file is opened.
 *
 * Resetting first matters: fromFs only sets the keys a file actually
 * mentions, so opening a stock with no SAT line after one with SAT 110
 * would silently keep the 110 and write it into a film that never had
 * it.
 */
function defaults() {
  const v = {};
  for (const g of SCHEMA) for (const f of g.fields) {
    v[f.id] = f.type === "hues" ? Array(6).fill(f.def)
            : f.type === "rgb"  ? (Array.isArray(f.def) ? f.def.slice() : Array(3).fill(f.def))
            : f.def;
  }
  return v;
}

let V = defaults();

/* ---- the control panel, built from the schema ------------------------ */

function fmt(f, n) {
  const d = (f.step && f.step < 1) ? 2 : 0;
  return (+n).toFixed(d) + (f.unit || "");
}

function buildPanel() {
  const panel = $("panel");
  SCHEMA.forEach((g, gi) => {
    const d = document.createElement("details");
    d.className = "grp";
    if (gi < 3) d.open = true;
    d.innerHTML = `<summary>${g.group}</summary><div></div>`;
    const box = d.querySelector("div");

    for (const f of g.fields) {
      const row = document.createElement("div");
      row.className = "row";

      if (f.type === "text") {
        row.innerHTML = `<div class="lab"><span>${f.key}</span></div>
          <input type="text" maxlength="${f.max}" value="${V[f.id]}">
          <p class="help">${f.help}</p>`;
        const i = row.querySelector("input");
        i.oninput = () => { V[f.id] = i.value; schedule(false); };

      } else if (f.type === "range" || f.type === "curve") {
        const min = f.type === "curve" ? -100 : f.min;
        const max = f.type === "curve" ? 100 : f.max;
        const step = f.step || 1;
        const label = f.type === "curve" ? "CONTRAST" : f.key;
        row.innerHTML = `<div class="lab"><span>${label}</span>
            <span class="val">${fmt(f, V[f.id])}</span></div>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${V[f.id]}">
          <p class="help">${f.help}</p>`;
        const i = row.querySelector("input"), v = row.querySelector(".val");
        i.oninput = () => {
          V[f.id] = +i.value; v.textContent = fmt(f, i.value);
          /* Moving contrast is the only thing that discards a curve
           * loaded from a file. The line itself is held separately from
           * the preserved ones, so there is nothing to filter and no way
           * to take a [RAW] block's own CURVE with it. */
          if (f.type === "curve" && V._curveFromFile) {
            V._curveFromFile = false;
            curveNote();
          }
          schedule();
        };

      } else if (f.type === "rgb") {
        row.innerHTML = `<div class="lab"><span>${f.key}</span></div>
          <div class="sub3"></div><p class="help">${f.help}</p>`;
        const g3 = row.querySelector(".sub3");
        ["R", "G", "B"].forEach((ch, k) => {
          const c = document.createElement("div");
          c.innerHTML = `<label>${ch} <b>${V[f.id][k]}</b></label>
            <input type="range" min="${f.min}" max="${f.max}" step="1" value="${V[f.id][k]}">`;
          const i = c.querySelector("input"), b = c.querySelector("b");
          i.oninput = () => { V[f.id][k] = +i.value; b.textContent = i.value; schedule(); };
          g3.appendChild(c);
        });

      } else if (f.type === "hues") {
        row.innerHTML = `<div class="lab"><span>${f.key}</span></div>
          <div class="hues"></div><p class="help">${f.help}</p>`;
        const hs = row.querySelector(".hues");
        HUES.forEach((h, k) => {
          const c = document.createElement("div");
          c.className = "hue";
          c.innerHTML = `<i class="sw" style="background:${h.css}" title="${h.label}"></i>
            <input type="range" min="${f.min}" max="${f.max}" step="1" value="${V[f.id][k]}">
            <span class="hv">${V[f.id][k]}${f.unit || ""}</span>`;
          const i = c.querySelector("input"), v = c.querySelector(".hv");
          i.oninput = () => {
            V[f.id][k] = +i.value; v.textContent = i.value + (f.unit || ""); schedule();
          };
          hs.appendChild(c);
        });
      }
      box.appendChild(row);
    }
    panel.appendChild(d);
  });
}

/* Push V back into the DOM, after loading a .fs. Rebuilding the panel is
 * simpler than reconciling it, and it happens once per file open. */
function rebuildPanel() { $("panel").innerHTML = ""; buildPanel(); curveNote(); }

/* Say whether the curve on screen is the file's or the slider's. The
 * slider cannot describe a five-point curve, so a loaded one is kept
 * untouched until somebody deliberately replaces it. */
function curveNote() {
  const rows = document.querySelectorAll(".row");
  for (const r of rows) {
    const lab = r.querySelector(".lab span");
    if (!lab || lab.textContent !== "CONTRAST") continue;
    let n = r.querySelector(".curvenote");
    if (!n) {
      n = document.createElement("p");
      n.className = "help curvenote";
      r.appendChild(n);
    }
    n.innerHTML = V._curveFromFile
      ? '<span class="clamp">The curve from the file is being used as it is.</span> '
        + 'Move this to replace it, which cannot be undone without reloading.'
      : "";
  }
}

/* ---- the engine ------------------------------------------------------ */

async function initEngine() {
  wasm = await loadEngine();
  api = {
    load: wasm.cwrap("se_api_load", "number", ["number", "number"]),
    apply: wasm.cwrap("se_api_apply", "number", ["number", "number", "number", "number"]),
    version: wasm.cwrap("se_api_version", "number", []),
    effRadius: wasm.cwrap("se_api_eff_radius", "number", ["number", "number"]),
  };
  $("ver").textContent = "stock format v" + api.version();
  showBuild();
}

/*
 * Say which build this is.
 *
 * The one failure this editor cannot detect for itself is its own
 * engine falling behind the camera's: the preview keeps working, the
 * camera keeps shooting, and they quietly stop agreeing. CI stamps the
 * commit it built from, so a page that has gone stale can be identified
 * from the browser instead of guessed at.
 */
async function showBuild() {
  try {
    const r = await fetch("build.json", { cache: "no-store" });
    if (!r.ok) return;                       /* a local build has none */
    const b = await r.json();
    const sha = (b.commit || "").slice(0, 7);
    if (!sha) return;
    const el = $("ver");
    el.innerHTML = el.textContent + " · build " +
      '<a href="https://github.com/jiijii0/soup-stocks/commit/' + b.commit + '">' + sha + '</a>';
    el.title = "built " + (b.built || "?") + " — compare with the engine on your card";
  } catch (e) { /* offline, or opened from a file: not worth reporting */ }
}

function loadStock() {
  const text = toFs(V, api.version());
  const n = wasm.lengthBytesUTF8(text) + 1;
  const p = wasm._malloc(n);
  wasm.stringToUTF8(text, p, n);
  const rc = api.load(p, n - 1);
  wasm._free(p);
  return rc === 0;
}

function render() {
  if (!source || !api) return;
  const t0 = performance.now();
  const { width: w, height: h } = source;

  if (showOriginal) {
    els.ctx.putImageData(source, 0, 0);
    status(`original · ${w}×${h}`);
    return;
  }
  if (!loadStock()) { status("stock would not parse"); return; }

  const bytes = w * h * 4;
  const p = wasm._malloc(bytes);
  wasm.HEAPU8.set(source.data, p);
  const rc = api.apply(p, w, h, camW, camScale);
  if (rc !== 0) { wasm._free(p); status("apply failed (rc " + rc + ")"); return; }

  const out = new ImageData(new Uint8ClampedArray(wasm.HEAPU8.subarray(p, p + bytes)), w, h);
  wasm._free(p);
  els.ctx.putImageData(out, 0, 0);
  status(`${w}×${h} · scale ${scale} · ${Math.round(performance.now() - t0)} ms`);
}

function schedule(needsRender = true) {
  if (!needsRender) return;
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

const status = s => { $("status").textContent = s; };

/* What to do with the file that was just downloaded. Stays on screen,
 * because it is two steps and the second one is easy to miss. */
function showInstall(file) {
  const el = $("install");
  if (!el) return;
  el.innerHTML =
    '<b>Putting it on the card</b>' +
    '<ol>' +
    '<li>Copy <code>' + file + '</code> into <code>ML/FILM/</code></li>' +
    '<li>Add the line <code>' + file + '</code> to <code>ML/FILM/INDEX.TXT</code></li>' +
    '</ol>' +
    '<p>The camera reads that index rather than listing the folder, so a ' +
    'stock that is not in it will not appear in the picker. The order of ' +
    'the lines is the order of the wheel.</p>';
  el.hidden = false;
}

/* ---- loading a photo ------------------------------------------------- */

function useImage(img) {
  const long = Math.max(img.width, img.height);
  const k = long > MAX_PREVIEW ? long / MAX_PREVIEW : 1;
  const w = Math.max(1, Math.round(img.width / k));
  const h = Math.max(1, Math.round(img.height / k));

  const cv = $("cv");
  cv.width = w; cv.height = h; cv.hidden = false;
  $("drop").style.display = "none";
  els.ctx = cv.getContext("2d", { willReadFrequently: true });
  els.ctx.drawImage(img, 0, 0, w, h);
  source = els.ctx.getImageData(0, 0, w, h);
  $("cmp").disabled = false;
  render();
}

function openFile(file) {
  if (!file) return;
  const img = new Image();
  img.onload = () => { useImage(img); URL.revokeObjectURL(img.src); };
  img.onerror = () => status("could not decode that image");
  img.src = URL.createObjectURL(file);
}

/* ---- wiring ---------------------------------------------------------- */

function wire() {
  const drop = $("drop"), frame = $("frame");
  drop.onclick = () => $("file").click();
  $("file").onchange = e => openFile(e.target.files[0]);

  for (const ev of ["dragenter", "dragover"]) {
    frame.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); });
  }
  for (const ev of ["dragleave", "drop"]) {
    frame.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); });
  }
  frame.addEventListener("drop", e => openFile(e.dataTransfer.files[0]));

  $("target").onchange = e => {
    const [cw, cs] = e.target.value.split(",").map(Number);
    camW = cw; camScale = cs;
    render();
  };

  const cmp = $("cmp");
  const show = v => { showOriginal = v; render(); };
  cmp.addEventListener("pointerdown", () => show(true));
  cmp.addEventListener("pointerup", () => show(false));
  cmp.addEventListener("pointerleave", () => { if (showOriginal) show(false); });

  $("save").onclick = () => {
    const text = toFs(V, api ? api.version() : 3);
    const name = (V.name || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "") || "stock";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = name.slice(0, 8) + ".fs";
    a.click();
    URL.revokeObjectURL(a.href);
    /*
     * Both steps, every time.
     *
     * The camera does not enumerate ML/FILM: it reads INDEX.TXT and loads
     * only what is listed there, one filename per line. Dropping a .fs on
     * the card and nothing else leaves it invisible in the picker, with
     * nothing to say why, so the instruction has to carry both halves.
     */
    showInstall(a.download);
    status("saved " + a.download);
  };

  $("fsin").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    V = fromFs(await f.text(), defaults());
    rebuildPanel();
    render();
    const kept = (V._extra || []).length + (V._curveFromFile ? 1 : 0);
    status(`loaded ${f.name}` +
      (kept ? ` \u00b7 ${kept} line${kept === 1 ? "" : "s"} kept as they are` : ""));
  };
}

buildPanel();
wire();
initEngine().then(render).catch(err => {
  $("ver").textContent = "engine failed to load";
  status(String(err));
});
