# Shared helpers for the part scripts in this folder. Each script builds one part and exports it to public/models.
# Shapes are written in game space: x across the robot, y up, z forward, the same as src/render/robots.ts.
# Every piece is tagged with a "look" (body, steel, blade, bolt, band...) which the game turns into one of its
# own materials, so the files carry shape only.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Rough stand-ins for the game's materials, used only for the preview render.
PREVIEW_LOOK = {
    'dark': ((0.018, 0.02, 0.024), 0.4, 0.8),
    'steel': ((0.15, 0.17, 0.19), 0.75, 0.45),
    'blade': ((0.6, 0.66, 0.71), 0.95, 0.2),
    'band': ((0.69, 0.54, 0.04), 0.35, 0.5),
    'red': ((0.58, 0.02, 0.01), 0.3, 0.45),
    'copper': ((0.54, 0.2, 0.05), 0.85, 0.35),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _object(name, bm, look):
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.get(look) or bpy.data.materials.new(look)
    obj.data.materials.append(mat)
    return obj


def lathe(name, look, profile, sides=20, turn=0.0, axis='z', at=(0, 0, 0)):
    """Rings of (radius, along) spun around a game axis and capped at both ends."""
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        ring = []
        for i in range(sides):
            a = turn + i * 2 * math.pi / sides
            u, v = r * math.cos(a), r * math.sin(a)
            p = {'x': (h, u, v), 'y': (u, h, v), 'z': (u, v, h)}[axis]
            ring.append(bm.verts.new(Vector(p) + Vector(at)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return _object(name, bm, look)


def prism(name, look, points, thickness, plane, at=(0, 0, 0)):
    """A flat outline given thickness, centred on its plane like the game's plate().
    plane 'side': outline (x, y) runs (z, y), thickness across x. 'top': outline runs (x, z), thickness up y.
    'front': outline runs (x, y), thickness along z."""
    bm = bmesh.new()

    def place(px, py, d):
        p = {'side': (d, py, px), 'top': (px, d, py), 'front': (px, py, d)}[plane]
        return bm.verts.new(Vector(p) + Vector(at))

    back = [place(px, py, -thickness / 2) for px, py in points]
    front = [place(px, py, thickness / 2) for px, py in points]
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))
    bm.faces.new(list(reversed(back)))
    bm.faces.new(front)
    return _object(name, bm, look)


def box(name, look, size, at=(0, 0, 0)):
    w, h, d = size
    return prism(name, look, [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], d, 'front', at)


def bolt(name, at, normal, radius=0.026, height=0.024, look='steel'):
    """A hex bolt head standing on a surface that faces `normal`."""
    obj = lathe(name, look, [(radius, -height / 2), (radius, height / 2)], 6, 0, 'z')
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
    obj.location = at
    return obj


def quad(a, c, b, steps=10):
    """Points along a quadratic curve from a to b with control c, leaving out a."""
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]) for t in (i / steps for i in range(1, steps + 1))]


def finish(name, objs, bevel=0.009, angle=35):
    """Joins the pieces into one object in game space, with small rounded edges and crisp flats."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(obj.data)
    bm.free()
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(angle)
        mod.harden_normals = True
        bpy.ops.object.modifier_apply(modifier='bevel')
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def export(objs, file, game_space=True):
    """Writes one or more finished objects as a .glb. Game-space shapes are turned so they come out of the Y-up export unchanged."""
    objs = objs if isinstance(objs, list) else [objs]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        if game_space:
            obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
        for slot in obj.material_slots:
            color, metal, rough = PREVIEW_LOOK.get(slot.material.name, PREVIEW_LOOK['steel'])
            slot.material.diffuse_color = (*color, 1)
            slot.material.metallic = metal
            slot.material.roughness = rough
        obj.select_set(True)
    out = os.path.join(ROOT, 'public', 'models', file)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_texcoords=False, export_materials='EXPORT', export_yup=True)
    tris = sum(len(p.vertices) - 2 for obj in objs for p in obj.data.polygons)
    print(f'EXPORTED {out} triangles={tris} size={os.path.getsize(out)}')


def arc_tube(name, look, centre_line, radius, sides=12):
    """A round tube along a list of points, capped at both ends: bent bars, horseshoes."""
    bm = bmesh.new()
    pts = [Vector(p) for p in centre_line]
    rings = []
    for i, p in enumerate(pts):
        ahead = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = ahead.cross(Vector((0, 1, 0)) if abs(ahead.y) < 0.9 else Vector((1, 0, 0))).normalized()
        up = side.cross(ahead).normalized()
        rings.append([bm.verts.new(p + radius * (math.cos(a) * side + math.sin(a) * up)) for a in (j * 2 * math.pi / sides for j in range(sides))])
    for a, b in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return _object(name, bm, look)


def ground_plate(name, look, outline, thickness, plane, sharp, band=0.06, edge=0.008):
    """A flat plate whose outline is ground thin wherever sharp(point) is true, like a blade.
    The band of faces running down to a ground edge gets the 'blade' look. It is flat-shaded,
    so it should be exported as its own object rather than joined with rounded parts."""
    bm = bmesh.new()
    def at(px, py, d):
        return {'side': (d, py, px), 'top': (px, d, py), 'front': (px, py, d)}[plane]
    face = bm.faces.new([bm.verts.new(at(px, py, 0)) for px, py in outline])
    bmesh.ops.inset_individual(bm, faces=[face], thickness=band, depth=0, use_even_offset=True)
    axis = {'side': 0, 'top': 1, 'front': 2}[plane]
    for v in bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))['geom']:
        if isinstance(v, bmesh.types.BMVert):
            v.co[axis] += thickness
    for v in bm.verts:
        v.co[axis] -= thickness / 2
    outer = {(round(px, 5), round(py, 5)) for px, py in outline if sharp((px, py))}
    ground = set()
    for v in bm.verts:
        flat = {'side': (v.co.z, v.co.y), 'top': (v.co.x, v.co.z), 'front': (v.co.x, v.co.y)}[plane]
        if (round(flat[0], 5), round(flat[1], 5)) in outer:
            v.co[axis] = edge / 2 if v.co[axis] > 0 else -edge / 2
            ground.add(v)
    mesh = bpy.data.meshes.new(name)
    for m in (look, 'blade'):
        mesh.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    for f in bm.faces:
        f.material_index = 1 if any(v in ground for v in f.verts) else 0
        f.smooth = False
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bolt_ring(prefix, count, radius, centre, axis, facing, bolt_radius=0.024, turn=0.0):
    """Bolts in a circle on a face that points along +axis (facing=1) or -axis (facing=-1)."""
    out = []
    for i in range(count):
        a = turn + i * 2 * math.pi / count
        u, v = radius * math.cos(a), radius * math.sin(a)
        offset = {'x': (0, u, v), 'y': (u, 0, v), 'z': (u, v, 0)}[axis]
        normal = {'x': (facing, 0, 0), 'y': (0, facing, 0), 'z': (0, 0, facing)}[axis]
        out.append(bolt(f'{prefix}{i}', tuple(c + o for c, o in zip(centre, offset)), normal, bolt_radius, bolt_radius * 0.8))
    return out
