# The rolling pin's roller and flanges (the studs are still drawn by the game). Writes public/models/roller-body.glb.
# Run from the repo root: blender --background --factory-startup --python art/roller_body.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
parts.append(lathe('roller', 'steel', [(0.02, -0.64), (0.38, -0.64), (0.38, 0.64), (0.02, 0.64)], 24, 0, 'x'))
# Weld seams between the rows of studs.
for x in (-0.21, 0.21):
    parts.append(lathe(f'seam{x}', 'dark', [(0.39, x - 0.02), (0.39, x + 0.02)], 24, 0, 'x'))
for s in (-1, 1):
    parts.append(lathe(f'flange{s}', 'dark', [(0.02, s * 0.63), (0.43, s * 0.63), (0.43, s * 0.69), (0.02, s * 0.69)], 24, 0, 'x'))
    parts.append(lathe(f'hub{s}', 'steel', [(0.13, s * 0.69), (0.13, s * 0.72)], 16, 0, 'x'))
    parts += bolt_ring(f'fb{s}', 8, 0.31, (s * 0.695, 0, 0), 'x', s)
export(finish('roller_body', parts), 'roller-body.glb')
