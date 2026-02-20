#!/bin/bash
set -e
ASSETS="$(cd "$(dirname "$0")/../assets" && pwd)"
INPUT="$ASSETS/icon.png"

if [ ! -f "$INPUT" ]; then
  python3 -c "
from PIL import Image, ImageDraw
img = Image.new('RGBA', (1024,1024), (0,0,0,0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([60,60,964,964], radius=200, fill=(30,30,30,255))
d.rounded_rectangle([180,300,844,780], radius=30, fill=(10,132,255,255))
d.ellipse([380,400,644,664], fill=(255,255,255,200))
d.polygon([(512,180),(580,300),(444,300)], fill=(10,132,255,255))
img.save('$INPUT')
" 2>/dev/null || echo "Add assets/icon.png manually"
fi

ICONSET="$ASSETS/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 64 128 256 512 1024; do
  sips -z $size $size "$INPUT" --out "$ICONSET/icon_${size}x${size}.png" 2>/dev/null || true
done
cp "$ICONSET/icon_32x32.png" "$ICONSET/icon_16x16@2x.png" 2>/dev/null || true
cp "$ICONSET/icon_64x64.png" "$ICONSET/icon_32x32@2x.png" 2>/dev/null || true
cp "$ICONSET/icon_256x256.png" "$ICONSET/icon_128x128@2x.png" 2>/dev/null || true
cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_256x256@2x.png" 2>/dev/null || true
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png" 2>/dev/null || true
iconutil -c icns "$ICONSET" -o "$ASSETS/icon.icns" 2>/dev/null || true
rm -rf "$ICONSET"
sips -z 36 36 "$INPUT" --out "$ASSETS/tray-icon.png" 2>/dev/null || true
echo "Icons generated"
