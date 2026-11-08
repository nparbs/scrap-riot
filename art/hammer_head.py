# Builds the sledgehammer head and exports public/models/hammer-head.glb.
# Run from the repo root: blender --background --factory-startup --python art/hammer_head.py
# Sizes are in game units and match the head drawn in src/render/robots.ts: about 0.92 long and 0.25 across,
# its long axis upright (Blender Z), with the haft coming in from Blender +Y, which is the robot side.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models', 'hammer-head.glb')
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
SIDES = 8
TURN = math.pi / SIDES  # a flat, not a corner, faces the haft

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lathe(name, profile, sides=SIDES, turn=TURN):
    """Rings of (radius, z) spun around Z, capped at both ends, like three's LatheGeometry."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(turn + i * 2 * math.pi / sides), r * math.sin(turn + i * 2 * math.pi / sides), z)) for i in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return obj


def along_y(obj, y):
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.location.y = y
    return obj


parts = {}
# The forged body, waisted slightly between the bands.
parts['body'] = [lathe('body', [(0.198, -0.335), (0.198, -0.16), (0.19, -0.1), (0.19, 0.1), (0.198, 0.16), (0.198, 0.335)])]
# Striking faces: a flared, chamfered block at each end.
for s in (-1, 1):
    prof = [(0.2, 0.32), (0.245, 0.365), (0.245, 0.425), (0.222, 0.46)]
    if s < 0:
        prof = [(r, -z) for r, z in reversed(prof)]
    parts.setdefault('face', []).append(lathe(f'face{s}', prof))
# Reinforcing bands, painted.
for z in (-0.2, 0.2):
    parts.setdefault('band', []).append(lathe(f'band{z}', [(0.212, z - 0.035), (0.212, z + 0.035)]))
# The socket the haft goes into, with a collar, and the wedged end of the haft on the far side.
parts['boss'] = [
    along_y(lathe('boss', [(0.092, -0.05), (0.092, 0.06)], 12, 0), 0.19),
    along_y(lathe('collar', [(0.104, -0.018), (0.104, 0.018)], 12, 0), 0.24),
    along_y(lathe('wedge', [(0.07, -0.02), (0.07, 0.02)], 12, 0), -0.186),
]
# Hex bolts through each band, on four of its flats.
for z in (-0.2, 0.2):
    for i in range(4):
        a = i * math.pi / 2  # the middle of a flat, since corners sit at TURN + 45° steps
        d = 0.212 * math.cos(math.pi / SIDES)
        bolt = lathe(f'bolt{z}{i}', [(0.026, -0.012), (0.026, 0.012)], 6, 0)
        bolt.rotation_euler = (0, math.pi / 2, a)
        bolt.location = (d * math.cos(a), d * math.sin(a), z)
        parts.setdefault('bolt', []).append(bolt)

# Remember which part each face belongs to, then join everything into one mesh.
PART_IDS = {'body': 0, 'face': 1, 'band': 2, 'boss': 3, 'bolt': 4}
for kind, objs in parts.items():
    for obj in objs:
        mat = bpy.data.materials.get(kind) or bpy.data.materials.new(kind)
        obj.data.materials.append(mat)
all_objs = [o for objs in parts.values() for o in objs]
bpy.ops.object.select_all(action='DESELECT')
for o in all_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = all_objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
head = bpy.context.active_object
head.name = 'hammer_head'

# Small rounded edges catch the light; hardened normals keep the flats flat.
bev = head.modifiers.new('bevel', 'BEVEL')
bev.width = 0.009
bev.segments = 1
bev.limit_method = 'ANGLE'
bev.angle_limit = math.radians(35)
bev.harden_normals = True
bpy.ops.object.modifier_apply(modifier='bevel')
for p in head.data.polygons:
    p.use_smooth = True

# No textures: the game paints each part with its own shared materials, matched by these names
# (see HAMMER_LOOK in src/render/robots.ts). The colours here are only for the Blender preview.
LOOK = {'body': ((0.018, 0.02, 0.024), 0.4, 0.8), 'face': ((0.15, 0.17, 0.19), 0.75, 0.45), 'band': ((0.69, 0.54, 0.04), 0.35, 0.5),
        'boss': ((0.018, 0.02, 0.024), 0.4, 0.8), 'bolt': ((0.15, 0.17, 0.19), 0.75, 0.45)}
for slot in head.material_slots:
    color, metal, rough = LOOK[slot.material.name]
    bsdf = slot.material.node_tree.nodes['Principled BSDF'] if slot.material.node_tree else None
    if bsdf is None:
        slot.material.use_nodes = True
        bsdf = slot.material.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_texcoords=False,
    export_materials='EXPORT',
    export_yup=True,
)
tris = sum(len(p.vertices) - 2 for p in head.data.polygons)
print(f'EXPORTED {OUT} triangles={tris} size={os.path.getsize(OUT)}')

if PREVIEW:
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    cam.location = (1.4, -0.9, 0.7)
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for loc, power in (((2, -1, 2), 400), ((-2, 2, 1), 150)):
        light = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA'))
        light.data.energy = power
        light.data.size = 2
        light.location = loc
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    world = bpy.data.worlds.new('w'); scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    scene.render.resolution_x = scene.render.resolution_y = 600
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
