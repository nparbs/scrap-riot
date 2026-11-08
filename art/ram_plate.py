# The ram's armour plate, without its spikes (the game still turns those). Writes public/models/ram-plate.glb.
# Run from the repo root: blender --background --factory-startup --python art/ram_plate.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import box, bolt, export, finish, lathe, prism, reset  # noqa: E402

reset()
parts = []
# The backing plate, the same outline the game used to draw, and a raised armour face on it.
parts.append(prism('plate', 'dark', [(-0.78, -0.12), (-0.78, 0.12), (-0.6, 0.24), (0.6, 0.24), (0.78, 0.12), (0.78, -0.12), (0.6, -0.24), (-0.6, -0.24)], 0.14, 'front'))
parts.append(prism('face', 'steel', [(-0.68, -0.08), (-0.68, 0.08), (-0.55, 0.165), (0.55, 0.165), (0.68, 0.08), (0.68, -0.08), (0.55, -0.165), (-0.55, -0.165)], 0.04, 'front', (0, 0, 0.085)))
# Bolts round the rim of the backing plate.
for x, y in ((-0.73, 0), (0.73, 0), (-0.26, 0.205), (0.26, 0.205), (-0.26, -0.205), (0.26, -0.205)):
    parts.append(bolt(f'rim{x}{y}', (x, y, 0.082), (0, 0, 1)))
# A big hex nut holding each spike to the face.
for x in (-0.52, 0, 0.52):
    parts.append(lathe(f'nut{x}', 'steel', [(0.215, 0.1), (0.215, 0.165)], 6, 0, 'z', (x, 0, 0)))
# Behind: a stiffening rib, and a clevis for each hydraulic ram to pin into.
parts.append(box('rib', 'dark', (1.3, 0.07, 0.07), (0, 0, -0.1)))
for side in (-1, 1):
    for ear in (-1, 1):
        parts.append(box(f'ear{side}{ear}', 'dark', (0.035, 0.17, 0.13), (side * 0.45 + ear * 0.075, 0, -0.12)))
    parts.append(lathe(f'pin{side}', 'steel', [(0.032, -0.11), (0.032, 0.11)], 12, 0, 'x', (side * 0.45, 0, -0.14)))

export(finish('ram_plate', parts), 'ram-plate.glb')
