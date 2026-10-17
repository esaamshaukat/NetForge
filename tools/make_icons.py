#!/usr/bin/env python3
"""Draws the app icons into icons/. Needs:  pip install pillow   (only if you want to change the icon)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
TEAL, DARK, LIGHT = (11, 122, 117), (9, 70, 68), (244, 241, 236)


def draw(size, maskable=False):
    s = size * 4                                   # draw big, then shrink = smooth edges
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=TEAL)
        k = 0.62                                   # keep the artwork inside the safe zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * .22), fill=TEAL)
        k = 0.78
    c, r = s / 2, s * k / 2
    nodes = [(c, c - r * .62), (c - r * .62, c + r * .5), (c + r * .62, c + r * .5)]   # three linked nodes
    w = max(4, int(s * .028))
    for a in range(3):
        for b in range(a + 1, 3):
            d.line([nodes[a], nodes[b]], fill=LIGHT, width=w)
    d.line([nodes[0], (c, c + r * .18)], fill=LIGHT, width=w)
    for (x, y) in nodes:
        rr = s * .085
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=LIGHT)
        d.ellipse([x - rr * .45, y - rr * .45, x + rr * .45, y + rr * .45], fill=DARK)
    rr = s * .06
    d.ellipse([c - rr, c + r * .18 - rr, c + rr, c + r * .18 + rr], fill=LIGHT)
    return im.resize((size, size), Image.LANCZOS)


draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, True).save(OUT / "maskable-512.png")
bg = Image.new("RGB", (180, 180), TEAL)
bg.paste(draw(180, True), (0, 0), draw(180, True))
bg.save(OUT / "apple-touch-icon.png")
print("Icons written to", OUT)
