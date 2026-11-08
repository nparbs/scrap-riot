# The axe's head: a crescent blade with a ground cutting edge, set in a riveted socket.
# Writes public/models/axe-head.glb. Run from the repo root: blender --background --factory-startup --python art/axe_head.py
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import bolt, box, export, finish, lathe, quad, reset  # noqa: E402

THICK = 0.075
EDGE = 0.008  # how thick the very edge is left
reset()

# The game's outline, as (forward, up). The lower crescent is the cutting edge.
start = [(1.22, 0.12), (1.58, 0.12), (1.6, -0.06)]
front = quad((1.6, -0.06), (1.78, -0.26), (2.02, -0.42), 6)
edge = quad((2.02, -0.42), (1.72, -0.74), (1.08, -0.7), 14)
back = quad((1.08, -0.7), (1.3, -0.36), (1.22, -0.08), 8)
outline = start + front + edge[:-1] + [edge[-1]] + back[:-1]
cutting = {(round(z, 5), round(y, 5)) for z, y in [front[-1]] + edge}

# A flat face, inset to make a band round the edge, then given thickness.
bm = bmesh.new()
verts = [bm.verts.new((0, y, z)) for z, y in outline]
face = bm.faces.new(verts)
bmesh.ops.inset_individual(bm, faces=[face], thickness=0.075, depth=0, use_even_offset=True)
geom = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))['geom']
for v in geom:
    if isinstance(v, bmesh.types.BMVert):
        v.co.x += THICK
for v in bm.verts:
    v.co.x -= THICK / 2
# Grind the edge: the outer ring along the crescent closes in to almost nothing.
ground = set()
for v in bm.verts:
    if (round(v.co.z, 5), round(v.co.y, 5)) in cutting:
        v.co.x = EDGE / 2 if v.co.x > 0 else -EDGE / 2
        ground.add(v)
mesh = bpy.data.meshes.new('blade')
steel = bpy.data.materials.new('steel')
blade = bpy.data.materials.new('blade')
mesh.materials.append(steel)
mesh.materials.append(blade)
for f in bm.faces:
    f.material_index = 1 if any(v in ground for v in f.verts) else 0
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(mesh)
bm.free()
blade_obj = bpy.data.objects.new('blade', mesh)
bpy.context.scene.collection.objects.link(blade_obj)

# The blade is all flat planes, so it stays flat-shaded and apart from the rounded-off socket.
for poly in mesh.polygons:
    poly.use_smooth = False

parts = []
# The socket the haft runs into, a collar where it enters, and rivets through both cheeks.
parts.append(box('socket', 'dark', (0.15, 0.24, 0.44), (0, 0, 1.42)))
parts.append(lathe('collar', 'steel', [(0.085, 1.16), (0.085, 1.205)], 16, 0, 'z'))
for side in (-1, 1):
    for z in (1.29, 1.55):
        parts.append(bolt(f'rivet{side}{z}', (side * 0.083, 0, z), (side, 0, 0), 0.03, 0.02))

export([finish('axe_socket', parts, bevel=0.007), blade_obj], 'axe-head.glb')
