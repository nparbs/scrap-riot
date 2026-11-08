# The horizontal spinner's bar, hub and hardened end blocks, all of which spin together.
# Writes public/models/horizbar-bar.glb.
# Run from the repo root: blender --background --factory-startup --python art/horizbar_bar.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
parts.append(prism('bar', 'steel', [(-1.5, -0.22), (-0.4, -0.15), (0.4, -0.2), (1.5, -0.06), (1.5, 0.22), (0.4, 0.15), (-0.4, 0.2), (-1.5, 0.06)], 0.11, 'top'))
for end in (-1, 1):
    pts = [(1.08, -0.1), (1.52, -0.08), (1.56, 0.28), (1.1, 0.22)] if end > 0 else [(-1.08, 0.1), (-1.52, 0.08), (-1.56, -0.28), (-1.1, -0.22)]
    parts.append(prism(f'block{end}', 'blade', pts, 0.17, 'top'))
    for x in (1.2, 1.4):
        parts.append(bolt(f'eb{end}{x}', (end * x, 0.085, end * 0.07), (0, 1, 0), 0.028, 0.02))
    parts.append(box(f'rib{end}', 'dark', (0.6, 0.04, 0.1), (end * 0.62, 0.07, 0)))
parts.append(lathe('hub', 'dark', [(0.02, -0.12), (0.25, -0.12), (0.25, 0.12), (0.02, 0.12)], 20, 0, 'y'))
parts += bolt_ring('hb', 6, 0.16, (0, 0.12, 0), 'y', 1, 0.024)
parts.append(lathe('cap', 'steel', [(0.08, 0.12), (0.08, 0.15)], 12, 0, 'y'))
export(finish('horizbar_bar', parts), 'horizbar-bar.glb')
