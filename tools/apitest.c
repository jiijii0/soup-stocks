#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int se_api_load(const char *t, int n);
int se_api_apply(unsigned char *px, int w, int h, int cam_w, int cam_scale);
int se_api_version(void);
int se_api_eff_radius(int cam_w, int cam_scale);

static const char *STOCK =
"VERSION 3\nNAME TEST\nCURVE 0,0 28,9 128,136 255,255\n"
"SAT 150\nHUE_SAT 118,92,132,124,138,108\nHUE_ROT -6,-10,14,10,18,4\n"
"HUE_LUM 98,92,80,84,74,96\nSPLIT_SH -8,0,14\nSPLIT_HI 10,4,-6\n"
"HALATION 100 218 30\nHAL_TINT 255,42,16\nGRAIN 38\nGRAIN_SIZE 40\n";

int main(void){
    int w=320,h=240,i,x,y,bad=0;
    unsigned char *a=malloc(w*h*4), *b=malloc(w*h*4), *orig=malloc(w*h*4);
    for(y=0;y<h;y++)for(x=0;x<w;x++){
        int i4=(y*w+x)*4, bright=(x>40&&x<90&&y>30&&y<80);
        orig[i4+0]=bright?255:(x*3)&0xFF;
        orig[i4+1]=bright?250:(y*5)&0xFF;
        orig[i4+2]=bright?240:((x+y)*2)&0xFF;
        orig[i4+3]=200;                      /* a non-trivial alpha */
    }
    printf("  engine stock format v%d\n", se_api_version());
    if(se_api_load(STOCK,(int)strlen(STOCK))!=0){puts("  load FAILED");return 1;}
    puts("  stock parsed");

    memcpy(a,orig,w*h*4);
    if(se_api_apply(a,w,h,1536,1)!=0){puts("  apply FAILED (rows did not all come back)");return 1;}
    puts("  applied, every row returned");

    /* again, to prove it is deterministic */
    memcpy(b,orig,w*h*4);
    se_api_apply(b,w,h,1536,1);
    if(memcmp(a,b,w*h*4)){puts("  NOT deterministic");return 1;}
    puts("  deterministic across runs");

    /* the image must actually have changed, or we are testing nothing */
    if(!memcmp(a,orig,w*h*4)){puts("  output identical to input -- look did nothing");return 1;}

    /* alpha must survive untouched */
    for(i=3;i<w*h*4;i+=4) if(a[i]!=200){bad++;}
    printf("  alpha preserved: %s\n", bad?"NO":"yes");

    /* The clamp the editor has to show: radius 30 survives differently
     * at each width the camera might write, and the preview must track
     * it rather than the width it happens to be rendering at. */
    {
        struct { int w, s; const char *what; } cases[] = {
            { 4368, 1, "raw, full size" },
            { 2184, 2, "raw, half size" },
            { 1536, 1, "preview JPEG, full" },
            {  768, 2, "preview JPEG, half" },
        };
        int i;
        puts("  halation radius 30 as the camera would fit it:");
        for (i = 0; i < 4; i++)
            printf("     %-22s %4d px wide -> radius %2d\n", cases[i].what,
                   cases[i].w, se_api_eff_radius(cases[i].w, cases[i].s));
    }

    /* and a pixel that was pure bright should have moved */
    {int i4=((50*w)+60)*4;
     printf("  sample pixel %3d,%3d,%3d -> %3d,%3d,%3d\n",
        orig[i4],orig[i4+1],orig[i4+2],a[i4],a[i4+1],a[i4+2]);}
    return bad?1:0;
}
