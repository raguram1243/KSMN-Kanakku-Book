"""Strip baked-in backgrounds from uploaded logo JPEGs and save
transparent, tightly-cropped PNGs into public/.

USAGE: drop a new logo export into public/ as ksmn-logo-icon.jpeg or
ksmn-logo-full.jpeg (JPEG = bg is baked in), run `python scripts/removebg.py`
(requires Pillow: pip install pillow), then point/keep the app files
public/ksmn-logo-icon.png and public/ksmn-logo-full.png at the outputs.

- ksmn-logo-icon.jpeg: near-white page background  -> flood-fill from borders
- ksmn-logo-full.jpeg: pure-black letterbox background -> flood-fill from borders

Flood-fill (not global chroma-key) so light-silver building parts / dark-blue
text inside the logo are never eaten. Halo pixels get feathered alpha.
"""
from PIL import Image
import os
from collections import deque

PUB = 'public'

def remove_bg(src, dst, bg, max_size, halo_px=3):
    im = Image.open(os.path.join(PUB, src)).convert('RGB')
    w, h = im.size
    px = im.load()

    # Sample the actual border colour (median of border pixels) so JPEG
    # checkerboard / off-white edges are matched, not just pure white/black.
    border = []
    for x in range(0, w, max(1, w // 400)):
        border.append(px[x, 0]); border.append(px[x, h - 1])
    for y in range(0, h, max(1, h // 400)):
        border.append(px[0, y]); border.append(px[w - 1, y])
    border.sort()
    br, bgc, bb = border[len(border) // 2]

    def dist2(r, g, b):
        return (r - br) ** 2 + (g - bgc) ** 2 + (b - bb) ** 2

    # Thresholds on distance from the sampled border colour.
    # hard: definitely background (floods from borders only).
    # soft: halo fringe near the artwork edge -> feathered alpha.
    # NOTE: the icon JPEG has a dotted-paper texture baked in, so HARD is
    # deliberately aggressive for white (dots included). Flood-fill containment
    # (border-connected only) is what protects the similar light-gray/silver
    # parts INSIDE the logo from being eaten.
    HARD_D2 = (52 if bg == 'white' else 34) ** 2
    SOFT_D2 = (86 if bg == 'white' else 70) ** 2

    def is_hard(r, g, b):
        return dist2(r, g, b) < HARD_D2

    def is_soft(r, g, b):
        d2 = dist2(r, g, b)
        if d2 >= SOFT_D2:
            return False
        # halo fringe is low saturation; colourful logo pixels stay opaque
        mx, mn = max(r, g, b), min(r, g, b)
        return (mx - mn) < 60

    hard = bytearray(w * h)  # definite background, connected to border
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_hard(*px[x, y]) and not hard[y * w + x]:
                hard[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_hard(*px[x, y]) and not hard[y * w + x]:
                hard[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not hard[i] and is_hard(*px[nx, ny]):
                    hard[i] = 1; q.append((nx, ny))

    import math
    hard_d = math.sqrt(HARD_D2); soft_d = math.sqrt(SOFT_D2)
    alpha = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if hard[i]:
                alpha[i] = 0
                continue
            r, g, b = px[x, y]
            # near-edge halo? check neighbourhood for hard bg
            near = False
            for dy in range(-halo_px, halo_px + 1):
                for dx in range(-halo_px, halo_px + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and hard[ny * w + nx]:
                        near = True; break
                if near: break
            if near and is_soft(r, g, b):
                # feather: closer to border colour -> more transparent
                d = min(soft_d, max(hard_d, math.sqrt(dist2(r, g, b))))
                alpha[i] = int(255 * (d - hard_d) / (soft_d - hard_d))
            else:
                alpha[i] = 255

    # Fill enclosed background pockets: bg-coloured pixels NOT connected to
    # the border (e.g. the small white hole inside the icon, the thin white
    # strip trapped under the full logo) can never be real background, so
    # repaint them with the nearest non-pocket colour instead of leaving
    # white holes/lines in the transparent result.
    pocket = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not hard[i] and is_soft(*px[x, y]):
                pocket[i] = 1
    # drop pocket pixels connected to the actual background edge (real halo)
    q = deque()
    for x in range(w):
        for y in range(h):
            i = y * w + x
            if pocket[i] and alpha[i] < 255:
                # adjacent to a hard-bg pixel -> genuine edge feathering
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and hard[ny * w + nx]:
                            q.append((x, y)); break
                    else:
                        continue
                    break
    seen = bytearray(w * h)
    edge_pocket = bytearray(w * h)
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i] or not pocket[i]:
            continue
        seen[i] = 1; edge_pocket[i] = 1
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and pocket[ny * w + nx] and not seen[ny * w + nx]:
                q.append((nx, ny))
    # interior pockets = pocket minus edge-connected -> repaint + opaque
    rgb = list(im.getdata())
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if pocket[i] and not edge_pocket[i]:
                # nearest non-pocket colour in a small window
                best = None; best_d = None
                for r_ in range(1, 12):
                    for dy in range(-r_, r_ + 1):
                        for dx in range(-r_, r_ + 1):
                            if max(abs(dx), abs(dy)) != r_:
                                continue
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h:
                                j = ny * w + nx
                                if not pocket[j] and not hard[j]:
                                    dd = dx * dx + dy * dy
                                    if best_d is None or dd < best_d:
                                        best_d = dd; best = rgb[j]
                    if best is not None:
                        break
                if best is not None:
                    rgb[i] = best
                alpha[i] = 255
    im = Image.new('RGB', (w, h)); im.putdata(rgb); px = im.load()

    # Despeckle: JPEG noise leaves isolated halo dots far from the artwork.
    # Any non-opaque pixel NOT within R px of a truly-opaque pixel is far
    # from the logo -> force fully transparent. Edge feathering (adjacent
    # to opaque art) is preserved.
    R = 5
    opaque = bytearray(w * h)
    for i in range(w * h):
        if alpha[i] > 200:
            opaque[i] = 1
    # cheap dilation via downsampled grid
    import math as _m
    cw, ch = _m.ceil(w / 2), _m.ceil(h / 2)
    coarse = bytearray(cw * ch)
    for y in range(h):
        for x in range(w):
            if opaque[y * w + x]:
                coarse[(y // 2) * cw + (x // 2)] = 1
    cr = _m.ceil(R / 2)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if alpha[i] > 200 or alpha[i] == 0:
                continue
            cx, cy = x // 2, y // 2
            found = False
            for dy in range(-cr, cr + 1):
                for dx in range(-cr, cr + 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < cw and 0 <= ny < ch and coarse[ny * cw + nx]:
                        found = True; break
                if found: break
            if not found:
                alpha[i] = 0

    a_img = Image.frombytes('L', (w, h), bytes(alpha))
    rgba = im.convert('RGBA')
    rgba.putalpha(a_img)

    # tight autocrop to content + small padding
    bbox = a_img.getbbox()
    if bbox:
        pad = 8
        l = max(0, bbox[0] - pad); u = max(0, bbox[1] - pad)
        r = min(w, bbox[2] + pad); d = min(h, bbox[3] + pad)
        rgba = rgba.crop((l, u, r, d))

    rgba.thumbnail((max_size[0], max_size[1]), Image.LANCZOS)
    rgba.save(os.path.join(PUB, dst), optimize=True)
    # report opaque ratio
    hist = a_img.histogram()
    print(f'{dst}: size={rgba.size} opaque~{sum(hist[128:]) / (w*h):.1%}')

remove_bg('ksmn-logo-icon.jpeg', 'ksmn-logo-icon.png', 'white', (512, 512))
remove_bg('ksmn-logo-full.jpeg', 'ksmn-logo-full.png', 'black', (800, 800))

# favicon set from the transparent icon (properly sized, not full-size)
icon = Image.open(os.path.join(PUB, 'ksmn-logo-icon.png'))
fav = icon.copy(); fav.thumbnail((32, 32), Image.LANCZOS)
fav.save(os.path.join(PUB, 'favicon-32x32.png'), optimize=True)
big = icon.copy(); big.thumbnail((180, 180), Image.LANCZOS)
# apple-touch-icon needs no transparency (iOS fills black) -> flatten on white
flat = Image.new('RGB', big.size, (255, 255, 255))
flat.paste(big, mask=big.split()[3])
flat.save(os.path.join(PUB, 'apple-touch-icon.png'), optimize=True)
print('favicon files written')
for f in ['ksmn-logo-icon.png','ksmn-logo-full.png','favicon-32x32.png','apple-touch-icon.png']:
    print(f, os.path.getsize(os.path.join(PUB, f)), 'bytes')
