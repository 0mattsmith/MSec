#!/usr/bin/env python3
"""Regenerate the NSIS installer artwork from the app icon.

    python3 src-tauri/installer/make-art.py

NSIS requires BMP, and the sizes are fixed by the Modern UI: the sidebar is
164x314 (welcome and finish pages) and the header is 150x57 (every other page).
Checked in as binaries because CI has no Pillow, but generated so the branding
can be changed in one place rather than edited by hand in an image editor.
"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.dirname(__file__)

BG_TOP, BG_BOTTOM = (18, 20, 26), (26, 31, 38)
INDIGO, SLATE, WHITE = (99, 102, 241), (148, 163, 184), (255, 255, 255)
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def vertical_gradient(size, top, bottom):
    w, h = size
    img = Image.new('RGB', size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)],
               fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def main():
    logo = Image.open(os.path.join(ROOT, 'public', 'icons', 'icon-512.png')).convert('RGBA')

    side = vertical_gradient((164, 314), BG_TOP, BG_BOTTOM)
    glow = Image.new('RGBA', (164, 314), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r, a in ((96, 10), (76, 14), (56, 18), (38, 22)):
        gd.ellipse([82 - r, 118 - r, 82 + r, 118 + r], fill=INDIGO + (a,))
    side = Image.alpha_composite(side.convert('RGBA'), glow).convert('RGB')
    d = ImageDraw.Draw(side)

    mark = logo.resize((84, 84), Image.LANCZOS)
    side.paste(mark, (40, 76), mark)
    d.text((82, 188), 'MSec', font=ImageFont.truetype(BOLD, 30), fill=WHITE, anchor='mm')
    f_tag = ImageFont.truetype(REG, 11)
    d.text((82, 212), 'Password Manager', font=f_tag, fill=SLATE, anchor='mm')
    d.text((82, 228), '& Authenticator', font=f_tag, fill=SLATE, anchor='mm')
    d.line([(44, 252), (120, 252)], fill=INDIGO, width=1)
    f_foot = ImageFont.truetype(REG, 9)
    d.text((82, 272), 'Zero-knowledge', font=f_foot, fill=SLATE, anchor='mm')
    d.text((82, 285), 'AES-256-GCM', font=f_foot, fill=SLATE, anchor='mm')
    side.save(os.path.join(OUT, 'sidebar.bmp'), 'BMP')

    head = vertical_gradient((150, 57), BG_TOP, BG_BOTTOM)
    hd = ImageDraw.Draw(head)
    hmark = logo.resize((36, 36), Image.LANCZOS)
    head.paste(hmark, (12, 11), hmark)
    hd.text((58, 22), 'MSec', font=ImageFont.truetype(BOLD, 17), fill=WHITE, anchor='lm')
    hd.text((59, 38), 'secure by design', font=ImageFont.truetype(REG, 8), fill=SLATE, anchor='lm')
    head.save(os.path.join(OUT, 'header.bmp'), 'BMP')

    print('wrote sidebar.bmp (164x314) and header.bmp (150x57)')


if __name__ == '__main__':
    main()
