# SPDX-License-Identifier: GPL-3.0-or-later
"""Builds the shader node groups that drive each effect.

Every effect is a node group with a "Shader" input (the object's original
surface) and a "Shader" output. Per-object values (animation progress, object
bounds, time) are read from object custom properties through Attribute nodes,
so one material can be shared by many objects that animate independently.
"""

import math

import bpy

GROUP_VERSION = 1
NODE_NAME = "BFX Effect"

# Object custom properties read by the shaders.
PROP_PROGRESS = "bfx_progress"
PROP_MIN = "bfx_min"
PROP_MAX = "bfx_max"
PROP_TIME = "bfx_time"


def group_name(effect):
    return "BFX_%s_v%d" % (effect.title(), GROUP_VERSION)


class _Builder:
    """Small helper to create and wire nodes without boilerplate."""

    def __init__(self, tree):
        self.tree = tree
        self.count = 0

    def node(self, bl_idname, **props):
        n = self.tree.nodes.new(bl_idname)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (200 * (self.count // 10), -160 * (self.count % 10))
        self.count += 1
        return n

    def feed(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        elif value is not None:
            socket.default_value = value

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        if c is not None:
            self.feed(n.inputs[2], c)
        return n.outputs[0]

    def vmath(self, op, a, b=None):
        n = self.node("ShaderNodeVectorMath", operation=op)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        return n.outputs["Value"] if op == "DOT_PRODUCT" else n.outputs["Vector"]

    def maprange(self, value, fmin, fmax, tmin, tmax, smooth=True, clamp=True):
        n = self.node(
            "ShaderNodeMapRange",
            data_type="FLOAT",
            interpolation_type="SMOOTHSTEP" if smooth else "LINEAR",
            clamp=clamp,
        )
        # Float sockets come first; vector variants share names, so use indices.
        for i, v in enumerate((value, fmin, fmax, tmin, tmax)):
            self.feed(n.inputs[i], v)
        return n.outputs[0]

    def attr(self, name):
        n = self.node("ShaderNodeAttribute", attribute_type="OBJECT", attribute_name=name)
        return n.outputs["Fac"]

    def emission(self, color, strength):
        n = self.node("ShaderNodeEmission")
        self.feed(n.inputs["Color"], color)
        self.feed(n.inputs["Strength"], strength)
        return n.outputs[0]

    def transparent(self):
        return self.node("ShaderNodeBsdfTransparent").outputs[0]

    def mix_shader(self, fac, a, b):
        n = self.node("ShaderNodeMixShader")
        self.feed(n.inputs[0], fac)
        self.feed(n.inputs[1], a)
        self.feed(n.inputs[2], b)
        return n.outputs[0]

    def add_shader(self, a, b):
        n = self.node("ShaderNodeAddShader")
        self.feed(n.inputs[0], a)
        self.feed(n.inputs[1], b)
        return n.outputs[0]


# name, socket type, default, min, max
_COMMON_INPUTS = [
    ("Axis", "NodeSocketVector", (0.0, 0.0, 1.0), None, None),
    ("Noise Scale", "NodeSocketFloat", 4.0, 0.0, 1000.0),
    ("Noise Amount", "NodeSocketFloat", 0.0, 0.0, 1.0),
]

_INPUTS = {
    "REVEAL": [
        ("Wire Color", "NodeSocketColor", (0.1, 0.8, 1.0, 1.0), None, None),
        ("Wire Strength", "NodeSocketFloat", 3.0, 0.0, 1000.0),
        ("Edge Color", "NodeSocketColor", (0.6, 0.95, 1.0, 1.0), None, None),
        ("Edge Strength", "NodeSocketFloat", 8.0, 0.0, 1000.0),
        ("Wire Width", "NodeSocketFloat", 0.25, 0.0, 1.0),
        ("Edge Width", "NodeSocketFloat", 0.02, 0.0001, 1.0),
        ("Softness", "NodeSocketFloat", 0.005, 0.0001, 1.0),
        ("Wire Style", "NodeSocketFloat", 0.0, 0.0, 1.0),
        ("Wire Thickness", "NodeSocketFloat", 0.01, 0.0, 10.0),
        ("Grid Density", "NodeSocketFloat", 10.0, 0.0, 1000.0),
    ],
    "SCAN": [
        ("Band Color", "NodeSocketColor", (0.1, 0.8, 1.0, 1.0), None, None),
        ("Band Strength", "NodeSocketFloat", 5.0, 0.0, 1000.0),
        ("Band Width", "NodeSocketFloat", 0.06, 0.0001, 1.0),
        ("Line Density", "NodeSocketFloat", 60.0, 0.0, 10000.0),
        ("Line Strength", "NodeSocketFloat", 0.5, 0.0, 1.0),
        ("Trail Length", "NodeSocketFloat", 0.15, 0.0001, 1.0),
        ("Trail Strength", "NodeSocketFloat", 0.08, 0.0, 100.0),
        ("Reveal", "NodeSocketFloat", 0.0, 0.0, 1.0),
    ],
    "HOLOGRAM": [
        ("Holo Color", "NodeSocketColor", (0.1, 0.8, 1.0, 1.0), None, None),
        ("Holo Strength", "NodeSocketFloat", 1.5, 0.0, 1000.0),
        ("Base Opacity", "NodeSocketFloat", 0.15, 0.0, 1.0),
        ("Rim Power", "NodeSocketFloat", 2.0, 0.01, 20.0),
        ("Line Density", "NodeSocketFloat", 80.0, 0.0, 10000.0),
        ("Line Speed", "NodeSocketFloat", 0.5, -100.0, 100.0),
        ("Line Strength", "NodeSocketFloat", 0.5, 0.0, 1.0),
        ("Flicker Amount", "NodeSocketFloat", 0.15, 0.0, 1.0),
        ("Flicker Speed", "NodeSocketFloat", 8.0, 0.0, 100.0),
        ("Original Mix", "NodeSocketFloat", 0.0, 0.0, 1.0),
        ("Edge Color", "NodeSocketColor", (0.6, 0.95, 1.0, 1.0), None, None),
        ("Edge Strength", "NodeSocketFloat", 8.0, 0.0, 1000.0),
        ("Edge Width", "NodeSocketFloat", 0.02, 0.0001, 1.0),
    ],
}


def _make_interface(tree, effect):
    iface = tree.interface
    iface.new_socket("Shader", in_out="OUTPUT", socket_type="NodeSocketShader")
    iface.new_socket("Shader", in_out="INPUT", socket_type="NodeSocketShader")
    for name, stype, default, lo, hi in _INPUTS[effect] + _COMMON_INPUTS:
        sock = iface.new_socket(name, in_out="INPUT", socket_type=stype)
        sock.default_value = default
        if lo is not None:
            sock.min_value = lo
            sock.max_value = hi


def _height(b, gi):
    """Normalized 0..1 position along the axis, plus noise. Returns (h, object coords)."""
    obj = b.node("ShaderNodeTexCoord").outputs["Object"]
    raw = b.vmath("DOT_PRODUCT", obj, gi.outputs["Axis"])
    h = b.maprange(raw, b.attr(PROP_MIN), b.attr(PROP_MAX), 0.0, 1.0, smooth=False, clamp=False)
    noise = b.node("ShaderNodeTexNoise")
    b.feed(noise.inputs["Vector"], obj)
    b.feed(noise.inputs["Scale"], gi.outputs["Noise Scale"])
    offset = b.math("MULTIPLY", b.math("SUBTRACT", noise.outputs["Fac"], 0.5), gi.outputs["Noise Amount"])
    return b.math("ADD", h, offset), obj


def _front(b, gi, progress, extra_width, margin):
    """Map progress 0..1 to a front that starts fully before and ends fully after the object.

    front = progress * (1 + extra_width + 2 * margin) - margin
    """
    span = b.math("ADD", b.math("ADD", 1.0, extra_width), b.math("MULTIPLY", margin, 2.0))
    return b.math("SUBTRACT", b.math("MULTIPLY", progress, span), margin)


def _margin(b, gi, width):
    return b.math("ADD", width, b.math("MULTIPLY", gi.outputs["Noise Amount"], 0.5))


def _build_reveal(b, gi, go):
    h, obj = _height(b, gi)
    p = b.attr(PROP_PROGRESS)
    soft = b.math("MAXIMUM", gi.outputs["Softness"], 0.0001)
    edge_w = b.math("MAXIMUM", gi.outputs["Edge Width"], 0.0001)
    wire_w = gi.outputs["Wire Width"]

    margin = b.math("ADD", _margin(b, gi, edge_w), soft)
    wire_front = _front(b, gi, p, wire_w, margin)
    solid_front = b.math("SUBTRACT", wire_front, wire_w)

    solid = b.maprange(h, b.math("SUBTRACT", solid_front, soft), b.math("ADD", solid_front, soft), 1.0, 0.0)
    wire_zone = b.maprange(h, b.math("SUBTRACT", wire_front, soft), b.math("ADD", wire_front, soft), 1.0, 0.0)

    edge = b.maprange(b.math("ABSOLUTE", b.math("SUBTRACT", h, solid_front)), 0.0, edge_w, 1.0, 0.0)
    lead = b.maprange(
        b.math("ABSOLUTE", b.math("SUBTRACT", h, wire_front)), 0.0, b.math("MULTIPLY", edge_w, 0.5), 0.6, 0.0
    )
    glow = b.math("ADD", edge, lead, clamp=True)

    # Wire pattern: real mesh edges, or a procedural grid (works the same in every engine).
    thickness = gi.outputs["Wire Thickness"]
    wf = b.node("ShaderNodeWireframe", use_pixel_size=False)
    b.feed(wf.inputs["Size"], thickness)
    mesh_wire = wf.outputs["Fac"]

    density = b.math("MAXIMUM", gi.outputs["Grid Density"], 0.0001)
    comb = b.node("ShaderNodeCombineXYZ")
    for i in range(3):
        b.feed(comb.inputs[i], density)
    cell = b.vmath("MULTIPLY", obj, comb.outputs[0])
    frac = b.vmath("SUBTRACT", b.vmath("FRACTION", b.vmath("ADD", cell, (0.5, 0.5, 0.5))), (0.5, 0.5, 0.5))
    sep = b.node("ShaderNodeSeparateXYZ")
    b.feed(sep.inputs[0], b.vmath("ABSOLUTE", frac))
    dist = b.math("MINIMUM", b.math("MINIMUM", sep.outputs[0], sep.outputs[1]), sep.outputs[2])
    dist_m = b.math("DIVIDE", dist, density)
    grid_wire = b.maprange(dist_m, 0.0, b.math("MULTIPLY", thickness, 0.5), 1.0, 0.0)

    style = gi.outputs["Wire Style"]
    wire = b.math("ADD", mesh_wire, b.math("MULTIPLY", style, b.math("SUBTRACT", grid_wire, mesh_wire)))
    wire_vis = b.math("MULTIPLY", wire, wire_zone)

    wire_sh = b.mix_shader(
        wire_vis, b.transparent(), b.emission(gi.outputs["Wire Color"], gi.outputs["Wire Strength"])
    )
    base = b.mix_shader(solid, wire_sh, gi.outputs["Shader"])
    glow_sh = b.emission(gi.outputs["Edge Color"], b.math("MULTIPLY", gi.outputs["Edge Strength"], glow))
    b.feed(go.inputs[0], b.add_shader(base, glow_sh))


def _build_scan(b, gi, go):
    h, _obj = _height(b, gi)
    p = b.attr(PROP_PROGRESS)
    band_w = b.math("MAXIMUM", gi.outputs["Band Width"], 0.0001)
    trail_l = b.math("MAXIMUM", gi.outputs["Trail Length"], 0.0001)

    center = _front(b, gi, p, 0.0, _margin(b, gi, band_w))
    band = b.maprange(b.math("ABSOLUTE", b.math("SUBTRACT", h, center)), 0.0, band_w, 1.0, 0.0)

    # Scan lines inside the band.
    phase = b.math("MULTIPLY", h, b.math("MULTIPLY", gi.outputs["Line Density"], 2.0 * math.pi))
    lines = b.math("POWER", b.maprange(b.math("SINE", phase), -1.0, 1.0, 0.0, 1.0, smooth=False), 4.0)
    ls = gi.outputs["Line Strength"]
    band = b.math("MULTIPLY", band, b.math("ADD", b.math("SUBTRACT", 1.0, ls), b.math("MULTIPLY", ls, lines)))

    # Fading trail behind the band.
    behind = b.math("SUBTRACT", center, h)
    trail = b.math(
        "MULTIPLY",
        b.maprange(behind, 0.0, trail_l, 1.0, 0.0),
        b.math("GREATER_THAN", behind, 0.0),
    )
    intensity = b.math("ADD", band, b.math("MULTIPLY", trail, gi.outputs["Trail Strength"]))

    # Optional reveal: the object only exists behind the band.
    below = b.maprange(h, b.math("SUBTRACT", center, band_w), center, 1.0, 0.0)
    reveal = gi.outputs["Reveal"]
    visible = b.math("ADD", b.math("SUBTRACT", 1.0, reveal), b.math("MULTIPLY", reveal, below))

    base = b.mix_shader(visible, b.transparent(), gi.outputs["Shader"])
    glow = b.emission(gi.outputs["Band Color"], b.math("MULTIPLY", gi.outputs["Band Strength"], intensity))
    b.feed(go.inputs[0], b.add_shader(base, glow))


def _build_hologram(b, gi, go):
    h, _obj = _height(b, gi)
    p = b.attr(PROP_PROGRESS)
    t = b.attr(PROP_TIME)

    lw = b.node("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    rim = b.math("POWER", lw.outputs["Facing"], gi.outputs["Rim Power"])

    phase = b.math(
        "MULTIPLY",
        b.math("ADD", b.math("MULTIPLY", h, gi.outputs["Line Density"]), b.math("MULTIPLY", t, gi.outputs["Line Speed"])),
        2.0 * math.pi,
    )
    lines = b.math("POWER", b.maprange(b.math("SINE", phase), -1.0, 1.0, 0.0, 1.0, smooth=False), 3.0)

    flick = b.node("ShaderNodeTexNoise", noise_dimensions="1D")
    flick.inputs["Scale"].default_value = 1.0
    b.feed(flick.inputs["W"], b.math("MULTIPLY", t, gi.outputs["Flicker Speed"]))
    flicker = b.math("SUBTRACT", 1.0, b.math("MULTIPLY", gi.outputs["Flicker Amount"], flick.outputs["Fac"]))

    alpha = b.math(
        "ADD",
        b.math("ADD", gi.outputs["Base Opacity"], rim),
        b.math("MULTIPLY", lines, gi.outputs["Line Strength"]),
        clamp=True,
    )
    alpha = b.math("MULTIPLY", alpha, flicker, clamp=True)

    holo = b.mix_shader(alpha, b.transparent(), b.emission(gi.outputs["Holo Color"], gi.outputs["Holo Strength"]))
    holo = b.mix_shader(gi.outputs["Original Mix"], holo, gi.outputs["Shader"])

    # Materialize along the axis as progress goes 0 -> 1.
    edge_w = b.math("MAXIMUM", gi.outputs["Edge Width"], 0.0001)
    front = _front(b, gi, p, 0.0, _margin(b, gi, edge_w))
    visible = b.maprange(h, b.math("SUBTRACT", front, b.math("MULTIPLY", edge_w, 0.5)), front, 1.0, 0.0)
    edge = b.maprange(b.math("ABSOLUTE", b.math("SUBTRACT", h, front)), 0.0, edge_w, 1.0, 0.0)

    base = b.mix_shader(visible, b.transparent(), holo)
    glow = b.emission(gi.outputs["Edge Color"], b.math("MULTIPLY", gi.outputs["Edge Strength"], edge))
    b.feed(go.inputs[0], b.add_shader(base, glow))


_BUILDERS = {
    "REVEAL": _build_reveal,
    "SCAN": _build_scan,
    "HOLOGRAM": _build_hologram,
}


def ensure_group(effect):
    name = group_name(effect)
    tree = bpy.data.node_groups.get(name)
    if tree is not None:
        return tree
    tree = bpy.data.node_groups.new(name, "ShaderNodeTree")
    _make_interface(tree, effect)
    b = _Builder(tree)
    gi = b.node("NodeGroupInput")
    go = b.node("NodeGroupOutput")
    _BUILDERS[effect](b, gi, go)
    gi.location = (-400, 0)
    go.location = (200 * (b.count // 10 + 1), 0)
    return tree


# ---------------------------------------------------------------------------
# Material wiring
# ---------------------------------------------------------------------------

def _output_node(tree):
    outs = [n for n in tree.nodes if n.bl_idname == "ShaderNodeOutputMaterial"]
    for n in outs:
        if n.is_active_output:
            return n
    return outs[0] if outs else None


def find_effect_node(mat):
    if mat is None or not mat.use_nodes or mat.node_tree is None:
        return None
    n = mat.node_tree.nodes.get(NODE_NAME)
    return n if n is not None and n.bl_idname == "ShaderNodeGroup" else None


def attach(mat, effect):
    """Insert (or retarget) the effect node between the surface and the output."""
    if not mat.use_nodes:
        mat.use_nodes = True
    tree = mat.node_tree
    group = ensure_group(effect)

    node = find_effect_node(mat)
    if node is not None:
        if node.node_tree is not group:
            # Keep what feeds the old node, then swap groups (sockets get rebuilt).
            src = node.inputs["Shader"].links[0].from_socket if node.inputs["Shader"].is_linked else None
            node.node_tree = group
            if src is not None:
                tree.links.new(src, node.inputs["Shader"])
            out = _output_node(tree)
            if out is not None:
                tree.links.new(node.outputs["Shader"], out.inputs["Surface"])
        return node

    out = _output_node(tree)
    if out is None:
        out = tree.nodes.new("ShaderNodeOutputMaterial")
    surface = out.inputs["Surface"]
    if surface.is_linked:
        src = surface.links[0].from_socket
    else:
        src = tree.nodes.new("ShaderNodeBsdfPrincipled").outputs[0]

    node = tree.nodes.new("ShaderNodeGroup")
    node.name = NODE_NAME
    node.label = "Beam FX"
    node.node_tree = group
    node.location = (out.location.x, out.location.y + 220)
    node.width = 200
    tree.links.new(src, node.inputs["Shader"])
    tree.links.new(node.outputs["Shader"], surface)
    return node


def detach(mat):
    node = find_effect_node(mat)
    if node is None:
        return False
    tree = mat.node_tree
    src = node.inputs["Shader"].links[0].from_socket if node.inputs["Shader"].is_linked else None
    targets = [l.to_socket for l in node.outputs["Shader"].links]
    tree.nodes.remove(node)
    if src is not None:
        for sock in targets:
            tree.links.new(src, sock)
    return True


def set_inputs(node, values):
    for name, value in values.items():
        sock = node.inputs.get(name)
        if sock is not None:
            sock.default_value = value


def set_transparency(mat):
    """Let the material show transparency in EEVEE (Cycles needs nothing)."""
    if hasattr(mat, "surface_render_method"):  # EEVEE Next (4.2+)
        mat.surface_render_method = "DITHERED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "HASHED"
    if hasattr(mat, "use_transparent_shadow"):
        mat.use_transparent_shadow = True
    if hasattr(mat, "shadow_method"):
        try:
            mat.shadow_method = "HASHED"
        except TypeError:
            pass
