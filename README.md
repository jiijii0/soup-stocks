<div align="center">

# 🎨 Soup Stocks <sub><sup>beta</sup></sub>

### A film stock editor for [Soup Engine](https://github.com/jiijii0/soup-engine).

<br>

## 👉 [Open the editor](https://jiijii0.github.io/soup-stocks/)

<br>

`beta` &nbsp;·&nbsp; `GPL v2` &nbsp;·&nbsp; `runs in your browser`

</div>

<br>

Drop in a photo, move the sliders, download a `.fs` file, put it on the
card.

Your photo is processed in your browser and never uploaded. The preview
runs the camera's own code compiled to WebAssembly, so it matches what
the camera writes.

> 🧪 **Beta.** The engine is still being tuned, so a stock you write
> today may look a bit different after an update.

> ⚖️ **No warranty.** See sections 11 and 12 of the [licence](LICENSE).

<br>

## Putting a stock on the card

1. Copy `mylook.fs` into `ML/FILM/` on the card
2. Add a line saying `mylook.fs` to `ML/FILM/INDEX.TXT`

A stock that isn't listed in `INDEX.TXT` won't appear in the picker. The
order of the lines is the order on the wheel.

<br>

## Controls

| | |
|:--|:--|
| **Exposure, contrast, saturation** | overall |
| **Per hue** | saturation, hue shift and brightness for six colour ranges |
| **Split tone** | one cast in the shadows, another in the highlights |
| **Halation** | red-orange glow around bright lights |
| **Grain** | brightness only, strongest in the midtones |

Set the output size dropdown to the frame size the camera will write.
Halation shrinks on bigger images: 30 px comes out around 7 px full
size, 23 px on a small one. The editor says when it has been reduced.

<br>

## Editing an included stock

Settings with no slider yet, mainly the tone curve, are left unchanged
when you save. The contrast slider replaces the curve only if you move
it.

<br>

## Licence

GPL v2, same as Soup Engine. See [LICENSE](LICENSE). No warranty.
