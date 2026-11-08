# The tesla coil's mount and housing (the spinning coil stack is still drawn by the game).
# Writes public/models/tesla-base.glb.
# Run from the repo root: blender --background --factory-startup --python art/tesla_base.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
parts.append(prism('mount', 'dark', [(-0.08, -0.13), (0.2, -0.13), (0.3, -0.06), (0.3, 0.1), (0.2, 0.16), (-0.08, 0.16)], 0.4, 'side'))
for s in (-1, 1):
    for z in (0.0, 0.16):
        parts.append(bolt(f'mb{s}{z}', (s * 0.2, 0.02, z), (s, 0, 0)))
# A hazard strip across the top of the mount.
parts.append(box('strip', 'band', (0.3, 0.02, 0.18), (0, 0.168, 0.06)))
# The housing: a stepped insulator collar the coil stack runs out of.
parts.append(lathe('housing', 'dark', [(0.02, 0.24), (0.21, 0.24), (0.245, 0.29), (0.245, 0.32), (0.17, 0.38), (0.02, 0.38)], 20, 0, 'z', (0, 0.02, 0)))
for z in (0.255, 0.305):
    parts.append(lathe(f'ins{z}', 'steel', [(0.255, z - 0.01), (0.255, z + 0.01)], 20, 0, 'z', (0, 0.02, 0)))
export(finish('tesla_base', parts), 'tesla-base.glb')
