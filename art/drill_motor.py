# The drill's motor and chuck (the bit is still drawn by the game). Writes public/models/drill-motor.glb.
# Run from the repo root: blender --background --factory-startup --python art/drill_motor.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import arc_tube, bolt, bolt_ring, box, export, finish, ground_plate, lathe, prism, reset  # noqa: E402,F401

reset()
parts = []
# Motor can, cooling fins round it, a steel chuck tapering to the bit, and bolts on the back plate.
parts.append(lathe('can', 'dark', [(0.02, -0.06), (0.3, -0.06), (0.325, -0.035), (0.325, 0.3), (0.28, 0.35), (0.02, 0.35)], 24))
for z in (0.03, 0.1, 0.17, 0.24):
    parts.append(lathe(f'fin{z}', 'steel', [(0.35, z - 0.014), (0.35, z + 0.014)], 24))
parts.append(lathe('chuck', 'steel', [(0.27, 0.34), (0.27, 0.42), (0.2, 0.48), (0.02, 0.48)], 12, math.pi / 12))
parts += bolt_ring('back', 6, 0.2, (0, 0, -0.06), 'z', -1, turn=math.pi / 6)
# A cable gland on top and a mounting foot underneath.
parts.append(lathe('gland', 'steel', [(0.05, 0.31), (0.05, 0.38)], 12, 0, 'y', (0, 0, 0.12)))
parts.append(box('foot', 'dark', (0.3, 0.08, 0.3), (0, -0.33, 0.14)))
export(finish('drill_motor', parts), 'drill-motor.glb')
