"""Draws the ElleeDog 67 Manual artwork as 64x64 pixel art and renders it as the in-game assets:
the book item texture (128x128) and the core pack icons (256x256).

    uv run --project tools/codegen/pets --frozen python tools/art/manual_book.py [--previews <dir>]

The picture is a straight-on red leather book with gold corners and gems: the black cat, the bearded man in teal,
Carter in his shades and the white cat stand on a grass strip above the "ElleeDog 67" logo and a MANUAL banner.
"""
import sys
from pathlib import Path

from PIL import Image

ITEM_TEXTURE = Path("resource_packs/elleedog67/textures/items/elleedog67_feature_book.png")
PACK_ICONS = [Path("behavior_packs/elleedog67/pack_icon.png"), Path("resource_packs/elleedog67/pack_icon.png")]
GRID = 64

PALETTE = {
    "cover": (155, 28, 28),
    "cover_light": (168, 36, 36),
    "cover_dark": (122, 20, 20),
    "spine": (104, 16, 16),
    "spine_dark": (78, 10, 10),
    "gold": (232, 185, 35),
    "gold_light": (250, 220, 90),
    "gold_dark": (176, 128, 18),
    "gem": (255, 60, 60),
    "gem_light": (255, 150, 150),
    "gem_dark": (150, 10, 10),
    "page": (241, 228, 195),
    "page_dark": (205, 188, 150),
    "grass": (92, 191, 92),
    "grass_mid": (62, 158, 62),
    "dirt": (110, 72, 40),
    "white": (245, 245, 245),
    "white_shade": (205, 205, 205),
    "ink": (40, 40, 40),
    "red_text": (245, 70, 66),
    "red_text_light": (255, 140, 130),
    "red_text_dark": (70, 8, 8),
    "banner": (92, 14, 14),
    "chestnut": (181, 98, 46),
    "chestnut_dark": (130, 66, 28),
    "cream": (246, 241, 231),
    "black": (30, 30, 30),
    "black_soft": (60, 60, 60),
    "green_eye": (120, 220, 90),
    "blue_eye": (70, 140, 230),
    "pink": (240, 150, 160),
    "skin": (224, 168, 120),
    "hair": (90, 58, 30),
    "hair_dark": (60, 38, 18),
    "teal": (46, 139, 139),
    "teal_dark": (32, 100, 100),
    "jeans": (60, 90, 138),
    "shoe": (50, 40, 35),
}

canvas = Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))
px = canvas.load()


def put(x, y, name):
    if 0 <= x < GRID and 0 <= y < GRID:
        px[x, y] = (*PALETTE[name], 255)


def rect(x0, y0, x1, y1, name):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(x, y, name)


def sprite(rows, key, ox, oy):
    """Blits a string map at (ox, oy); '.' is transparent, other characters look up `key`."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != ".":
                put(ox + i, oy + j, key[ch])


def sprite_size(rows):
    return len(rows[0]), len(rows)


# ---------------------------------------------------------------- the book
rect(0, 1, 5, 62, "spine")
rect(5, 1, 5, 62, "spine_dark")
for band in (5, 30, 55):
    rect(0, band, 5, band + 1, "gold")
    rect(0, band + 2, 5, band + 2, "gold_dark")
rect(6, 1, 61, 62, "cover")
for y in range(1, 63):
    for x in range(6, 62):
        if (x + y) % 6 == 0 or (x - y) % 6 == 0:
            put(x, y, "cover_light")
rect(6, 1, 61, 1, "cover_dark")
rect(6, 62, 61, 62, "cover_dark")
rect(61, 1, 61, 62, "cover_dark")
rect(62, 3, 63, 63, "page")
rect(62, 3, 62, 63, "page_dark")
rect(8, 63, 63, 63, "page")
rect(8, 63, 61, 63, "page_dark")


def corner(cx, cy, dx, dy):
    """A gold L bracket whose arms run from the corner (cx, cy) in the directions dx, dy, with a red gem."""
    for i in range(9):
        for t in range(2):
            put(cx + dx * i, cy + dy * t, "gold")
            put(cx + dx * t, cy + dy * i, "gold")
    put(cx + dx * 8, cy, "gold_dark")
    put(cx, cy + dy * 8, "gold_dark")
    put(cx + dx * 2, cy + dy * 2, "gold_light")
    for i in range(2):
        for j in range(2):
            put(cx + dx * (3 + i), cy + dy * (3 + j), "gem")
    put(cx + dx * 3, cy + dy * 3, "gem_light")
    put(cx + dx * 4, cy + dy * 4, "gem_dark")


corner(7, 2, 1, 1)
corner(60, 2, -1, 1)
corner(7, 61, 1, -1)
corner(60, 61, -1, -1)

# ---------------------------------------------------------------- the grass strip
rect(11, 29, 56, 29, "grass")
rect(11, 30, 56, 30, "grass_mid")
rect(11, 31, 56, 31, "dirt")
for x in range(12, 56, 5):
    put(x, 29, "grass_mid")
    put(x + 2, 31, "cover_dark")

# ---------------------------------------------------------------- the characters (feet on row 28)
BLACK_CAT = [
    ".K......K.",
    ".KK....KK.",
    ".KKKKKKKK.",
    ".KGKKKKGK.",
    ".KKKKKKKK.",
    ".KKKWWKKK.",
    "..KWWWWK..",
    "..KWWWWK..",
    ".KKWWWWKK.",
    ".KKKWWKKK.",
    ".KK....KK.",
    ".KK....KK.",
]
MAN = [
    "..HHHHHHHH..",
    ".HHHHHHHHHH.",
    ".HHSSSSSSHH.",
    ".HHSKSSKSHH.",
    ".HHSSSSSSHH.",
    ".HHSSSSSSHH.",
    ".HHhSSSShHH.",
    "..HhhKKhhH..",
    "..HHhhhhHH..",
    "...TTTTTT...",
    "..TTTTTTTT..",
    ".STTTTTTTTS.",
    ".STTtTTtTTS.",
    ".STTTTTTTTS.",
    "..TTTTTTTT..",
    "..JJJJJJJJ..",
    "..JJJ..JJJ..",
    "..JJJ..JJJ..",
    "..JJJ..JJJ..",
    "..OOO..OOO..",
]
CARTER = [
    "..CCCCCCCCCC..",
    ".CCCCCCCCCCCC.",
    "CCCCCCWWCCCCCC",
    "CCCCCCWWCCCCCC",
    "CCKKKKKKKKKKCC",
    "CCKKkKKKKkKKCC",
    "CCCCCWWWWCCCCC",
    "CCCCWWWWWWCCCC",
    "CCCWWWNNWWWCCC",
    "CCCWWWWWWWWCCC",
    ".DCCWWWWWWCCD.",
    ".DDWWWWWWWWDD.",
    "..WWWCCCCWWW..",
    "..WWWWWWWWWW..",
    "..CC......CC..",
    "..CC......CC..",
]
WHITE_CAT = [
    ".W......W.",
    ".WP....PW.",
    ".WWWWWWWW.",
    ".WBWWWWBW.",
    ".WWWWWWWW.",
    ".WWWWPWWW.",
    "..WWWWWW..",
    "..WWWWWW..",
    ".WWWWWWWW.",
    ".WsWWWWsW.",
    ".WW....WW.",
    ".WW....WW.",
]
KEY = {
    "K": "black", "k": "black_soft", "G": "green_eye", "W": "white", "s": "white_shade",
    "H": "hair", "h": "hair_dark", "S": "skin", "T": "teal", "t": "teal_dark", "J": "jeans", "O": "shoe",
    "C": "chestnut", "D": "chestnut_dark", "N": "black", "P": "pink", "B": "blue_eye",
}
KEY["W"] = "cream"
KEY_CAT_WHITE = {**KEY, "W": "white"}
FLOOR = 29
for rows, key, x in ((BLACK_CAT, KEY, 9), (MAN, KEY, 19), (CARTER, KEY, 32), (WHITE_CAT, KEY_CAT_WHITE, 47)):
    sprite(rows, key, x, FLOOR - sprite_size(rows)[1])

# ---------------------------------------------------------------- the logo
FONT = {
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "l": ["##", "##", "##", "##", "##", "##", "##"],
    "e": [".....", ".....", ".###.", "#...#", "#####", "#....", ".####"],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "o": [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
    "g": [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
}
DIGITS = {
    "6": [".#####.", "##...##", "##.....", "######.", "##...##", "##...##", "##...##", "##...##", ".#####."],
    "7": ["#######", "#....##", ".....##", "....##.", "....##.", "...##..", "...##..", "...##..", "...##.."],
}
SMALL = {
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    "A": [".###.", "#...#", "#####", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
    "U": ["#...#", "#...#", "#...#", "#...#", ".###."],
    "L": ["#....", "#....", "#....", "#....", "#####"],
}


def text_width(text, font, gap=1):
    return sum(len(font[ch][0]) for ch in text) + gap * (len(text) - 1)


def draw_text(text, font, x, y, fill, outline, shadow=None, gap=1):
    """Outlined pixel text; the outline is drawn first in eight directions, then an optional drop shadow, then the fill."""
    cursor = x
    for ch in text:
        rows = font[ch]
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c != "#":
                    continue
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        put(cursor + i + dx, y + j + dy, outline)
                if shadow:
                    put(cursor + i + 1, y + j + 2, shadow)
                    put(cursor + i + 2, y + j + 2, shadow)
        cursor += len(rows[0]) + gap
    cursor = x
    for ch in text:
        rows = font[ch]
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == "#":
                    put(cursor + i, y + j, fill)
        cursor += len(rows[0]) + gap


CENTER = 34
name = "ElleeDog"
draw_text(name, FONT, CENTER - text_width(name, FONT) // 2, 34, "white", "ink", shadow="black_soft")
digits_x = CENTER - text_width("67", DIGITS, 2) // 2
draw_text("67", DIGITS, digits_x, 43, "red_text", "red_text_dark", shadow="black", gap=2)
cursor = digits_x
for ch in "67":
    rows = DIGITS[ch]
    for j, row in enumerate(rows):
        for i, c in enumerate(row):
            if c == "#" and (j == 0 or rows[j - 1][i] != "#"):
                put(cursor + i, 43 + j, "red_text_light")
    cursor += len(rows[0]) + 2

# ---------------------------------------------------------------- the banner
rect(17, 55, 51, 61, "gold")
rect(18, 56, 50, 60, "banner")
put(17, 55, "gold_light")
put(51, 61, "gold_dark")
banner_text = "MANUAL"
draw_text(banner_text, SMALL, CENTER - text_width(banner_text, SMALL) // 2, 56, "gold", "banner", gap=1)
for x in (20, 48):
    put(x, 58, "gem")

# ---------------------------------------------------------------- output
ITEM_TEXTURE.parent.mkdir(parents=True, exist_ok=True)
canvas.resize((128, 128), Image.NEAREST).save(ITEM_TEXTURE)
print("wrote", ITEM_TEXTURE)
for icon in PACK_ICONS:
    canvas.resize((256, 256), Image.NEAREST).save(icon)
    print("wrote", icon)
previews = sys.argv[sys.argv.index("--previews") + 1] if "--previews" in sys.argv else None
if previews:
    out = Path(previews)
    out.mkdir(parents=True, exist_ok=True)
    canvas.resize((512, 512), Image.NEAREST).save(out / "manual_book_zoom.png")
    canvas.resize((32, 32), Image.BOX).resize((256, 256), Image.NEAREST).save(out / "manual_book_hotbar_preview.png")
