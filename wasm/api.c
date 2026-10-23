/*
 * The bridge between the browser and engine/look.c.
 *
 * The point of this file, and of the whole editor, is that the preview
 * is not an approximation. It is the same look.c the camera runs,
 * compiled to WebAssembly, applied to the same pixels. An editor that
 * previewed something close would be worse than no editor, because
 * people would spend evenings tuning against a lie.
 *
 * So nothing here reimplements anything. It converts RGBA to RGB,
 * hands rows to se_look_rows, and writes what comes back.
 *
 * In place is safe, and not by luck: the look emits row k only once row
 * k+radius has arrived, so output always lags input and a written row
 * is never read again.
 */
#include "look.h"
#include "stock.h"
#include "se.h"
#include <string.h>

#define ARENA_BYTES (6u << 20)      /* radius 48 at 4000 px needs ~1 MB */
#define MAX_W       8192

static uint8_t  g_arena[ARENA_BYTES];
static se_stock g_stock;
static se_look  g_look;
static int      g_have;

/* the image being worked on, and where the next finished row goes */
static uint8_t *g_px;
static int      g_w, g_out_y;
static uint8_t  g_row[MAX_W * 3];

int se_api_version(void)        { return SE_STOCK_VERSION; }
int se_api_stock_version(void)  { return g_have ? g_stock.version : 0; }

/*
 * Parse a stock. Returns 0 on success.
 *
 * The text is exactly what a .fs file holds, so what the editor writes
 * out is what it previewed, with no separate serialisation to drift.
 */
int se_api_load(const char *text, int len)
{
    g_have = 0;
    if (!text || len <= 0) return -1;
    if (se_stock_parse(text, (size_t)len, &g_stock) != SE_OK) return -1;
    g_have = 1;
    return 0;
}

/*
 * What the camera will actually use, given its output width.
 *
 * Worth surfacing because the clamp is invisible otherwise: a stock can
 * ask for a radius of 30 and get 8, and the only sign is a glow smaller
 * than the one that was dialled in. The editor shows both numbers.
 */
int se_api_eff_radius(int cam_w, int cam_scale)
{
    se_look lk;
    if (!g_have) return 0;
    if (cam_scale < 1) cam_scale = 1;
    if (cam_w < 1) cam_w = 1;
    se_look_from_stock(&g_stock, cam_scale, &lk);
    se_look_fit(&lk, cam_w, SE_LOOK_BUDGET);
    return lk.hal_amount > 0 ? lk.hal_radius : 0;
}

static int emit_row(void *ctx, const uint8_t *row, int w)
{
    uint8_t *d;
    int x;
    (void)ctx;
    d = g_px + (size_t)g_out_y * (size_t)g_w * 4;
    for (x = 0; x < w; x++) {
        d[x * 4 + 0] = row[x * 3 + 0];
        d[x * 4 + 1] = row[x * 3 + 1];
        d[x * 4 + 2] = row[x * 3 + 2];
        /* alpha left alone */
    }
    g_out_y++;
    return 0;
}

/*
 * Apply the loaded stock to RGBA pixels, in place.
 *
 * `cam_w` and `cam_scale` describe the frame the CAMERA will write, not
 * the one being previewed, and getting this wrong is the one way this
 * editor can lie convincingly.
 *
 * Grain and halation are in output pixels, so se_look_from_stock
 * divides both by the decode scale. Then se_look_fit shrinks the
 * halation radius until its delay line fits SE_LOOK_BUDGET -- and how
 * far it has to shrink depends on the width, because the line is rows
 * of the output. A stock asking for radius 30 keeps about 8 of it at
 * 4368 px and about 24 at 1536 px.
 *
 * So the fit is done at the camera's width, which is what decides the
 * radius, and only then rescaled onto the preview's smaller grid. Doing
 * the fit at the preview width instead would have shown a radius-27
 * glow where the camera produces 8.
 */
int se_api_apply(uint8_t *px, int w, int h, int cam_w, int cam_scale)
{
    se_arena     ar;
    se_look_run *run = 0;
    int          y, x;

    if (!g_have || !px || w <= 0 || h <= 0 || w > MAX_W) return -1;
    if (cam_scale < 1) cam_scale = 1;
    if (cam_w < 1) cam_w = w;

    /* What the camera will end up with. */
    se_look_from_stock(&g_stock, cam_scale, &g_look);
    se_look_fit(&g_look, cam_w, SE_LOOK_BUDGET);

    /* The same look, measured in preview pixels. Both of these are
     * lengths in the output grid, so both scale with the width. */
    if (w != cam_w) {
        int r = g_look.hal_radius * w / cam_w;
        int c = g_look.grain_cell * w / cam_w;
        g_look.hal_radius = r > 1 ? r : 1;
        g_look.grain_cell = c > 1 ? c : 1;
    }

    /* And it has to fit the arena we actually have. */
    se_look_fit(&g_look, w, ARENA_BYTES - 65536);

    se_arena_init(&ar, g_arena, ARENA_BYTES);
    if (se_look_begin(&run, &g_look, w, &ar) != SE_OK) return -1;

    g_px = px; g_w = w; g_out_y = 0;

    for (y = 0; y < h; y++) {
        const uint8_t *s = px + (size_t)y * (size_t)w * 4;
        for (x = 0; x < w; x++) {
            g_row[x * 3 + 0] = s[x * 4 + 0];
            g_row[x * 3 + 1] = s[x * 4 + 1];
            g_row[x * 3 + 2] = s[x * 4 + 2];
        }
        if (se_look_rows(run, g_row, 1, emit_row, 0) != SE_OK) return -1;
    }
    if (se_look_end(run, emit_row, 0) != SE_OK) return -1;

    return g_out_y == h ? 0 : -1;       /* every row must come back */
}
