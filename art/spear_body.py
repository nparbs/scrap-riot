# The spear's pneumatic cylinder (the sleeve and spike that fire out are still drawn by the game).
# Writes public/models/spear-body.glb.
# Run from the repo root: blender --background --factory-startup --python art/spear_body.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
parts.append(lathe('cylinder', 'dark', [(0.02, -0.04), (0.18, -0.04), (0.18, 0.4), (0.02, 0.4)], 20))
# Square end caps held together by four tie rods, the way a real air cylinder is built.
for z in (-0.08, 0.43):
    parts.append(box(f'cap{z}', 'steel', (0.42, 0.42, 0.08), (0, 0, z)))
for x in (-0.16, 0.16):
    for y in (-0.16, 0.16):
        parts.append(lathe(f'tie{x}{y}', 'steel', [(0.022, -0.13), (0.022, 0.48)], 8, 0, 'z', (x, y, 0)))
        for z in (-0.13, 0.48):
            parts.append(lathe(f'nut{x}{y}{z}', 'steel', [(0.035, -0.02), (0.035, 0.02)], 6, 0, 'z', (x, y, z)))
# An air fitting on top.
parts.append(lathe('fitting', 'copper', [(0.04, 0.17), (0.04, 0.26), (0.03, 0.28)], 6, 0, 'y', (0, 0, -0.08)))
export(finish('spear_body', parts), 'spear-body.glb')
