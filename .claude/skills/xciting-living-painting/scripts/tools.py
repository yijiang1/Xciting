#!/usr/bin/env python3
"""Helpers for living-painting videos. Needs numpy, Pillow and ffmpeg on PATH (no ffprobe needed).

  tools.py cues VIDEO [--fps 10]                  when a karaoke highlight moves to a new line
  tools.py fog OUT.png                            horizontally tileable, streaky fog texture
  tools.py overlay PAINTING OUT.png [POINTS.json] crystal/sparkle overlay aligned to the painting's dark strokes
  tools.py grid PAINTING OUT.png                  coordinate grid for finding anchor points
  tools.py sheet VIDEO OUT.png CUE1,CUE2,...      two frames per page (1/4 and 3/4 through) as a contact sheet
  tools.py selftest
"""
import json, re, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def cues(video, fps=10, w=192, h=108):
    """Print each time the yellow highlight bar jumps to a different line. Adjust the colour test for other palettes."""
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', video, '-vf', f'fps={fps},scale={w}:{h}',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(int)
    yellow = (frames[..., 0] > 200) & (frames[..., 1] > 200) & (frames[..., 2] < 90)
    prev = None
    for i, m in enumerate(yellow):
        rows = np.where(m.sum(1) > 8)[0]
        key = (int(rows.min()), int(rows.max())) if len(rows) else None
        if key != prev:
            print(f'{i / fps:7.1f}s  highlight rows {key}')
        prev = key


def fog(out, W=2048, H=640, seed=11):
    """Anisotropic value noise (long in x, short in y), so it reads as mist streaks, not bokeh blobs."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((H, W))
    for gw, gh, amp in ((3, 5, 1.0), (6, 10, 0.5), (12, 20, 0.25), (24, 40, 0.12)):
        g = np.tile(rng.random((gh, gw)), (1, 3))  # wrap 3x so both edges match -> tileable
        big = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((W * 3, H), Image.BICUBIC), np.float32) / 255
        acc += amp * big[:, W:2 * W]
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    a = np.clip((acc - 0.3) / 0.6, 0, 1) ** 1.3 * np.sin(np.pi * np.linspace(0, 1, H))[:, None] ** 1.5
    Image.fromarray(np.dstack([np.full((H, W), 255)] * 3 + [a * 215]).astype(np.uint8)).save(out)
    return a


def overlay(painting, out, points_out=None, n=70, rgb=(250, 253, 255)):
    """White crystals only where the painting has strokes darker than their surroundings (leaves, stems, branches).
    Revealed through a growing mask, this turns the *same* painting frosty/snowy/dewy with perfect alignment,
    which image-edit APIs can't guarantee."""
    a = np.asarray(Image.open(painting).convert('RGB'), np.float32)
    lum = a.mean(2)
    bg = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(25)), np.float32)
    stroke = np.clip((bg - lum - 6) / 18, 0, 1)
    stroke = np.asarray(Image.fromarray((stroke * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    rng = np.random.default_rng(3)
    speck = np.asarray(Image.fromarray((rng.random(lum.shape) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    alpha = np.clip(stroke * (0.45 + 0.75 * np.clip((speck - 0.45) * 4, 0, 1)), 0, 1) * 235
    Image.fromarray(np.dstack([np.full(lum.shape, c) for c in rgb] + [alpha]).astype(np.uint8)).save(out)
    ys, xs = np.where(stroke > 0.8)
    pts = [[int(xs[i]), int(ys[i])] for i in rng.choice(len(xs), min(n, len(xs)), replace=False)] if len(xs) else []
    if points_out:
        json.dump(pts, open(points_out, 'w'))  # sparkle anchors for <Glint/>, in painting pixels
    return stroke, pts


def grid(painting, out, step=128):
    im = Image.open(painting).convert('RGB')
    d = ImageDraw.Draw(im)
    for x in range(0, im.width, step):
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 0), width=2)
        d.text((x + 4, 4), str(x), fill=(255, 0, 0))
    for y in range(0, im.height, step):
        d.line([(0, y), (im.width, y)], fill=(0, 0, 255), width=2)
        d.text((4, y + 4), str(y), fill=(0, 0, 255))
    im.save(out)


def duration(video):
    err = subprocess.run(['ffmpeg', '-i', video], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def sheet(video, cue_list, out, width=480, cols=4):
    """Fast per-page QA: seeks with -ss (select=eq(n,..) decodes the whole file and is slow)."""
    ends = cue_list[1:] + [duration(video)]
    tiles = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, (s, e) in enumerate(zip(cue_list, ends)):
            for q in (0.25, 0.75):
                f = f'{tmp}/{i:03d}_{q}.png'
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{s + (e - s) * q:.2f}', '-i', video,
                                '-frames:v', '1', '-vf', f'scale={width}:-2', f], check=True)
                tiles.append(Image.open(f).convert('RGB'))
        w, h = tiles[0].size
        S = Image.new('RGB', (w * cols, h * -(-len(tiles) // cols)), 'white')
        for k, t in enumerate(tiles):
            S.paste(t, ((k % cols) * w, (k // cols) * h))
        S.save(out)


def selftest():
    with tempfile.TemporaryDirectory() as tmp:
        a = fog(f'{tmp}/fog.png') * 255
        seam = np.abs(a[:, 0] - a[:, -1]).max()
        typical = np.abs(np.diff(a, axis=1)).max()
        assert seam <= typical * 1.5 + 1, f'fog texture does not tile: seam {seam:.1f} vs step {typical:.1f}'
        im = np.full((200, 300, 3), 220, np.uint8)
        for t in range(40, 260):
            im[max(0, t // 2 - 2):t // 2 + 2, t] = 60  # one dark diagonal stroke
        Image.fromarray(im).save(f'{tmp}/p.png')
        stroke, pts = overlay(f'{tmp}/p.png', f'{tmp}/o.png')
        assert stroke[75, 150] > 0.5 and stroke[180, 20] < 0.05, 'overlay mask misses the stroke (or marks empty paper)'
        assert all(abs(y - x // 2) <= 3 for x, y in pts), 'sparkle points off the stroke'
    print('selftest ok')


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'cues':
        cues(args[0], fps=int(args[args.index('--fps') + 1]) if '--fps' in args else 10)
    elif cmd == 'fog':
        fog(args[0])
    elif cmd == 'overlay':
        overlay(args[0], args[1], args[2] if len(args) > 2 else None)
    elif cmd == 'grid':
        grid(args[0], args[1])
    elif cmd == 'sheet':
        sheet(args[0], [float(x) for x in args[2].split(',')], args[1])
    elif cmd == 'selftest':
        selftest()
    else:
        sys.exit(__doc__)
