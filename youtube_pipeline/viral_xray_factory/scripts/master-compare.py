#!/usr/bin/env python3
"""Masters a size-comparison render for Shorts.

The music is one long crescendo: left alone, the opening sits ~7 dB under the
average and the finale ~4 dB over it. A smooth gain curve steers the mix's
short-term loudness onto a gentler ramp (RAMP_START -> RAMP_END) that keeps
the build; then one gain brings the whole to -14 LUFS and a limiter keeps
peaks under -1.5 dBTP.

Usage: scripts/master-compare.py <premaster.mp4> <final.mp4>
"""

import re
import subprocess
import sys
import tempfile

RAMP_START, RAMP_END = (3.0, -17.5), (55.0, -13.0)  # (seconds, LUFS) before the final -14 gain
MAX_GAIN_DB = 8.0


def ebur128(path, extra=''):
    return subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', f'ebur128{extra}', '-f', 'null', '-'],
                          capture_output=True, text=True).stderr


def short_term(path):
    """Short-term loudness (LUFS), one value per 0.1 s."""
    log = ebur128(path, '=metadata=1,ametadata=print:key=lavfi.r128.S')
    return [float(v) for v in re.findall(r'lavfi\.r128\.S=(-?(?:[\d.]+|inf))', log)]


def integrated(path):
    return float(re.search(r'Integrated loudness:\s+I:\s+(-?[\d.]+)', ebur128(path)).group(1))


def gain_curve(loudness, duration):
    """Piecewise-linear gain (dB) knots every 5 s, from 5 s-smoothed loudness."""
    (t0, l0), (t1, l1) = RAMP_START, RAMP_END
    last = min(62.0, duration - 4)  # don't chase the final fade-out
    knots = []
    for t in [t0] + [float(t) for t in range(5, int(last) + 1, 5)] + [last]:
        window = [v for v in loudness[max(0, int((t - 2.5) * 10)):int((t + 2.5) * 10)] if v > -70]
        smoothed = sum(window) / len(window)
        target = l0 + (l1 - l0) * min(1.0, (t - t0) / (t1 - t0))
        knots.append((t, max(-MAX_GAIN_DB, min(MAX_GAIN_DB, target - smoothed))))
    return knots


def volume_expr(knots):
    """ffmpeg expression: hold the first/last gain, interpolate between knots."""
    expr = f'{knots[-1][1]:.2f}'
    for (ta, ga), (tb, gb) in reversed(list(zip(knots, knots[1:]))):
        expr = f'if(lt(t,{tb}),{ga:.2f}+({gb - ga:.2f})*(t-{ta})/{tb - ta},{expr})'
    return f"volume='pow(10,(if(lt(t,{knots[0][0]}),{knots[0][1]:.2f},{expr}))/20)':eval=frame"


def main(src, dst):
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', subprocess.run(
        ['ffmpeg', '-i', src], capture_output=True, text=True).stderr).groups()
    duration = int(h) * 3600 + int(m) * 60 + float(s)
    knots = gain_curve(short_term(src), duration)
    print('gain curve:', ', '.join(f'{t:.0f}s {g:+.1f}' for t, g in knots))
    with tempfile.NamedTemporaryFile(suffix='.wav') as levelled:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vn', '-af', volume_expr(knots),
                        '-c:a', 'pcm_f32le', levelled.name], check=True)
        gain = -14 - integrated(levelled.name)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-i', levelled.name, '-map', '0:v', '-map', '1:a',
                        '-c:v', 'copy', '-af', f'aresample=192000,volume={gain:.2f}dB,alimiter=limit=0.79:level=false,aresample=48000',
                        '-c:a', 'aac', '-b:a', '192k', dst], check=True)
    summary = ebur128(dst, '=peak=true').split('Summary')[-1]
    final_i = re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1)
    peak = re.search(r'Peak:\s+(-?[\d.]+)', summary).group(1)
    print(f'final {final_i} LUFS, true peak {peak} dBFS')


if __name__ == '__main__':
    main(*sys.argv[1:3])
