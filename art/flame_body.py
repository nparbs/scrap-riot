# The flamethrower's mount, barrel and nozzle (the fuel line and pilot light are still drawn by the game).
# Writes public/models/flame-body.glb.
# Run from the repo root: blender --background --factory-startup --python art/flame_body.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
Y = 0.06
parts = []
parts.append(prism('mount', 'dark', [(-0.08, -0.14), (0.2, -0.1), (0.24, 0.1), (-0.08, 0.14)], 0.34, 'side'))
for s in (-1, 1):
    for z, y in ((0.02, 0.05), (0.14, -0.04)):
        parts.append(bolt(f'mb{s}{z}', (s * 0.17, y, z), (s, 0, 0)))
# Barrel, then a flared nozzle with a copper lip and the same open mouth the pilot light sits in.
parts.append(lathe('barrel', 'dark', [(0.02, 0), (0.09, 0), (0.09, 1.15), (0.02, 1.15)], 16, 0, 'z', (0, Y, 0)))
parts.append(lathe('nozzle', 'steel', [(0.09, 1.12), (0.11, 1.2), (0.18, 1.42), (0.18, 1.47), (0.13, 1.47), (0.08, 1.34), (0.02, 1.34)], 16, 0, 'z', (0, Y, 0)))
parts.append(lathe('lip', 'copper', [(0.19, 1.45), (0.19, 1.5), (0.135, 1.5), (0.13, 1.47)], 16, 0, 'z', (0, Y, 0)))
# Two clamps with bolt lugs, and a finned heat shield between them.
for z in (0.32, 0.84):
    parts.append(lathe(f'clamp{z}', 'steel', [(0.125, z - 0.045), (0.125, z + 0.045)], 16, 0, 'z', (0, Y, 0)))
    parts.append(box(f'lug{z}', 'steel', (0.05, 0.06, 0.09), (0.15, Y, z)))
for z in (0.46, 0.53, 0.6, 0.67):
    parts.append(lathe(f'shield{z}', 'dark', [(0.115, z - 0.018), (0.115, z + 0.018)], 16, 0, 'z', (0, Y, 0)))
export(finish('flame_body', parts), 'flame-body.glb')
