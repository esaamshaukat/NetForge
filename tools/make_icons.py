#!/usr/bin/env python3
"""
Makes all app icons from your logo picture (needs:  pip install pillow).

    python tools/make_icons.py [path/to/logo.png]     (without a path it uses tools/logo-source.png, the NetForge anvil)

The logo should be a rounded square (dark teal) with the symbol in the middle, like the NetForge anvil.
It writes into icons/:  icon-192.png, icon-512.png (rounded, for the header/login/install),
maskable-512.png (Android, symbol kept inside the safe zone), apple-touch-icon.png (iPhone/iPad), favicon-32.png.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "logo-source.png"
im = Image.open(src).convert("RGB")
W = im.size[0]

# 1. make the white corners transparent (flood fill from the four corners)
work = im.copy()
for pt in [(0, 0), (W - 1, 0), (0, W - 1), (W - 1, W - 1)]:
    ImageDraw.floodfill(work, pt, (255, 0, 255), thresh=40)
rgba = Image.new("RGBA", im.size)
px, wp, ip = rgba.load(), work.load(), im.load()
for y in range(W):
    for x in range(W):
        r, g, b = wp[x, y]
        px[x, y] = (0, 0, 0, 0) if (r, g, b) == (255, 0, 255) else (*ip[x, y], 255)

# 2. background colour and the symbol's bounding box
teal = tuple(int(sum(im.getpixel((x, y))[i] for x in range(90, 150, 5) for y in range(450, 550, 5)) / 240) for i in range(3))
m = int(W * 0.12)
xs, ys = [], []
for y in range(m, W - m, 2):
    for x in range(m, W - m, 2):
        p = ip[x, y]
        if sum(abs(p[i] - teal[i]) for i in range(3)) > 60:
            xs.append(x); ys.append(y)
box = (max(0, min(xs) - 4), max(0, min(ys) - 4), min(W, max(xs) + 5), min(W, max(ys) + 5))
sym = im.crop(box)


edge = [sym.getpixel((x, y)) for x in range(0, sym.size[0], 3) for y in (0, sym.size[1] - 1)] + [sym.getpixel((x, y)) for y in range(0, sym.size[1], 3) for x in (0, sym.size[0] - 1)]
fill_c = tuple(int(sum(p[i] for p in edge) / len(edge)) for i in range(3))


def full_bleed(size, fill):
    """Square teal canvas with the symbol centred, symbol width = fill * size."""
    c = Image.new("RGB", (size, size), fill_c)
    k = size * fill / sym.size[0]
    s = sym.resize((max(1, int(sym.size[0] * k)), max(1, int(sym.size[1] * k))), Image.LANCZOS)
    c.paste(s, ((size - s.size[0]) // 2, (size - s.size[1]) // 2))
    return c


rgba.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png")
rgba.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png")
rgba.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png")
full_bleed(512, 0.52).save(OUT / "maskable-512.png")          # Android crops to a circle: keep the symbol small
full_bleed(180, 0.62).save(OUT / "apple-touch-icon.png")        # iOS rounds the corners itself
print("Icons written to", OUT, "| background colour", teal, "| symbol box", box)
