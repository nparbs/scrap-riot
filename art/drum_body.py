# The drum spinner's barrel, without its teeth (the game still draws those). Writes public/models/drum-body.glb.
# It's modelled at WIDTH and the game stretches it across x to fit each chassis.
# Run from the repo root: blender --background --factory-startup --python art/drum_body.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import bolt, box, export, finish, lathe, reset  # noqa: E402

WIDTH = 1.26  # the brawler's drum; others are stretched from this
H = WIDTH / 2
SIDES = 24
reset()
parts = []
# The barrel, with a rolled steel rim at each end.
parts.append(lathe('core', 'dark', [(0.33, -H + 0.08), (0.33, H - 0.08)], SIDES, 0, 'x'))
for s in (-1, 1):
    prof = [(0.02, -H), (0.3, -H), (0.37, -H + 0.04), (0.37, -H + 0.1), (0.33, -H + 0.12)]
    if s > 0:
        prof = [(r, -h) for r, h in reversed(prof)]
    parts.append(lathe(f'rim{s}', 'steel', prof, SIDES, 0, 'x'))
    # A hub and a ring of bolts on each end.
    parts.append(lathe(f'hub{s}', 'steel', [(0.11, s * H - 0.01), (0.11, s * H + 0.025)], 16, 0, 'x'))
    for i in range(6):
        a = i * math.pi / 3
        parts.append(bolt(f'end{s}{i}', (s * (H + 0.008), 0.21 * math.cos(a), 0.21 * math.sin(a)), (s, 0, 0), 0.024, 0.02))
# Raised weld beads between the teeth.
for x in (-WIDTH * 0.15, WIDTH * 0.15):
    parts.append(lathe(f'bead{x}', 'steel', [(0.345, x - 0.016), (0.345, x + 0.016)], SIDES, 0, 'x'))
# A pocket under each tooth, matching the game's six teeth: one every 60°, staggered across in thirds.
for i in range(6):
    a = i / 6 * math.pi * 2
    pocket = box(f'pocket{i}', 'steel', (0.28, 0.08, 0.3), ((i % 3 - 1) * WIDTH * 0.3, 0.335, 0))
    pocket.rotation_euler = (a, 0, 0)
    parts.append(pocket)

export(finish('drum_body', parts, bevel=0.008), 'drum-body.glb')
