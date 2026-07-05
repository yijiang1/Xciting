#!/usr/bin/env python3
"""
Generate a short YouTube test video for the Exciting channel.

Outputs:
- output/bragg_law_test.mp4
- output/bragg_law_test.srt
- output/metadata.md
"""

from __future__ import annotations

import math
import os
import subprocess
import textwrap
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
FRAMES = OUT / "frames"
AUDIO = OUT / "audio"
WIDTH, HEIGHT = 1920, 1080
FPS = 15
VOICE = "Samantha"
RATE = "185"
MPLCONFIG = "/tmp/matplotlib"


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str
    scene: str


SEGMENTS: list[Segment] = [
    Segment(
        0.0,
        5.3,
        "X-rays are tiny waves with excellent taste in crystals.",
        "intro",
    ),
    Segment(
        5.3,
        11.0,
        "Send them into a crystal, and layers of atoms act like a microscopic mirror maze.",
        "lattice",
    ),
    Segment(
        11.0,
        18.2,
        "Two beams can bounce from neighboring planes. The lower one travels a little extra distance.",
        "paths",
    ),
    Segment(
        18.2,
        25.2,
        "That extra distance is two d sine theta: down once, up once.",
        "pathdiff",
    ),
    Segment(
        25.2,
        33.1,
        "If the extra distance equals a whole number of wavelengths, the waves arrive in sync.",
        "constructive",
    ),
    Segment(
        33.1,
        41.2,
        "So Bragg's law is n lambda equals two d sine theta.",
        "equation",
    ),
    Segment(
        41.2,
        49.0,
        "Change the angle, and the detector sees bright peaks only when the crystal says: yes, that one.",
        "detector",
    ),
    Segment(
        49.0,
        55.0,
        "That is how X-rays turn atomic spacing into a measurable diffraction pattern.",
        "outro",
    ),
]


TITLE = "Bragg's Law in 55 Seconds"
DESCRIPTION = """\
Test upload for Exciting, a scientist-run channel about funny and educational X-ray theory animations.

Topic: X-ray Bragg's law
Formula: n lambda = 2 d sin(theta)

This is a short pipeline test with generated animation, voiceover, and burned-in subtitles.
"""


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print(" ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def ensure_dirs() -> None:
    for path in (OUT, FRAMES, AUDIO):
        path.mkdir(parents=True, exist_ok=True)
    for frame in FRAMES.glob("*.png"):
        frame.unlink()


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_TITLE = font(78, bold=True)
FONT_BIG = font(66, bold=True)
FONT_BODY = font(42)
FONT_CAPTION = font(48, bold=True)
FONT_SMALL = font(30)
FONT_MONO = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", size=54)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = (238, 247, 255),
    max_width: int = 1580,
    line_gap: int = 12,
) -> int:
    lines = wrap_text(draw, text, fnt, max_width)
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=fnt)
        x = (WIDTH - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=fnt, fill=fill)
        y += bbox[3] - bbox[1] + line_gap
    return y


def progress(segment: Segment, t: float) -> float:
    if segment.end <= segment.start:
        return 1.0
    return max(0.0, min(1.0, (t - segment.start) / (segment.end - segment.start)))


def smoothstep(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def base_frame(t: float) -> Image.Image:
    y = np.linspace(0, 1, HEIGHT)[:, None]
    x = np.linspace(0, 1, WIDTH)[None, :]
    bg = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    bg[:, :, 0] = (9 + 18 * y + 4 * np.sin(5 * x + 0.15 * t)).astype(np.uint8)
    bg[:, :, 1] = (22 + 24 * y + 5 * np.sin(4 * y + 0.3 * t)).astype(np.uint8)
    bg[:, :, 2] = (35 + 42 * y + 9 * np.sin(6 * (x + y) + 0.2 * t)).astype(np.uint8)
    img = Image.fromarray(bg, "RGB")
    draw = ImageDraw.Draw(img, "RGBA")
    for i in range(120):
        px = int((i * 379 + 90 * math.sin(t * 0.4 + i)) % WIDTH)
        py = int((i * 167 + 70 * math.cos(t * 0.25 + i * 0.7)) % HEIGHT)
        alpha = 25 + int(18 * math.sin(t + i))
        draw.ellipse((px - 1, py - 1, px + 1, py + 1), fill=(155, 220, 255, alpha))
    return img


def draw_brand(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((56, 46, 232, 104), radius=12, fill=(11, 35, 52, 190), outline=(91, 215, 255, 150), width=2)
    draw.text((78, 60), "Exciting", font=FONT_SMALL, fill=(231, 250, 255))


def draw_lattice(draw: ImageDraw.ImageDraw, t: float, *, alpha: int = 255, show_labels: bool = True) -> None:
    plane_color = (100, 205, 244, int(130 * alpha / 255))
    atom_fill = (255, 190, 86, alpha)
    atom_edge = (255, 238, 190, alpha)
    start_x, end_x = 430, 1460
    plane_y = [405, 550, 695]
    for idx, py in enumerate(plane_y):
        draw.line((start_x, py, end_x, py), fill=plane_color, width=5)
        for j in range(8):
            x = start_x + j * 140 + (idx % 2) * 70
            bob = 3 * math.sin(t * 2 + j + idx)
            r = 19
            draw.ellipse((x - r, py + bob - r, x + r, py + bob + r), fill=atom_fill, outline=atom_edge, width=3)
    if show_labels:
        draw.line((1505, plane_y[0], 1505, plane_y[1]), fill=(239, 247, 255, alpha), width=4)
        draw.line((1488, plane_y[0], 1522, plane_y[0]), fill=(239, 247, 255, alpha), width=4)
        draw.line((1488, plane_y[1], 1522, plane_y[1]), fill=(239, 247, 255, alpha), width=4)
        draw.text((1530, (plane_y[0] + plane_y[1]) // 2 - 26), "d", font=FONT_MONO, fill=(239, 247, 255, alpha))


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    fill: tuple[int, int, int, int],
    width: int = 10,
    head: int = 28,
) -> None:
    draw.line((*start, *end), fill=fill, width=width)
    dx, dy = end[0] - start[0], end[1] - start[1]
    angle = math.atan2(dy, dx)
    for sign in (-1, 1):
        a = angle + sign * 2.55
        p = (end[0] + head * math.cos(a), end[1] + head * math.sin(a))
        draw.line((*end, *p), fill=fill, width=width)


def draw_wave(draw: ImageDraw.ImageDraw, t: float, *, y: int, x0: int, x1: int, color: tuple[int, int, int, int], amp: int = 24) -> None:
    pts = []
    for x in range(x0, x1, 8):
        phase = (x - x0) * 0.045 - t * 6
        pts.append((x, y + amp * math.sin(phase)))
    draw.line(pts, fill=color, width=6)


def draw_path_diagram(draw: ImageDraw.ImageDraw, t: float, *, phase_shift: float = 0.0) -> None:
    draw_lattice(draw, t)
    top_hit = (845, 405)
    low_hit = (930, 550)
    theta = math.radians(26)
    in_vec = (-math.cos(theta), -math.sin(theta))
    out_vec = (math.cos(theta), -math.sin(theta))
    for hit, color, offset in [(top_hit, (111, 238, 255, 240), 0.0), (low_hit, (255, 125, 97, 240), phase_shift)]:
        start = (hit[0] - 430 * math.cos(theta), hit[1] - 210 * math.sin(theta))
        end = (hit[0] + 455 * math.cos(theta), hit[1] - 225 * math.sin(theta))
        draw_arrow(draw, start, hit, color, width=9)
        draw_arrow(draw, hit, end, color, width=9)
        for k in range(12):
            frac = ((t * 0.8 + k / 12 + offset) % 1.0)
            if frac < 0.5:
                p = (
                    start[0] + (hit[0] - start[0]) * frac * 2,
                    start[1] + (hit[1] - start[1]) * frac * 2,
                )
            else:
                frac2 = (frac - 0.5) * 2
                p = (
                    hit[0] + (end[0] - hit[0]) * frac2,
                    hit[1] + (end[1] - hit[1]) * frac2,
                )
            draw.ellipse((p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6), fill=color)
    draw.arc((675, 320, 1015, 660), start=180, end=205, fill=(238, 247, 255, 220), width=4)
    draw.text((660, 330), "theta", font=FONT_SMALL, fill=(238, 247, 255, 230))


def draw_formula_panel(draw: ImageDraw.ImageDraw, formula: str, subtitle: str = "") -> None:
    draw.rounded_rectangle((310, 180, 1610, 860), radius=22, fill=(8, 23, 34, 215), outline=(105, 220, 255, 160), width=3)
    bbox = draw.textbbox((0, 0), formula, font=FONT_MONO)
    draw.text(((WIDTH - (bbox[2] - bbox[0])) // 2, 350), formula, font=FONT_MONO, fill=(255, 247, 196))
    if subtitle:
        draw_centered(draw, subtitle, 505, FONT_BODY, fill=(222, 243, 255), max_width=980)


def draw_detector(draw: ImageDraw.ImageDraw, t: float) -> None:
    draw_lattice(draw, t, show_labels=False)
    center = (1060, 435)
    radius = 305
    draw.arc((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), start=-36, end=42, fill=(216, 235, 244, 140), width=8)
    for i, ang in enumerate(np.linspace(-30, 36, 12)):
        rad = math.radians(ang)
        x = center[0] + radius * math.cos(rad)
        y = center[1] + radius * math.sin(rad)
        bright = math.exp(-((ang - 17) / 7.0) ** 2) + 0.55 * math.exp(-((ang + 17) / 5.5) ** 2)
        r = 7 + int(28 * bright * (0.75 + 0.25 * math.sin(t * 7 + i)))
        col = (255, int(130 + 100 * bright), int(85 + 140 * bright), 235)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=col)
    draw.text((1260, 180), "detector", font=FONT_BODY, fill=(238, 247, 255, 230))
    draw.text((1190, 740), "bright peaks only at the right angles", font=FONT_SMALL, fill=(238, 247, 255, 220))


def draw_caption(draw: ImageDraw.ImageDraw, text: str) -> None:
    lines = wrap_text(draw, text, FONT_CAPTION, 1540)
    line_h = 58
    box_h = line_h * len(lines) + 36
    y0 = HEIGHT - box_h - 48
    draw.rounded_rectangle((160, y0, WIDTH - 160, HEIGHT - 44), radius=18, fill=(0, 0, 0, 165))
    y = y0 + 18
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=FONT_CAPTION)
        x = (WIDTH - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=FONT_CAPTION, fill=(255, 255, 255, 245))
        y += line_h


def frame_for(t: float) -> Image.Image:
    segment = next((s for s in SEGMENTS if s.start <= t < s.end), SEGMENTS[-1])
    p = smoothstep(progress(segment, t))
    img = base_frame(t)
    img = img.filter(ImageFilter.GaussianBlur(radius=0.15))
    draw = ImageDraw.Draw(img, "RGBA")
    draw_brand(draw)

    if segment.scene == "intro":
        draw_centered(draw, "Bragg's Law", 260, FONT_TITLE, fill=(255, 247, 196))
        draw_centered(draw, "why crystals flash bright X-ray peaks", 365, FONT_BODY, fill=(219, 241, 255))
        draw_wave(draw, t, y=570, x0=430, x1=1490, color=(105, 230, 255, 220), amp=32)
        draw.text((760, 675), "n lambda = 2 d sin(theta)", font=FONT_MONO, fill=(255, 183, 96, 235))
    elif segment.scene == "lattice":
        draw_lattice(draw, t)
        draw_wave(draw, t, y=220 + int(30 * math.sin(p * math.pi)), x0=250, x1=820, color=(111, 238, 255, 220))
        draw_centered(draw, "crystal planes behave like tiny mirrors", 160, FONT_BIG, fill=(255, 247, 196))
    elif segment.scene == "paths":
        draw_path_diagram(draw, t, phase_shift=0.2)
        draw_centered(draw, "two reflected beams", 145, FONT_BIG, fill=(255, 247, 196))
        draw.text((1110, 535), "extra path", font=FONT_BODY, fill=(255, 150, 105, 245))
    elif segment.scene == "pathdiff":
        draw_path_diagram(draw, t, phase_shift=0.35)
        draw.line((884, 405, 930, 550), fill=(255, 247, 196, 245), width=6)
        draw.line((930, 550, 975, 405), fill=(255, 247, 196, 245), width=6)
        draw.text((1022, 455), "d sin(theta)", font=FONT_SMALL, fill=(255, 247, 196, 245))
        draw.text((760, 740), "path difference = 2 d sin(theta)", font=FONT_MONO, fill=(255, 247, 196, 245))
    elif segment.scene == "constructive":
        draw_path_diagram(draw, t, phase_shift=0.0)
        draw_centered(draw, "whole wavelength steps add up", 132, FONT_BIG, fill=(255, 247, 196))
        for x in range(1210, 1580, 48):
            amp = 30 + 8 * math.sin(t * 5 + x)
            draw.ellipse((x - amp, 235 - amp, x + amp, 235 + amp), outline=(255, 247, 196, 130), width=4)
        draw.text((1215, 300), "constructive interference", font=FONT_BODY, fill=(238, 247, 255, 230))
    elif segment.scene == "equation":
        draw_formula_panel(draw, "n lambda = 2 d sin(theta)", "Bragg's law: the peak condition for crystal diffraction.")
        draw.text((520, 650), "n = 1, 2, 3, ...", font=FONT_BODY, fill=(238, 247, 255, 230))
        draw.text((900, 650), "lambda = X-ray wavelength", font=FONT_BODY, fill=(238, 247, 255, 230))
        draw.text((520, 720), "d = plane spacing", font=FONT_BODY, fill=(238, 247, 255, 230))
        draw.text((900, 720), "theta = Bragg angle", font=FONT_BODY, fill=(238, 247, 255, 230))
    elif segment.scene == "detector":
        draw_detector(draw, t)
        draw_centered(draw, "angle scan -> diffraction peaks", 120, FONT_BIG, fill=(255, 247, 196))
    elif segment.scene == "outro":
        draw_formula_panel(draw, "spacing in, peaks out", "X-rays let us measure the hidden geometry of atoms.")
        draw_centered(draw, "Exciting", 760, FONT_TITLE, fill=(111, 238, 255), max_width=1200)

    draw_caption(draw, segment.text)
    return img


def write_script_files() -> None:
    script_md = OUT / "script_and_storyboard.md"
    with script_md.open("w", encoding="utf-8") as handle:
        handle.write(f"# {TITLE}\n\n")
        handle.write("## Voiceover and Storyboard\n\n")
        for i, segment in enumerate(SEGMENTS, start=1):
            handle.write(f"{i}. `{segment.start:04.1f}-{segment.end:04.1f}s` **{segment.scene}**: {segment.text}\n")
    with (OUT / "metadata.md").open("w", encoding="utf-8") as handle:
        handle.write(f"# YouTube Metadata\n\nTitle: {TITLE}\n\nDescription:\n{DESCRIPTION}\n")


def write_srt() -> Path:
    path = OUT / "bragg_law_test.srt"
    with path.open("w", encoding="utf-8") as handle:
        for i, segment in enumerate(SEGMENTS, start=1):
            handle.write(f"{i}\n")
            handle.write(f"{srt_time(segment.start)} --> {srt_time(segment.end)}\n")
            handle.write(f"{segment.text}\n\n")
    return path


def srt_time(seconds: float) -> str:
    millis = int(round(seconds * 1000))
    ms = millis % 1000
    total = millis // 1000
    sec = total % 60
    minutes = (total // 60) % 60
    hours = total // 3600
    return f"{hours:02d}:{minutes:02d}:{sec:02d},{ms:03d}"


def generate_voiceover() -> Path:
    txt = AUDIO / "voiceover.txt"
    wav = AUDIO / "voiceover.wav"
    narration = " ".join(s.text for s in SEGMENTS)
    txt.write_text(narration, encoding="utf-8")

    pieces: list[Path] = []
    for idx, segment in enumerate(SEGMENTS, start=1):
        piece_txt = AUDIO / f"segment_{idx:02d}.txt"
        piece_aiff = AUDIO / f"segment_{idx:02d}.aiff"
        piece_wav = AUDIO / f"segment_{idx:02d}.wav"
        piece_txt.write_text(segment.text, encoding="utf-8")
        run(["say", "-v", VOICE, "-r", RATE, "-f", str(piece_txt), "-o", str(piece_aiff)])
        run(["ffmpeg", "-y", "-i", str(piece_aiff), "-ar", "48000", "-ac", "2", str(piece_wav)])
        pieces.append(piece_wav)

    sample_rate = 48000
    channels = 2
    total_samples = int(math.ceil(SEGMENTS[-1].end * sample_rate))
    timeline = np.zeros((total_samples, channels), dtype=np.float32)

    for segment, piece in zip(SEGMENTS, pieces):
        with wave.open(str(piece), "rb") as handle:
            frames = handle.readframes(handle.getnframes())
            data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
            data = data.reshape((-1, handle.getnchannels()))
            if handle.getnchannels() == 1:
                data = np.repeat(data, 2, axis=1)
        start = int(segment.start * sample_rate)
        max_len = int((segment.end - segment.start - 0.25) * sample_rate)
        data = data[:max_len]
        end = min(total_samples, start + len(data))
        timeline[start:end, :] += data[: end - start, :2]

    timeline = np.clip(timeline, -0.98, 0.98)
    pcm = (timeline * 32767.0).astype(np.int16)
    with wave.open(str(wav), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return wav


def audio_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / float(handle.getframerate())


def generate_frames(total_duration: float) -> None:
    total_frames = int(math.ceil(total_duration * FPS))
    for idx in range(total_frames):
        t = idx / FPS
        img = frame_for(min(t, SEGMENTS[-1].end - 0.01))
        img.save(FRAMES / f"frame_{idx:05d}.png", optimize=False)
        if idx % 150 == 0:
            print(f"Rendered frame {idx}/{total_frames}")


def generate_music(duration: float) -> Path:
    path = AUDIO / "background.wav"
    run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=174:duration={duration}:sample_rate=48000",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=261.63:duration={duration}:sample_rate=48000",
            "-filter_complex",
            "[0:a]volume=0.018[a0];[1:a]volume=0.012[a1];[a0][a1]amix=inputs=2",
            str(path),
        ]
    )
    return path


def compose_video(voiceover: Path, music: Path, duration: float) -> Path:
    mp4 = OUT / "bragg_law_test.mp4"
    run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            str(FRAMES / "frame_%05d.png"),
            "-i",
            str(voiceover),
            "-i",
            str(music),
            "-filter_complex",
            "[1:a]volume=1.0[a1];[2:a]volume=0.55[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=0[a]",
            "-map",
            "0:v",
            "-map",
            "[a]",
            "-t",
            f"{duration:.3f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(mp4),
        ]
    )
    return mp4


def write_upload_metadata() -> None:
    tags = ["x-ray", "xrd", "Bragg law", "diffraction", "crystallography", "science animation", "physics"]
    upload = textwrap.dedent(
        f"""\
        Title:
        {TITLE}

        Description:
        {DESCRIPTION}

        Tags:
        {", ".join(tags)}

        Suggested visibility for this test:
        Unlisted

        Audience:
        No, it is not made for kids.
        """
    )
    (OUT / "upload_metadata.txt").write_text(upload, encoding="utf-8")


def main() -> None:
    os.environ.setdefault("MPLCONFIGDIR", MPLCONFIG)
    ensure_dirs()
    write_script_files()
    write_srt()
    voiceover = generate_voiceover()
    voice_duration = audio_duration(voiceover)
    duration = max(SEGMENTS[-1].end, voice_duration + 1.0)
    music = generate_music(duration)
    generate_frames(duration)
    mp4 = compose_video(voiceover, music, duration)
    write_upload_metadata()
    print(f"Created {mp4}")
    print(f"Duration: {duration:.2f}s")


if __name__ == "__main__":
    main()
