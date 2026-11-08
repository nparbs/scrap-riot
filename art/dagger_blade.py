# The dagger's spike: crossguard, double-edged blade and fuller. It moves as one, so it goes in one file.
# Writes public/models/dagger-blade.glb.
# Run from the repo root: blender --background --factory-startup --python art/dagger_blade.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
outline = [(-0.16, 0.3), (0.16, 0.3), (0.13, 1.1), (0, 1.72), (-0.13, 1.1)]
# Ground on both long edges and the point; the base stays full thickness where it meets the guard.
blade = ground_plate('blade', 'steel', outline, 0.06, 'top', lambda p: p[1] > 0.5, band=0.07)
parts = []
parts.append(prism('guard', 'steel', [(-0.3, 0.2), (0.3, 0.2), (0.34, 0.26), (0.3, 0.32), (-0.3, 0.32), (-0.34, 0.26)], 0.12, 'top'))
for x in (-0.12, 0.12):
    parts.append(bolt(f'g{x}', (x, 0.06, 0.26), (0, 1, 0)))
parts.append(prism('fuller', 'dark', [(-0.035, 0.34), (0.035, 0.34), (0.02, 1.1), (-0.02, 1.1)], 0.068, 'top'))
export([finish('dagger_guard', parts, bevel=0.006), blade], 'dagger-blade.glb')
