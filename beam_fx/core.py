# SPDX-License-Identifier: GPL-3.0-or-later
"""Applying, updating and removing the effect on objects."""

import bpy
from mathutils import Vector

from . import nodes
from .nodes import PROP_MAX, PROP_MIN, PROP_PROGRESS, PROP_TIME

SUPPORTED_TYPES = {"MESH", "CURVE", "SURFACE", "META", "FONT"}
BASE_MATERIAL = "BFX Base"


def _path(prop):
    return '["%s"]' % prop


def is_applied(obj):
    return obj is not None and PROP_PROGRESS in obj.keys()


def materials(obj):
    seen = []
    for slot in obj.material_slots:
        if slot.material is not None and slot.material not in seen:
            seen.append(slot.material)
    return seen


def look_values(s):
    """Map the object's settings onto the node group inputs."""
    axis = Vector({"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[s.axis])
    if s.invert:
        axis = -axis
    common = {
        "Axis": axis,
        "Noise Scale": s.noise_scale,
        "Noise Amount": s.noise_amount,
    }
    if s.effect == "REVEAL":
        common.update({
            "Wire Color": s.wire_color,
            "Wire Strength": s.wire_strength,
            "Edge Color": s.edge_color,
            "Edge Strength": s.edge_strength,
            "Wire Width": s.wire_width,
            "Edge Width": s.edge_width,
            "Softness": s.softness,
            "Wire Style": 1.0 if s.wire_style == "GRID" else 0.0,
            "Wire Thickness": s.wire_thickness,
            "Grid Density": s.grid_density,
        })
    elif s.effect == "SCAN":
        common.update({
            "Band Color": s.band_color,
            "Band Strength": s.band_strength,
            "Band Width": s.band_width,
            "Line Density": s.scan_line_density,
            "Line Strength": s.scan_line_strength,
            "Trail Length": s.trail_length,
            "Trail Strength": s.trail_strength,
            "Reveal": 1.0 if s.scan_reveal else 0.0,
        })
    else:
        common.update({
            "Holo Color": s.holo_color,
            "Holo Strength": s.holo_strength,
            "Base Opacity": s.holo_opacity,
            "Rim Power": s.rim_power,
            "Line Density": s.holo_line_density,
            "Line Speed": s.holo_line_speed,
            "Line Strength": s.holo_line_strength,
            "Flicker Amount": s.flicker_amount,
            "Flicker Speed": s.flicker_speed,
            "Original Mix": s.original_mix,
            "Edge Color": s.edge_color,
            "Edge Strength": s.edge_strength,
            "Edge Width": s.edge_width,
        })
    return common


def push_look(obj):
    if not is_applied(obj):
        return
    values = look_values(obj.bfx)
    for mat in materials(obj):
        node = nodes.find_effect_node(mat)
        if node is not None:
            nodes.set_inputs(node, values)


# ---------------------------------------------------------------------------
# Animation helpers (work with both legacy and slotted actions)
# ---------------------------------------------------------------------------

def _fcurves(obj):
    ad = obj.animation_data
    if ad is None or ad.action is None:
        return None
    act = ad.action
    slot = getattr(ad, "action_slot", None)
    if slot is not None:
        try:
            from bpy_extras.anim_utils import action_get_channelbag_for_slot
        except ImportError:
            action_get_channelbag_for_slot = None
        if action_get_channelbag_for_slot is not None:
            bag = action_get_channelbag_for_slot(act, slot)
            return bag.fcurves if bag is not None else None
    return getattr(act, "fcurves", None)


def _remove_keys(obj, prop):
    curves = _fcurves(obj)
    if curves is None:
        return
    fc = curves.find(_path(prop))
    if fc is not None:
        curves.remove(fc)


def _animate_progress(obj, s):
    _remove_keys(obj, PROP_PROGRESS)
    start, end = s.frame_start, max(s.frame_end, s.frame_start + 1)
    a, b = (0.0, 1.0) if s.direction == "IN" else (1.0, 0.0)
    obj[PROP_PROGRESS] = a
    obj.keyframe_insert(_path(PROP_PROGRESS), frame=start)
    obj[PROP_PROGRESS] = b
    obj.keyframe_insert(_path(PROP_PROGRESS), frame=end)
    curves = _fcurves(obj)
    fc = curves.find(_path(PROP_PROGRESS)) if curves is not None else None
    if fc is not None:
        for kp in fc.keyframe_points:
            kp.interpolation = s.easing
        fc.update()


def _drive_time(obj):
    """bfx_time = seconds since frame 0, used for scrolling lines and flicker."""
    obj.driver_remove(_path(PROP_TIME))
    fc = obj.driver_add(_path(PROP_TIME))
    drv = fc.driver
    drv.type = "SCRIPTED"
    var = drv.variables.new()
    var.name = "fps"
    var.type = "SINGLE_PROP"
    var.targets[0].id_type = "SCENE"
    var.targets[0].id = bpy.context.scene
    var.targets[0].data_path = "render.fps"
    # Simple expression: evaluates without "Auto Run Python Scripts".
    drv.expression = "frame / fps"


def _bounds(obj, s):
    axis = look_values(s)["Axis"]
    values = [Vector(c).dot(axis) for c in obj.bound_box]
    lo, hi = min(values), max(values)
    if hi - lo < 1e-6:
        hi = lo + 1.0
    return lo, hi


def _ensure_material(obj):
    if obj.data is None or not hasattr(obj.data, "materials"):
        return
    if not obj.material_slots or all(sl.material is None for sl in obj.material_slots):
        base = bpy.data.materials.get(BASE_MATERIAL)
        if base is None:
            base = bpy.data.materials.new(BASE_MATERIAL)
            base.use_nodes = True
        if not obj.material_slots:
            obj.data.materials.append(base)
        else:
            for sl in obj.material_slots:
                sl.material = base


def _set_prop(obj, name, value, lo=None, hi=None):
    obj[name] = float(value)
    if lo is not None:
        ui = obj.id_properties_ui(name)
        ui.update(min=lo, max=hi, soft_min=lo, soft_max=hi)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply(obj):
    s = obj.bfx
    _ensure_material(obj)

    lo, hi = _bounds(obj, s)
    _set_prop(obj, PROP_MIN, lo)
    _set_prop(obj, PROP_MAX, hi)
    _set_prop(obj, PROP_PROGRESS, obj.get(PROP_PROGRESS, 0.0), 0.0, 1.0)
    if PROP_TIME not in obj.keys():
        _set_prop(obj, PROP_TIME, 0.0)

    values = look_values(s)
    for mat in materials(obj):
        node = nodes.attach(mat, s.effect)
        nodes.set_inputs(node, values)
        nodes.set_transparency(mat)

    _animate_progress(obj, s)
    if s.effect == "HOLOGRAM":
        _drive_time(obj)
    else:
        obj.driver_remove(_path(PROP_TIME))
    obj.update_tag()


def refresh_bounds(obj):
    if is_applied(obj):
        lo, hi = _bounds(obj, obj.bfx)
        obj[PROP_MIN] = lo
        obj[PROP_MAX] = hi
        obj.update_tag()


def remove(obj):
    for mat in materials(obj):
        nodes.detach(mat)
    _remove_keys(obj, PROP_PROGRESS)
    obj.driver_remove(_path(PROP_TIME))
    for name in (PROP_PROGRESS, PROP_MIN, PROP_MAX, PROP_TIME):
        if name in obj.keys():
            del obj[name]
    obj.update_tag()


def copy_settings(src, dst):
    for prop in src.bfx.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.is_readonly:
            continue
        value = getattr(src.bfx, prop.identifier)
        if getattr(prop, "is_array", False):
            value = tuple(value)
        setattr(dst.bfx, prop.identifier, value)
