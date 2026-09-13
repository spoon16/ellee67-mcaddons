"""Draws the ElleeDog 67 Manual item icon from the Pet Morpher book's geometry: chestnut leather, Carter's face and a
green 67 on the cream panel, with the green ribbon and the bone spine kept.

Run from the repo root after `npm run codegen` (it reads the generated Pet Morpher book):
    uv run --project tools/codegen/pets --frozen python tools/art/manual_book.py
It writes resource_packs/elleedog67/textures/items/elleedog67_feature_book.png; the two preview files are optional
(pass --previews <dir>).
"""
import colorsys, random, sys
from pathlib import Path
from PIL import Image

SRC = Path("resource_packs/elleedog67_pets/textures/items/pet_morpher_book_043.png")
OUT = Path("resource_packs/elleedog67/textures/items/elleedog67_feature_book.png")
PREVIEWS = Path(sys.argv[sys.argv.index("--previews") + 1]) if "--previews" in sys.argv else None
random.seed(67)

im = Image.open(SRC).convert("RGBA")
W, H = im.size
px = im.load()

RIBBON = (44, 94, 76, 127)          # x0, y0, x1, y1: keep the green ribbon
PANEL = (36, 21, 99, 84)            # where the paw was drawn
CREAM = (252, 241, 219)

def is_green(p):
    if p[3] < 128: return False
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return 0.18 < h < 0.45 and s > 0.3

def chestnut(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    r, g, b = colorsys.hsv_to_rgb(0.058, 0.74, v * 0.92)
    return (int(r * 255), int(g * 255), int(b * 255), p[3])

def inside(box, x, y):
    return box[0] <= x <= box[2] and box[1] <= y <= box[3]

def paw_residue(p):
    # Inside the panel: the paw's green, its anti-aliased fringe and its dark outline; never the tan frame lines.
    if p[3] < 128: return False
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    if 0.15 < h < 0.5 and s > 0.06: return True
    return v < 0.85 and s < 0.2

# 1. Leather: every green pixel outside the ribbon becomes chestnut; the paw becomes cream (panel background).
for y in range(H):
    for x in range(W):
        p = px[x, y]
        if inside(RIBBON, x, y): continue
        if inside(PANEL, x, y):
            if paw_residue(p):
                n = random.randint(-3, 2)
                px[x, y] = (CREAM[0] + n, CREAM[1] + n, CREAM[2] + n, p[3])
        elif is_green(p):
            px[x, y] = chestnut(p)

# 2. Emblem: Carter's face and a green 67, axis-aligned 3px blocks, centred on the panel.
C = (181, 86, 44); D = (112, 52, 24); Wt = (247, 242, 232); K = (28, 24, 22); P = (214, 150, 140)
FACE = [
    "..DDDDDDD..",
    ".DCCCWCCCD.",
    "DCCCCWCCCCD",
    "DCCKCWCKCCD",
    "DCCCWWWCCCD",
    "DCCWWKWWCCD",
    "DCCWWWWWCCD",
    ".DD.WWW.DD.",
]
G = (58, 178, 66); GS = (30, 104, 38)
SIX = ["###", "#..", "###", "#.#", "###"]
SEVEN = ["###", "..#", ".##", ".#.", ".#."]
def blit(rows, palette, ox, oy, block):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "." : continue
            col = palette[ch]
            for dy in range(block):
                for dx in range(block):
                    px[ox + i * block + dx, oy + j * block + dy] = (*col, 255)

FACE_BLOCK, DIGIT_BLOCK = 4, 3
face_w = len(FACE[0]) * FACE_BLOCK; face_h = len(FACE) * FACE_BLOCK
cx = 67
face_y = 26
blit(FACE, {"C": C, "D": D, "W": Wt, "K": K}, cx - face_w // 2, face_y, FACE_BLOCK)
# digits with a one-pixel drop shadow to the lower right
dy0 = face_y + face_h + 3
digits_w = (3 + 1 + 3) * DIGIT_BLOCK
dx0 = cx - digits_w // 2
for rows, off in ((SIX, 0), (SEVEN, 4 * DIGIT_BLOCK)):
    blit(rows, {"#": GS}, dx0 + off + 1, dy0 + 1, DIGIT_BLOCK)
    blit(rows, {"#": G}, dx0 + off, dy0, DIGIT_BLOCK)

im.save(OUT)
print("wrote", OUT, im.size)
if PREVIEWS:
    im.resize((512, 512), Image.NEAREST).save(PREVIEWS / "manual_book_zoom.png")
    im.resize((32, 32), Image.BOX).resize((256, 256), Image.NEAREST).save(PREVIEWS / "manual_book_hotbar_preview.png")
