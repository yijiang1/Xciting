# Builds the synchrotron size-comparison scene in Blender and renders it.
# Every facility is a ring hall whose storage ring is a circle with the real
# circumference from content/compare/synchrotrons.json, lined up smallest to
# largest along one road, with a football pitch first for scale. The camera
# visits each ring in turn (timing from the same JSON, mirrored by
# src/SizeCompare.tsx for the labels) and ends on a top-down view of the row.
#
# Usage (from viral_xray_factory/):
#   ~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/blender/synchrotron_compare.py -- \
#       --format portrait|landscape [--still FRAME [--samples N] [--scale PCT]] [--render]
# Frames go to renders/compare/<id>/<format>/frames/ and are resumable
# (existing frames are skipped).

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


FORMAT = arg('--format', 'portrait')
DATA = json.load(open(os.path.join(ROOT, 'content/compare/synchrotrons.json')))
OUT = os.path.join(ROOT, 'renders/compare', DATA['id'], FORMAT)
random.seed(7)

WALL_H = 11.0   # ring hall height; the same for all, so only footprints differ
FRONT = 70.0    # strip between the road and each ring: office + parking
ROAD_W = 10.0


# ---------------------------------------------------------------- materials

def principled(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def node(m, kind, **props):
    n = m.node_tree.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def link(m, a, b):
    m.node_tree.links.new(a, b)


def math_node(m, op, a, b=None):
    n = node(m, 'ShaderNodeMath', operation=op)
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            link(m, v, n.inputs[i])
    return n.outputs[0]


def ramp(m, fac, colors, interp='LINEAR'):
    r = node(m, 'ShaderNodeValToRGB')
    r.color_ramp.interpolation = interp
    # Elements re-sort whenever a position changes, so set the two ends and
    # then add the middle stops, rather than assigning by index.
    n = len(colors)
    pos = [i / (n if interp == 'CONSTANT' else max(1, n - 1)) for i in range(n)]
    els = r.color_ramp.elements
    els[1].position, els[1].color = pos[-1], (*colors[-1], 1)
    els[0].position, els[0].color = pos[0], (*colors[0], 1)
    for p, c in zip(pos[1:-1], colors[1:-1]):
        els.new(p).color = (*c, 1)
    link(m, fac, r.inputs['Fac'])
    return r.outputs['Color']


def noise_tex(m, vec, scale, detail=4.0):
    n = node(m, 'ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    link(m, vec, n.inputs['Vector'])
    return n.outputs['Fac']


def coords(m, which='Object'):
    return node(m, 'ShaderNodeTexCoord').outputs[which]


def xyz(m, vec):
    s = node(m, 'ShaderNodeSeparateXYZ')
    link(m, vec, s.inputs[0])
    return s.outputs


def rgba_in(n, name):
    # Mix nodes have float, vector and colour sockets that share a name.
    return next(s for s in n.inputs if s.name == name and s.type == 'RGBA')


def bsdf(m):
    return m.node_tree.nodes['Principled BSDF']


def linear(hex_color):
    """sRGB '#rrggbb' (as sampled from satellite imagery) to linear RGB."""
    c = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def roof_material(name, color):
    """Metal roof in the facility's colour: standing seams along the arc,
    bay-to-bay tone drift. UV u = arc length (m)."""
    m = principled(name, color, rough=0.6, metal=0.05)  # low metal: no sky-blue cast
    uv = coords(m, 'UV')
    u, v, _ = xyz(m, uv)
    section = math_node(m, 'FLOOR', math_node(m, 'DIVIDE', u, 24.0))  # roof bays along the ring
    wn = node(m, 'ShaderNodeTexWhiteNoise', noise_dimensions='1D')
    link(m, section, wn.inputs['W'])
    tone = math_node(m, 'ADD', math_node(m, 'MULTIPLY', wn.outputs['Value'], 0.5), math_node(m, 'MULTIPLY', noise_tex(m, uv, 0.05, 2.0), 0.5))
    link(m, ramp(m, tone, [tuple(min(1.0, c * k) for c in color) for k in (0.85, 1.08)]), bsdf(m).inputs['Base Color'])
    seam = math_node(m, 'SINE', math_node(m, 'MULTIPLY', u, 2 * math.pi / 0.6))
    bump = node(m, 'ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    link(m, seam, bump.inputs['Height'])
    link(m, bump.outputs['Normal'], bsdf(m).inputs['Normal'])
    return m


def make_materials(campus):
    M = {}
    # Ground: mown lawn inside the campus, farmland patchwork outside, with a
    # noisy boundary so the campus edge isn't a ruler-straight line.
    m = principled('ground', (0.05, 0.09, 0.02), rough=0.95)
    o = coords(m)
    f = math_node(m, 'MULTIPLY', noise_tex(m, o, 0.008), 0.6)
    f = math_node(m, 'ADD', f, math_node(m, 'MULTIPLY', noise_tex(m, o, 0.06), 0.25))
    x, _, _ = xyz(m, o)  # mowing stripes
    f = math_node(m, 'ADD', f, math_node(m, 'MULTIPLY', math_node(m, 'LESS_THAN', math_node(m, 'FRACT', math_node(m, 'DIVIDE', x, 9.0)), 0.5), 0.06))
    lawn = ramp(m, f, [(0.03, 0.07, 0.012), (0.045, 0.095, 0.018), (0.06, 0.105, 0.022), (0.11, 0.105, 0.045)])
    mp = node(m, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0, 0.55, 1.0)
    link(m, o, mp.inputs['Vector'])
    v = node(m, 'ShaderNodeTexVoronoi')
    v.inputs['Scale'].default_value = 0.004
    v.inputs['Randomness'].default_value = 0.85
    v.distance = 'CHEBYCHEV'  # squarish plots, like real field boundaries
    link(m, mp.outputs['Vector'], v.inputs['Vector'])
    crop = ramp(m, v.outputs['Color'], [
        (0.05, 0.085, 0.02), (0.12, 0.11, 0.05), (0.08, 0.07, 0.04),
        (0.065, 0.1, 0.028), (0.1, 0.105, 0.045), (0.045, 0.075, 0.02)], 'CONSTANT')
    mix = node(m, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mix.inputs['Factor'].default_value = 0.35
    link(m, crop, rgba_in(mix, 'A'))
    link(m, ramp(m, noise_tex(m, o, 0.05), [(0.7, 0.7, 0.7), (1.15, 1.15, 1.15)]), rgba_in(mix, 'B'))
    x0, x1, y0, y1 = campus
    x, y, _ = xyz(m, o)
    d = math_node(m, 'MAXIMUM', math_node(m, 'MAXIMUM', math_node(m, 'SUBTRACT', x0, x), math_node(m, 'SUBTRACT', x, x1)),
                  math_node(m, 'MAXIMUM', math_node(m, 'SUBTRACT', y0, y), math_node(m, 'SUBTRACT', y, y1)))
    d = math_node(m, 'ADD', d, math_node(m, 'MULTIPLY', math_node(m, 'SUBTRACT', noise_tex(m, o, 0.004), 0.5), 500))
    mr = node(m, 'ShaderNodeMapRange', clamp=True)
    mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = 0, 60
    link(m, d, mr.inputs['Value'])
    ground = node(m, 'ShaderNodeMix', data_type='RGBA')
    link(m, mr.outputs['Result'], ground.inputs['Factor'])
    link(m, lawn, rgba_in(ground, 'A'))
    link(m, next(o for o in mix.outputs if o.type == 'RGBA'), rgba_in(ground, 'B'))
    link(m, next(o for o in ground.outputs if o.type == 'RGBA'), bsdf(m).inputs['Base Color'])
    M['ground'] = m

    m = principled('asphalt', (0.04, 0.04, 0.042), rough=0.9)
    link(m, ramp(m, noise_tex(m, coords(m), 0.3), [(0.03, 0.03, 0.032), (0.055, 0.055, 0.058)]), bsdf(m).inputs['Base Color'])
    M['asphalt'] = m

    # Parking lot: asphalt with white stall lines (UV in metres).
    m = principled('parking', (0.045, 0.045, 0.047), rough=0.9)
    u, v, _ = xyz(m, coords(m, 'UV'))
    across = math_node(m, 'LESS_THAN', math_node(m, 'FRACT', math_node(m, 'DIVIDE', u, 2.6)), 0.06)
    vv = math_node(m, 'MULTIPLY', math_node(m, 'FRACT', math_node(m, 'DIVIDE', v, 16.0)), 16.0)
    in_row = math_node(m, 'MAXIMUM', math_node(m, 'LESS_THAN', vv, 5.0), math_node(m, 'GREATER_THAN', vv, 11.0))
    lines = math_node(m, 'MULTIPLY', across, in_row)
    link(m, ramp(m, lines, [(0.045, 0.045, 0.047), (0.7, 0.7, 0.68)]), bsdf(m).inputs['Base Color'])
    M['parking'] = m

    # Ring-hall walls: concrete with a band of windows (UV u = arc metres, v = height).
    m = principled('wall', (0.36, 0.36, 0.34), rough=0.8)
    u, v, _ = xyz(m, coords(m, 'UV'))
    band = math_node(m, 'MULTIPLY', math_node(m, 'GREATER_THAN', v, 5.0), math_node(m, 'LESS_THAN', v, 8.0))
    pane = math_node(m, 'LESS_THAN', math_node(m, 'FRACT', math_node(m, 'DIVIDE', u, 3.0)), 0.88)
    glass = math_node(m, 'MULTIPLY', band, pane)
    link(m, ramp(m, glass, [(0.36, 0.36, 0.34), (0.02, 0.03, 0.04)]), bsdf(m).inputs['Base Color'])
    link(m, ramp(m, glass, [(0.8, 0.8, 0.8), (0.08, 0.08, 0.08)]), bsdf(m).inputs['Roughness'])
    M['wall'] = m

    M['roof'] = roof_material('roof', (0.2, 0.205, 0.21))

    M['trim'] = principled('trim', (0.42, 0.42, 0.4), rough=0.6)
    M['hvac'] = principled('hvac', (0.33, 0.34, 0.35), rough=0.5, metal=0.3)
    M['glass'] = principled('glass', (0.015, 0.02, 0.03), rough=0.08)
    M['path'] = principled('path', (0.3, 0.29, 0.26), rough=0.9)

    # Office blocks: floors of glass by height (object z), mullions along x+y.
    m = principled('office', (0.3, 0.29, 0.27), rough=0.7)
    x, y, z = xyz(m, coords(m))
    fz = math_node(m, 'FRACT', math_node(m, 'DIVIDE', z, 3.6))
    band = math_node(m, 'MULTIPLY', math_node(m, 'GREATER_THAN', fz, 0.3), math_node(m, 'LESS_THAN', fz, 0.85))
    pane = math_node(m, 'LESS_THAN', math_node(m, 'FRACT', math_node(m, 'DIVIDE', math_node(m, 'ADD', x, y), 1.8)), 0.85)
    glass = math_node(m, 'MULTIPLY', band, pane)
    link(m, ramp(m, glass, [(0.3, 0.29, 0.27), (0.03, 0.045, 0.06)]), bsdf(m).inputs['Base Color'])
    link(m, ramp(m, glass, [(0.7, 0.7, 0.7), (0.05, 0.05, 0.05)]), bsdf(m).inputs['Roughness'])
    M['office'] = m

    # Tree canopies and cars take their colour from the instance's random value.
    m = principled('leaves', (0.03, 0.06, 0.02), rough=0.85)
    rnd = node(m, 'ShaderNodeObjectInfo').outputs['Random']
    link(m, ramp(m, rnd, [(0.02, 0.045, 0.015), (0.035, 0.065, 0.02), (0.05, 0.07, 0.025), (0.03, 0.05, 0.02)]), bsdf(m).inputs['Base Color'])
    M['leaves'] = m
    M['bark'] = principled('bark', (0.05, 0.035, 0.025), rough=0.9)

    m = principled('carpaint', (0.5, 0.5, 0.5), rough=0.3, metal=0.3)
    rnd = node(m, 'ShaderNodeObjectInfo').outputs['Random']
    link(m, ramp(m, rnd, [(0.8, 0.8, 0.8), (0.02, 0.02, 0.02), (0.4, 0.41, 0.43), (0.15, 0.15, 0.16),
                          (0.8, 0.8, 0.8), (0.3, 0.02, 0.02), (0.03, 0.07, 0.2), (0.6, 0.6, 0.6)], 'CONSTANT'),
         bsdf(m).inputs['Base Color'])
    M['car'] = m

    # Football pitch: mowing stripes (UV in metres); lines are separate meshes.
    m = principled('pitch', (0.06, 0.14, 0.035), rough=0.9)
    u, v, _ = xyz(m, coords(m, 'UV'))
    stripe = math_node(m, 'LESS_THAN', math_node(m, 'FRACT', math_node(m, 'DIVIDE', u, 15.0)), 0.5)
    link(m, ramp(m, stripe, [(0.03, 0.075, 0.015), (0.045, 0.1, 0.022)]), bsdf(m).inputs['Base Color'])
    M['pitch'] = m
    M['paint'] = principled('paint', (0.75, 0.75, 0.73), rough=0.7)
    return M


# ---------------------------------------------------------------- geometry

def new_obj(name, bm, mats, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mat in mats:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def rect(bm, x0, y0, x1, y1, z, uv=None, mat=0):
    """Flat quad with UVs in metres from (x0, y0)."""
    vs = [bm.verts.new((x, y, z)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    f = bm.faces.new(vs)
    f.material_index = mat
    if uv is not None:
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x - x0, loop.vert.co.y - y0)
    return f


def box(bm, center, size, rot_z=0.0, mat=0):
    mtx = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, 'Z') @ Matrix.Diagonal((*size, 1))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=mtx)
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mat


def ring_hall(name, cx, cy, inner, outer, height, mats, roof=None, arc=None):
    """Annular hall swept from a cross-section: inner wall, parapets, pitched
    metal roof, outer wall. UV u = arc length (m), v = height or radius (m).
    `arc` = (start, end) angles for a partial hall, capped at both ends."""
    mid = (inner + outer) / 2
    prof = [  # (r, z, material index: 0 wall, 1 roof, 2 trim), walls use z for v
        (inner, 0, 0), (inner, height + 0.6, 2), (inner + 0.4, height + 0.6, 2), (inner + 0.4, height, 1),
        (mid, height + min(2.5, 0.06 * (outer - inner)), 1), (outer - 0.4, height, 2),
        (outer - 0.4, height + 0.8, 2), (outer, height + 0.8, 0), (outer, 0, None)]
    start, end = arc or (0.0, 2 * math.pi)
    n = int(min(1024, max(24 if arc else 96, (end - start) * outer / 2.0)))
    closed = arc is None
    ang = [start + (end - start) * j / n for j in range(n if closed else n + 1)]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    grid = [[bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z)) for r, z, _ in prof] for a in ang]
    for j in range(n):
        a0, a1 = ang[j], ang[(j + 1) % len(ang)] if closed else ang[j + 1]
        j1 = (j + 1) % len(ang)
        for k in range(len(prof) - 1):
            mat = prof[k][2]
            f = bm.faces.new((grid[j][k], grid[j][k + 1], grid[j1][k + 1], grid[j1][k]))
            f.material_index = mat
            for loop, (a, kk) in zip(f.loops, ((a0, k), (a0, k + 1), (a1, k + 1), (a1, k))):
                r, z, _ = prof[kk]
                loop[uv].uv = (a * r, z if mat == 0 else r)
    if not closed:
        for cap in (grid[0], list(reversed(grid[-1]))):
            bm.faces.new(cap).material_index = 0
    return new_obj(name, bm, [mats['wall'], roof or mats['roof'], mats['trim']])


def points_obj(name, pts):
    me = bpy.data.meshes.new(name)
    me.from_pydata(pts, [], [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def scatter(ob, coll, rand_rot, scale_range):
    """Geometry-nodes instancing of `coll`'s children on `ob`'s vertices."""
    ng = bpy.data.node_groups.new(f'scatter_{ob.name}', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    ci = N.new('GeometryNodeCollectionInfo')
    ci.inputs['Collection'].default_value = coll
    ci.inputs['Separate Children'].default_value = True
    ci.inputs['Reset Children'].default_value = True
    iop = N.new('GeometryNodeInstanceOnPoints')
    iop.inputs['Pick Instance'].default_value = True
    ng.links.new(gi.outputs[0], iop.inputs['Points'])
    ng.links.new(ci.outputs[0], iop.inputs['Instance'])
    if rand_rot:
        rr = N.new('FunctionNodeRandomValue')
        rr.data_type = 'FLOAT_VECTOR'
        mx = next(s for s in rr.inputs if s.name == 'Max' and s.type == 'VECTOR')
        mx.default_value = (0, 0, 2 * math.pi)
        ng.links.new(next(s for s in rr.outputs if s.type == 'VECTOR'), iop.inputs['Rotation'])
    rs = N.new('FunctionNodeRandomValue')
    rs.data_type = 'FLOAT'
    next(s for s in rs.inputs if s.name == 'Min' and s.type == 'VALUE').default_value = scale_range[0]
    next(s for s in rs.inputs if s.name == 'Max' and s.type == 'VALUE').default_value = scale_range[1]
    ng.links.new(next(s for s in rs.outputs if s.type == 'VALUE'), iop.inputs['Scale'])
    ng.links.new(iop.outputs['Instances'], go.inputs[0])
    ob.modifiers.new('scatter', 'NODES').node_group = ng


def blob(bm, center, radius, squash, seed, mat):
    res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=radius, matrix=Matrix.Translation(center))
    for v in res['verts']:
        d = v.co - Vector(center)
        k = 1 + 0.28 * noise.noise(d * (1.3 / radius) + Vector((seed, seed * 2, 0)))
        v.co = Vector(center) + Vector((d.x * k, d.y * k, d.z * k * squash))
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mat


def templates(mats):
    trees = bpy.data.collections.new('tree_templates')
    cars = bpy.data.collections.new('car_templates')
    for c in (trees, cars):
        bpy.context.scene.collection.children.link(c)
        bpy.context.view_layer.layer_collection.children[c.name].exclude = True

    def add(coll, name, bm, ms):
        ob = new_obj(name, bm, ms, smooth=True)
        bpy.context.scene.collection.objects.unlink(ob)
        coll.objects.link(ob)

    for i in range(3):  # broadleaf, one to three canopy lobes
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, segments=8, radius1=0.35, radius2=0.25, depth=4, matrix=Matrix.Translation((0, 0, 2)), cap_ends=True)
        blob(bm, (0, 0, 5.5), 3.2, 0.85, i, 1)
        if i > 0:
            blob(bm, (1.6, 0.6, 4.6), 2.3, 0.85, i + 5, 1)
        if i > 1:
            blob(bm, (-1.2, -1.0, 4.9), 2.4, 0.85, i + 9, 1)
        add(trees, f'broadleaf{i}', bm, [mats['bark'], mats['leaves']])
    bm = bmesh.new()  # conifer
    bmesh.ops.create_cone(bm, segments=8, radius1=0.3, radius2=0.2, depth=2, matrix=Matrix.Translation((0, 0, 1)), cap_ends=True)
    bmesh.ops.create_cone(bm, segments=10, radius1=2.4, radius2=0.1, depth=9, matrix=Matrix.Translation((0, 0, 6)), cap_ends=True)
    for f in bm.faces:
        f.material_index = 1 if f.calc_center_median().z > 1.6 else 0
    add(trees, 'conifer', bm, [mats['bark'], mats['leaves']])

    bm = bmesh.new()  # car: body + cabin
    box(bm, (0, 0, 0.45), (1.8, 4.4, 0.7))
    box(bm, (0, -0.2, 1.1), (1.6, 2.4, 0.6))
    add(cars, 'car', bm, [mats['car']])
    return trees, cars


# ---------------------------------------------------------------- layout

def layout():
    items = []
    x = DATA['scaleRef']['lengthM'] / 2
    for it in DATA['items']:
        C = it['circumferenceM']
        R = C / (2 * math.pi)
        inner = {'ring': max(R - 6, 4.0), 'disc': 0.3, 'hall': 0.0, 'buried': R - 12}[it['form']]
        outer = R + 18 + 0.04 * R
        gap = 90 + 0.12 * outer  # clears both perimeter roads (outer + 36)
        cx = x + gap + outer
        extent = 3.2 * outer if it['form'] == 'hall' else 2 * outer  # footprint width the camera frames
        items.append(dict(it, R=R, inner=inner, outer=outer, extent=extent, cx=cx, cy=FRONT + outer))
        x = cx + outer
    return items


def campus_bounds(items):
    L = DATA['scaleRef']['lengthM']
    return (-L / 2 - 400, items[-1]['cx'] + items[-1]['outer'] + 400,
            -260, max(i['cy'] + i['outer'] for i in items) + 260)


def build(items, mats):
    trees, cars = templates(mats)
    L, W = DATA['scaleRef']['lengthM'], DATA['scaleRef']['widthM']
    x_min, x_max, y_min, y_max = campus_bounds(items)

    bm = bmesh.new()
    rect(bm, -20000, -20000, 20000, 20000, 0)
    new_obj('ground', bm, [mats['ground']])

    bm = bmesh.new()  # main road + a spur to each hall
    rect(bm, x_min, -ROAD_W / 2, x_max, ROAD_W / 2, 0.06)
    for it in items:
        rect(bm, it['cx'] - 3.5, ROAD_W / 2, it['cx'] + 3.5, it['cy'] - it['outer'], 0.06)
    new_obj('roads', bm, [mats['asphalt']])

    # Football pitch for scale, 25 m back from the road.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    py = 25 + W / 2
    rect(bm, -L / 2 - 4, py - W / 2 - 4, L / 2 + 4, py + W / 2 + 4, 0.08, uv)
    new_obj('pitch', bm, [mats['pitch']])
    bm = bmesh.new()
    lw, z = 0.2, 0.1
    for x0, y0, x1, y1 in ((-L / 2, -W / 2, L / 2, -W / 2), (-L / 2, W / 2, L / 2, W / 2),
                           (-L / 2, -W / 2, -L / 2, W / 2), (L / 2, -W / 2, L / 2, W / 2), (0, -W / 2, 0, W / 2)):
        rect(bm, x0 - lw / 2, py + y0 - lw / 2, x1 + lw / 2, py + y1 + lw / 2, z)
    for s in (-1, 1):  # penalty and goal areas
        for depth, width in ((16.5, 40.32), (5.5, 18.32)):
            xe = s * L / 2
            xi = xe - s * depth
            for x0, y0, x1, y1 in ((xi, -width / 2, xi, width / 2), (min(xe, xi), -width / 2, max(xe, xi), -width / 2),
                                   (min(xe, xi), width / 2, max(xe, xi), width / 2)):
                rect(bm, x0 - lw / 2, py + y0 - lw / 2, x1 + lw / 2, py + y1 + lw / 2, z)
    n = 64
    for j in range(n):
        a0, a1 = 2 * math.pi * j / n, 2 * math.pi * (j + 1) / n
        vs = [bm.verts.new((r * math.cos(a), py + r * math.sin(a), z)) for r, a in ((9.05, a0), (9.25, a0), (9.25, a1), (9.05, a1))]
        bm.faces.new(vs)
    new_obj('pitch_lines', bm, [mats['paint']])

    car_pts, keep_out = [], []
    for idx, it in enumerate(items):
        cx, cy, inner, outer, R, form = it['cx'], it['cy'], it['inner'], it['outer'], it['R'], it['form']
        roof = roof_material(f'roof_{idx}', linear(it['roof']))
        if form in ('ring', 'disc'):
            ring_hall(f'hall_{idx}', cx, cy, inner, outer, WALL_H, mats, roof)
        elif form == 'hall':  # rectangular hall around a small ring, drum tower at the front
            bm = bmesh.new()
            box(bm, (cx, cy, WALL_H / 2), (2.5 * outer, 1.6 * outer, WALL_H), 0, 0)
            for f in bm.faces:
                f.material_index = 1 if f.normal.z > 0.5 else 0
            bmesh.ops.create_cone(bm, segments=48, radius1=7, radius2=7, depth=14, cap_ends=True,
                                  matrix=Matrix.Translation((cx - 0.5 * outer, cy - 0.8 * outer, 7)))
            new_obj(f'hall_{idx}', bm, [mats['wall'], roof])
        else:  # buried: tunnel path on the surface, experimental halls straddling it
            bm = bmesh.new()
            n = 1024
            pts = [(bm.verts.new((cx + (R - 4) * math.cos(a), cy + (R - 4) * math.sin(a), 0.09)),
                    bm.verts.new((cx + (R + 4) * math.cos(a), cy + (R + 4) * math.sin(a), 0.09)))
                   for a in (2 * math.pi * j / n for j in range(n))]
            for j in range(n):
                (a0, a1), (b0, b1) = pts[j], pts[(j + 1) % n]
                bm.faces.new((a0, b0, b1, a1))
            new_obj(f'tunnel_{idx}', bm, [mats['path']])
            for k, (mid_a, length) in enumerate(((-math.pi / 2, 300), (math.radians(150), 150), (math.radians(30), 150))):
                half = length / R / 2
                ring_hall(f'hall_{idx}_{k}', cx, cy, R - 12, R + 30, WALL_H, mats, roof, (mid_a - half, mid_a + half))
        if 'dome' in it:
            bm = bmesh.new()
            res = bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=0.45 * outer)
            bmesh.ops.delete(bm, geom=[v for v in res['verts'] if v.co.z < -0.01], context='VERTS')
            for v in bm.verts:
                v.co = Vector((cx + v.co.x, cy + v.co.y, WALL_H + 1 + 0.45 * v.co.z))
            dome = bpy.data.materials.new(f'dome_{idx}')
            dome.use_nodes = True
            bsdf(dome).inputs['Base Color'].default_value = (*linear(it['dome']), 1)
            bsdf(dome).inputs['Metallic'].default_value = 0.3
            bsdf(dome).inputs['Roughness'].default_value = 0.5
            new_obj(f'dome_{idx}', bm, [dome], smooth=True)
        if form != 'buried':  # perimeter service road, clear of the annexes
            bm = bmesh.new()
            n = int(min(1024, max(64, 2 * math.pi * outer / 3)))
            r0, r1 = outer + 30, outer + 36
            ring = [(bm.verts.new((cx + r0 * math.cos(a), cy + r0 * math.sin(a), 0.06)), bm.verts.new((cx + r1 * math.cos(a), cy + r1 * math.sin(a), 0.06)))
                    for a in (2 * math.pi * j / n for j in range(n))]
            for j in range(n):
                (a0, a1), (b0, b1) = ring[j], ring[(j + 1) % n]
                bm.faces.new((a0, b0, b1, a1))
            new_obj(f'ringroad_{idx}', bm, [mats['asphalt']])
        if form == 'ring' and inner > 40:  # booster ring in the open courtyard
            rb = min(0.3 * inner, 60)
            ring_hall(f'booster_{idx}', cx, cy + 0.25 * inner, rb - 4, rb + 4, 5.0, mats, roof)

        bm = bmesh.new()  # roof plant, skylights, annexes, office
        if form != 'buried':
            for _ in range(int(2 * math.pi * R / 14)):
                a = random.uniform(0, 2 * math.pi)
                r = random.uniform(max(inner + 3, 0.5 * outer if 'dome' in it else 0), outer - 3)
                s = random.uniform(2, 5)
                box(bm, (cx + r * math.cos(a), cy + r * math.sin(a), WALL_H + 1.2), (s, s * random.uniform(0.6, 1.4), random.uniform(1.2, 2.4)), a, 0)
            for _ in range(max(2, int(R / 40))):
                a = random.uniform(0.15 * math.pi, 1.35 * math.pi) if random.random() < 0.8 else random.uniform(0, 2 * math.pi)
                d, w = random.uniform(12, 24), random.uniform(15, 35)
                r = outer + d / 2
                box(bm, (cx + r * math.cos(a), cy + r * math.sin(a), 4), (d, w, 8), a, 1)
                keep_out.append((cx + r * math.cos(a), cy + r * math.sin(a), max(d, w) * 0.75))
        if form == 'ring':
            mid = (inner + outer) / 2
            n_sky = int(2 * math.pi * mid / 9)
            for k in range(n_sky):  # skylight strip along the roof ridge
                a = 2 * math.pi * k / n_sky
                box(bm, (cx + mid * math.cos(a), cy + mid * math.sin(a), WALL_H + min(2.5, 0.06 * (outer - inner)) + 0.2), (2.2, 4.5, 0.5), a, 2)
        ow = min(70.0, 1.1 * outer)
        box(bm, (cx - 12 - ow / 2, FRONT * 0.5, 7.2), (ow, 20, 14.4), 0, 1)
        new_obj(f'plant_{idx}', bm, [mats['hvac'], mats['office'], mats['glass']])

        pw = min(90.0, 1.2 * outer)
        x0, y0 = cx + 10, ROAD_W / 2 + 12
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new()
        rect(bm, x0, y0, x0 + pw, y0 + 32, 0.07, uv)
        new_obj(f'parking_{idx}', bm, [mats['parking']])
        for k in range(int(pw / 2.6)):
            for row in (2.5, 13.5, 18.5, 29.5):
                if random.random() < 0.7:
                    car_pts.append((x0 + 1.3 + 2.6 * k, y0 + row, 0.07))

    def blocked(x, y):
        if abs(y) < ROAD_W / 2 + 6:
            return 'road'
        if -L / 2 - 12 < x < L / 2 + 12 and py - W / 2 - 12 < y < py + W / 2 + 12:
            return 'pitch'
        for it in items:
            d = math.hypot(x - it['cx'], y - it['cy'])
            if it['inner'] - 5 < d < it['outer'] + 8 or it['outer'] + 26 < d < it['outer'] + 40:
                return 'hall'
            if abs(x - it['cx']) < 12 + min(90.0, 1.2 * it['outer']) + 20 and y < FRONT + 4:
                return 'front'
            if d < it['inner'] - 5:
                return 'court'
        for kx, ky, kr in keep_out:
            if math.hypot(x - kx, y - ky) < kr:
                return 'annex'
        return None

    tree_pts, step, pad = [], 7.0, 700
    y = y_min - pad
    while y < y_max + pad:
        x = x_min - pad
        while x < x_max + pad:
            px, py_ = x + random.uniform(-3, 3), y + random.uniform(-3, 3)
            b = blocked(px, py_)
            if b in (None, 'court'):
                wood = noise.noise(Vector((px / 220, py_ / 220, 0.37))) + 0.4 * noise.noise(Vector((px / 60, py_ / 60, 1.7)))
                p = 0.85 if wood > 0.15 else 0.025
                if b == 'court':
                    p *= 0.25
                if not (x_min < px < x_max and y_min < py_ < y_max):
                    p *= 0.45
                if random.random() < p:
                    tree_pts.append((px, py_, 0.03))
            x += step
        y += step
    random.shuffle(tree_pts)
    scatter(points_obj('trees', tree_pts), trees, True, (0.7, 1.35))
    scatter(points_obj('cars', car_pts), cars, False, (0.95, 1.05))
    print(f'trees: {len(tree_pts)}  cars: {len(car_pts)}')


# ---------------------------------------------------------------- world, render

def world_and_render(samples):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('sky')
    w.use_nodes = True
    sc.world = w
    nt = w.node_tree
    sky = nt.nodes.new('ShaderNodeTexSky')
    types = [e.identifier for e in sky.bl_rna.properties['sky_type'].enum_items]
    sky.sky_type = next(t for t in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING') if t in types)
    for k, v in dict(sun_disc=False, sun_elevation=math.radians(32), sun_rotation=math.radians(215),
                     altitude=200.0, air_density=1.0, ozone_density=1.0).items():
        if hasattr(sky, k):
            setattr(sky, k, v)
    for k in ('dust_density', 'aerosol_density'):
        if hasattr(sky, k):
            setattr(sky, k, 2.0)
    bg = nt.nodes['Background']
    bg.inputs['Strength'].default_value = 0.35
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    if '--no-haze' not in ARGS:  # aerial perspective in a bounded slab (a world volume would also swallow the sun)
        m = bpy.data.materials.new('haze')
        m.use_nodes = True
        m.node_tree.nodes.remove(m.node_tree.nodes['Principled BSDF'])
        vol = m.node_tree.nodes.new('ShaderNodeVolumeScatter')
        vol.inputs['Density'].default_value = float(arg('--haze-density', 0.0001))
        vol.inputs['Color'].default_value = (0.88, 0.92, 1.0, 1)
        m.node_tree.links.new(vol.outputs[0], m.node_tree.nodes['Material Output'].inputs['Volume'])
        bm = bmesh.new()
        box(bm, (0, 0, 225), (40000, 40000, 550))  # bottom below the ground: a coplanar face shadows it
        new_obj('haze', bm, [m])

    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(0.6)
    sun.data.color = (1.0, 0.93, 0.83)
    el, az = math.radians(32), math.radians(215)
    to_sun = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    sun.rotation_euler = to_sun.to_track_quat('Z', 'Y').to_euler()
    sc.collection.objects.link(sun)

    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = 'GPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.caustics_reflective = sc.cycles.caustics_refractive = False
    sc.render.use_persistent_data = True
    sc.render.use_motion_blur = True  # camera-only blur, smooths the ring-to-ring moves
    sc.render.motion_blur_shutter = 0.5
    vs = sc.view_settings
    vs.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
        try:
            vs.look = look
            break
        except TypeError:
            pass
    vs.exposure = float(arg('--exposure', -0.4))


# ---------------------------------------------------------------- camera

def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (6 * t - 15) + 10)


def ease(t):
    """Sine ease-in-out: peak speed 1.57x the average (smootherstep's is 1.88x)."""
    return (1 - math.cos(math.pi * min(1.0, max(0.0, t)))) / 2


def camera(items):
    sc = bpy.context.scene
    T = DATA['timing']
    fps = T['fps']
    portrait = FORMAT == 'portrait'
    sc.render.resolution_x, sc.render.resolution_y = (1080, 1920) if portrait else (1920, 1080)
    sc.render.fps = fps
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36
    cam.data.lens = 40 if portrait else 30
    cam.data.clip_start, cam.data.clip_end = 1.0, 60000
    sc.collection.objects.link(cam)
    sc.camera = cam
    hf = 2 * math.atan(18 / cam.data.lens)
    aspect = sc.render.resolution_y / sc.render.resolution_x
    vf = 2 * math.atan(math.tan(hf / 2) * aspect)
    el_shot = math.radians(46 if portrait else 34)

    L = DATA['scaleRef']['lengthM']
    W = DATA['scaleRef']['widthM']
    shots = [dict(target=Vector((0, 25 + W / 2, 0)), size=L * 1.15)]
    shots += [dict(target=Vector((it['cx'], it['cy'], 0)), size=it['extent']) for it in items]

    def state(i, h):
        """Camera state on shot i, h in [0, 1] through its hold (slow push-in)."""
        s = shots[i]
        dist = s['size'] * 1.18 / 2 / math.tan(hf / 2) * (1 - 0.05 * h)
        return s['target'], dist, math.radians(3 * h), el_shot, 0.0

    x0, x1 = -L / 2 - 20, items[-1]['cx'] + items[-1]['outer'] + 20
    y1 = max(i['cy'] + i['outer'] for i in items)
    over_target = Vector(((x0 + x1) / 2, (0 + y1) / 2, 0))
    span = x1 - x0
    # Portrait: fit the row into 16-72% of the height, between the outro question
    # (top ~15%) and the channel line above the Shorts overlay (src/SizeCompare.tsx).
    over_dist = (span / 0.56 / 2 / math.tan(vf / 2)) if portrait else (span * 1.06 / 2 / math.tan(hf / 2))
    if portrait:  # row centre at 44% from the top; screen up is +X in the top-down view
        over_target.x -= 0.06 * 2 * over_dist * math.tan(vf / 2)

    def over(h):
        return over_target, over_dist * (1 - 0.03 * h), 0.0, math.radians(89.9), 1.0

    def lerp_state(a, b, s, lift=0.0):
        t = a[0].lerp(b[0], s)
        d = math.exp(math.log(a[1]) + (math.log(b[1]) - math.log(a[1])) * s) * (1 + lift * math.sin(math.pi * s))
        return t, d, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s, a[4] + (b[4] - a[4]) * s

    intro, move, hold = (round(T[k] * fps) for k in ('introS', 'moveS', 'holdS'))
    omove, ohold = round(T['outroMoveS'] * fps), round(T['outroHoldS'] * fps)
    n = len(items)
    total = intro + n * (move + hold) + omove + ohold
    sc.frame_start, sc.frame_end = 1, total

    def at(f):
        if f < intro:
            return state(0, f / intro)
        k = f - intro
        i = k // (move + hold)
        if i < n:
            loc = k - i * (move + hold)
            if loc < move:
                return lerp_state(state(i, 1), state(i + 1, 0), ease(loc / move), lift=0.45)
            return state(i + 1, (loc - move) / hold)
        k -= n * (move + hold)
        if k < omove:
            return lerp_state(state(n, 1), over(0), smooth(k / omove))
        return over((k - omove) / ohold)

    up_final = Vector((1, 0, 0)) if portrait else Vector((0, 1, 0))
    prev = None
    for f in range(total):
        target, dist, az_off, el, up_mix = at(f)
        az = math.radians(-90 - 10 + 16 * f / total) + az_off
        pos = target + dist * Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        fwd = (target - pos).normalized()
        up = Vector((0, 0, 1)).lerp(up_final, up_mix * up_mix).normalized()
        right = fwd.cross(up).normalized()
        tup = right.cross(fwd)
        rot = Matrix((right, tup, -fwd)).transposed().to_euler('XYZ', prev) if prev else \
            Matrix((right, tup, -fwd)).transposed().to_euler('XYZ')
        prev = rot
        cam.location = pos
        cam.rotation_euler = rot
        cam.keyframe_insert('location', frame=f + 1)
        cam.keyframe_insert('rotation_euler', frame=f + 1)
    return total


# ---------------------------------------------------------------- main

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    samples = int(arg('--samples', 16))
    items = layout()
    mats = make_materials(campus_bounds(items))
    build(items, mats)
    world_and_render(samples)
    total = camera(items)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'scene.blend'))
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    still = arg('--still')
    if still is not None:
        sc.render.resolution_percentage = int(arg('--scale', 50))
        sc.frame_set(int(still))
        sc.render.filepath = os.path.join(OUT, 'stills', f'f{int(still):04d}.png')
        bpy.ops.render.render(write_still=True)
    elif '--render' in ARGS:
        if arg('--range'):  # e.g. 1051-1095, for previews
            sc.frame_start, sc.frame_end = map(int, arg('--range').split('-'))
        sc.render.resolution_percentage = int(arg('--scale', 100))
        sc.render.filepath = os.path.join(OUT, arg('--frames-dir', 'frames'), 'f_')
        sc.render.use_overwrite = False
        sc.render.use_placeholder = True
        bpy.ops.render.render(animation=True)
    print(f'frames: {total}')


main()
