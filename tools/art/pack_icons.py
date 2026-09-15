"""Writes the pack icons that npm run codegen does not: Stair Sitting is 32x32 pixel art drawn here (an oak stair
in profile on a grass strip under a sky), Creeper Mod is the ElleeDog artwork in tools/art/sources/ resized. Both
are saved at 256x256:

    uv run --project tools/codegen/pets --frozen python tools/art/pack_icons.py
"""
from pathlib import Path

from PIL import Image

SOURCES = Path("tools/art/sources")

GRID = 32
ICONS = {
    "stair_sit": [
        Path("behavior_packs/elleedog67_stair_sit/pack_icon.png"),
        Path("resource_packs/elleedog67_stair_sit/pack_icon.png"),
    ],
    "creeper_mod": [Path("behavior_packs/elleedog67_creeper_mod/pack_icon.png")],
}

PALETTE = {
    "sky": (120, 178, 232),
    "sky_light": (160, 205, 245),
    "grass": (96, 168, 60),
    "grass_dark": (70, 130, 44),
    "dirt": (121, 85, 58),
    "dirt_dark": (92, 62, 40),
    "oak": (166, 132, 82),
    "oak_light": (192, 158, 104),
    "oak_dark": (120, 92, 54),
    "blast": (255, 196, 60),
    "blast_core": (255, 240, 170),
    "blast_edge": (232, 110, 30),
    "smoke": (90, 90, 90),
}


def canvas():
    return Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))


def rect(img, x0, y0, x1, y1, name):
    color = PALETTE[name]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < GRID and 0 <= y < GRID:
                img.putpixel((x, y), (*color, 255))


def ground(img, top):
    rect(img, 0, 0, GRID - 1, top - 1, "sky")
    for y in range(0, top, 4):
        rect(img, 0, y, GRID - 1, y, "sky_light")
    rect(img, 0, top, GRID - 1, top + 2, "grass")
    rect(img, 0, top + 1, GRID - 1, top + 1, "grass_dark")
    rect(img, 0, top + 3, GRID - 1, GRID - 1, "dirt")
    for x in range(1, GRID, 6):
        rect(img, x, top + 5, x + 1, top + 5, "dirt_dark")


def stair_sit():
    img = canvas()
    ground(img, 24)
    # Two-step oak stair seen from the side: the low tread in front, the high tread behind.
    rect(img, 6, 16, 25, 23, "oak")
    rect(img, 14, 8, 25, 15, "oak")
    rect(img, 6, 16, 25, 16, "oak_light")
    rect(img, 14, 8, 25, 8, "oak_light")
    rect(img, 6, 23, 25, 23, "oak_dark")
    rect(img, 25, 8, 25, 23, "oak_dark")
    rect(img, 14, 9, 14, 15, "oak_dark")
    # A blue cushion on the low tread: the seat.
    rect(img, 7, 14, 13, 15, "sky")
    rect(img, 7, 14, 13, 14, "sky_light")
    return img


def creeper_mod():
    # The supplied artwork, kept at its original size next to this script; only the resize is generated.
    return Image.open(SOURCES / "creeper_mod.webp").convert("RGBA")


for name, targets in ICONS.items():
    image = globals()[name]()
    # Pixel art is scaled with nearest neighbour so its edges stay crisp; artwork is resampled.
    resample = Image.NEAREST if image.width == GRID else Image.LANCZOS
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        image.resize((256, 256), resample).save(target)
        print(f"wrote {target}")
