# The vertical spinner's bar, hub and hardened end blocks, all of which spin together.
# Writes public/models/vertbar-bar.glb.
# Run from the repo root: blender --background --factory-startup --python art/vertbar_bar.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
parts.append(prism('bar', 'steel', [(-0.17, -0.2), (-0.13, -0.7), (-0.22, -0.96), (0.2, -1.05), (0.17, -0.25), (0.17, 0.2), (0.13, 0.7), (0.22, 0.96), (-0.2, 1.05), (-0.17, 0.25)], 0.17, 'side'))
for end in (-1, 1):
    pts = [(-0.2, 0.78), (0.26, 0.82), (0.28, 0.98), (-0.24, 1.08)] if end > 0 else [(0.2, -0.78), (-0.26, -0.82), (-0.28, -0.98), (0.24, -1.08)]
    parts.append(prism(f'block{end}', 'blade', pts, 0.24, 'side'))
    for s in (-1, 1):
        parts.append(bolt(f'eb{end}{s}', (s * 0.12, end * 0.9, 0.0), (s, 0, 0), 0.03, 0.02))
    # Raised ribs running out to each end.
    parts.append(box(f'rib{end}', 'dark', (0.2, 0.42, 0.05), (0, end * 0.5, 0)))
parts.append(lathe('hub', 'dark', [(0.02, -0.15), (0.2, -0.15), (0.2, 0.15), (0.02, 0.15)], 20, 0, 'x'))
for s in (-1, 1):
    parts += bolt_ring(f'hb{s}', 5, 0.12, (s * 0.15, 0, 0), 'x', s, 0.022)
export(finish('vertbar_bar', parts), 'vertbar-bar.glb')
