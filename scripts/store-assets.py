#!/usr/bin/env python3
"""Draws the Microsoft Store (MSIX) logos from the app icon's SVG source.

    pip install cairosvg pillow
    python scripts/store-assets.py

Writes src-tauri/store/Assets/*.png. The PNGs are committed, so the Store
build does not need Python; run this again only when the icon changes.

Names follow MSIX resource qualifiers (scale-NNN, targetsize-NN,
altform-unplated), which the Store workflow indexes into resources.pri with
MakePri: https://learn.microsoft.com/windows/apps/design/style/iconography/app-icon-construction
"""

import io
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src-tauri" / "icons" / "source"
OUT = ROOT / "src-tauri" / "store" / "Assets"

SCALES = (100, 125, 150, 200, 400)
TARGET_SIZES = (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256)


def render(size: int) -> Image.Image:
    # The thinner-edged small variant reads better at icon sizes.
    svg = SOURCE / ("glint-small.svg" if size <= 48 else "glint.svg")
    big = max(size * 4, 512)
    png = cairosvg.svg2png(url=str(svg), output_width=big, output_height=big)
    return Image.open(io.BytesIO(png)).convert("RGBA").resize((size, size), Image.LANCZOS)


def tile(width: int, height: int, fill: float) -> Image.Image:
    """The icon centred on a transparent tile, `fill` of its shorter side."""
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    side = round(min(width, height) * fill)
    canvas.alpha_composite(render(side), ((width - side) // 2, (height - side) // 2))
    return canvas


def save(image: Image.Image, name: str) -> None:
    image.save(OUT / name, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    for scale in SCALES:
        k = scale / 100
        save(tile(round(50 * k), round(50 * k), 1.0), f"StoreLogo.scale-{scale}.png")
        save(tile(round(44 * k), round(44 * k), 1.0), f"Square44x44Logo.scale-{scale}.png")
        save(tile(round(71 * k), round(71 * k), 0.66), f"Square71x71Logo.scale-{scale}.png")
        save(tile(round(150 * k), round(150 * k), 0.6), f"Square150x150Logo.scale-{scale}.png")
        save(tile(round(310 * k), round(310 * k), 0.6), f"Square310x310Logo.scale-{scale}.png")
        save(tile(round(310 * k), round(150 * k), 0.6), f"Wide310x150Logo.scale-{scale}.png")
    for size in TARGET_SIZES:
        icon = tile(size, size, 1.0)
        save(icon, f"Square44x44Logo.targetsize-{size}.png")
        # Taskbar, Start list and Alt+Tab draw these without a coloured plate.
        save(icon, f"Square44x44Logo.targetsize-{size}_altform-unplated.png")
        save(icon, f"Square44x44Logo.targetsize-{size}_altform-lightunplated.png")
    print(f"Wrote {len(list(OUT.glob('*.png')))} images to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
