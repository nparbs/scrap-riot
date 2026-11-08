# The magnet: a red horseshoe with steel pole tips, coil windings and its bracket. Writes public/models/magnet-body.glb.
# Run from the repo root: blender --background --factory-startup --python art/magnet_body.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
# The bend, curving back from the legs, as in the game: radius 0.5, tube 0.16, centred at z 0.56.
bend = [(0.5 * math.cos(t), 0, 0.56 - 0.5 * math.sin(t)) for t in (i / 24 * math.pi for i in range(25))]
parts.append(arc_tube('bend', 'red', bend, 0.16, 20))
for s in (-1, 1):
    parts.append(lathe(f'leg{s}', 'red', [(0.16, 0.56), (0.16, 0.98)], 20, 0, 'z', (s * 0.5, 0, 0)))
    parts.append(lathe(f'pole{s}', 'steel', [(0.17, 0.98), (0.17, 1.18), (0.145, 1.22), (0.02, 1.22)], 20, 0, 'z', (s * 0.5, 0, 0)))
    for z in (0.6, 0.66, 0.72, 0.78, 0.84, 0.9):
        parts.append(lathe(f'coil{s}{z}', 'copper', [(0.18, z), (0.18, z + 0.045)], 20, 0, 'z', (s * 0.5, 0, 0)))
    parts.append(lathe(f'term{s}', 'steel', [(0.025, 0.15), (0.025, 0.24)], 8, 0, 'y', (s * 0.5, 0, 0.75)))
# A clamp band across the bend and the bracket it's carried on.
parts.append(box('clamp', 'steel', (0.16, 0.38, 0.1), (0, 0, 0.08)))
parts.append(prism('bracket', 'dark', [(-0.1, -0.1), (0.2, -0.09), (0.2, 0.09), (-0.1, 0.1)], 0.24, 'side'))
export(finish('magnet_body', parts), 'magnet-body.glb')
