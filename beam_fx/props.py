# SPDX-License-Identifier: GPL-3.0-or-later
"""Per-object effect settings."""

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, FloatVectorProperty, IntProperty

from . import core


def _upd_look(self, context):
    core.push_look(self.id_data)


def _upd_full(self, context):
    if core.is_applied(self.id_data):
        core.apply(self.id_data)


def _color(name, default, desc=""):
    return FloatVectorProperty(
        name=name, subtype="COLOR", size=4, min=0.0, max=1.0, default=default, description=desc, update=_upd_look
    )


def _float(name, default, lo, hi, desc="", soft_max=None, subtype="NONE"):
    return FloatProperty(
        name=name,
        default=default,
        min=lo,
        max=hi,
        soft_max=hi if soft_max is None else soft_max,
        description=desc,
        subtype=subtype,
        update=_upd_look,
    )


CYAN = (0.1, 0.8, 1.0, 1.0)
PALE = (0.6, 0.95, 1.0, 1.0)


class BFX_Settings(bpy.types.PropertyGroup):
    # --- effect & timing (changing these re-applies the effect) ---
    effect: EnumProperty(
        name="Effect",
        items=[
            ("REVEAL", "Reveal", "Build the object up from a glowing wireframe", "MOD_WIREFRAME", 0),
            ("SCAN", "Scan", "Sweep a glowing scan band across the object", "MOD_LINEART", 1),
            ("HOLOGRAM", "Hologram", "Turn the object into an animated hologram", "LIGHT_AREA", 2),
        ],
        default="REVEAL",
        update=_upd_full,
    )
    axis: EnumProperty(
        name="Axis",
        items=[("X", "X", ""), ("Y", "Y", ""), ("Z", "Z", "")],
        default="Z",
        description="Local axis the effect travels along",
        update=_upd_full,
    )
    invert: BoolProperty(name="Invert", description="Travel in the opposite direction", update=_upd_full)
    direction: EnumProperty(
        name="Direction",
        items=[
            ("IN", "Beam In", "Object appears (progress 0 to 1)"),
            ("OUT", "Beam Out", "Object disappears (progress 1 to 0)"),
        ],
        default="IN",
        update=_upd_full,
    )
    frame_start: IntProperty(name="Start", default=1, update=_upd_full)
    frame_end: IntProperty(name="End", default=60, update=_upd_full)
    easing: EnumProperty(
        name="Easing",
        items=[
            ("LINEAR", "Linear", "Constant speed"),
            ("BEZIER", "Ease In/Out", "Smooth start and stop"),
        ],
        default="BEZIER",
        update=_upd_full,
    )

    # --- shared look ---
    noise_scale: _float("Noise Scale", 4.0, 0.0, 1000.0, "Size of the noise that breaks up the front", soft_max=50.0)
    noise_amount: _float("Noise Amount", 0.0, 0.0, 1.0, "How much noise distorts the front", subtype="FACTOR")

    # --- reveal ---
    wire_color: _color("Wire Color", CYAN)
    wire_strength: _float("Wire Strength", 3.0, 0.0, 1000.0, soft_max=50.0)
    edge_color: _color("Edge Color", PALE, "Color of the glowing build line")
    edge_strength: _float("Edge Strength", 8.0, 0.0, 1000.0, soft_max=100.0)
    wire_width: _float("Wireframe Lead", 0.25, 0.0, 1.0, "How far the wireframe runs ahead of the solid", subtype="FACTOR")
    edge_width: _float("Edge Width", 0.02, 0.0001, 1.0, "Thickness of the glowing line", soft_max=0.2)
    softness: _float("Softness", 0.005, 0.0001, 1.0, "Blur of the solid and wire fronts", soft_max=0.1)
    wire_style: EnumProperty(
        name="Wire Style",
        items=[
            ("MESH", "Mesh Edges", "Use the object's real edges (Cycles; EEVEE support varies by version)"),
            ("GRID", "Grid", "Procedural grid lines, identical in every render engine"),
        ],
        default="MESH",
        update=_upd_look,
    )
    wire_thickness: _float("Wire Thickness", 0.01, 0.0, 10.0, "Line thickness in scene units", soft_max=0.2)
    grid_density: _float("Grid Density", 10.0, 0.0, 1000.0, "Grid lines per unit", soft_max=100.0)

    # --- scan ---
    band_color: _color("Band Color", CYAN)
    band_strength: _float("Band Strength", 5.0, 0.0, 1000.0, soft_max=100.0)
    band_width: _float("Band Width", 0.06, 0.0001, 1.0, "Width of the scan band", soft_max=0.5)
    scan_line_density: _float("Line Density", 60.0, 0.0, 10000.0, "Scan lines inside the band", soft_max=500.0)
    scan_line_strength: _float("Line Strength", 0.5, 0.0, 1.0, subtype="FACTOR")
    trail_length: _float("Trail Length", 0.15, 0.0001, 1.0, "Length of the fading glow behind the band", subtype="FACTOR")
    trail_strength: _float("Trail Strength", 0.08, 0.0, 100.0, soft_max=5.0)
    scan_reveal: BoolProperty(
        name="Reveal Object", description="Object only exists where the band has passed", update=_upd_look
    )

    # --- hologram ---
    holo_color: _color("Holo Color", CYAN)
    holo_strength: _float("Holo Strength", 1.5, 0.0, 1000.0, soft_max=20.0)
    holo_opacity: _float("Base Opacity", 0.15, 0.0, 1.0, subtype="FACTOR")
    rim_power: _float("Rim Power", 2.0, 0.01, 20.0, "Higher values give a thinner glowing rim")
    holo_line_density: _float("Line Density", 80.0, 0.0, 10000.0, soft_max=500.0)
    holo_line_speed: _float("Line Speed", 0.5, -100.0, 100.0, "Scan line scroll speed (lines per second)", soft_max=5.0)
    holo_line_strength: _float("Line Strength", 0.5, 0.0, 1.0, subtype="FACTOR")
    flicker_amount: _float("Flicker", 0.15, 0.0, 1.0, subtype="FACTOR")
    flicker_speed: _float("Flicker Speed", 8.0, 0.0, 100.0, soft_max=30.0)
    original_mix: _float("Original Mix", 0.0, 0.0, 1.0, "Blend the original material back in", subtype="FACTOR")


def register():
    bpy.utils.register_class(BFX_Settings)
    bpy.types.Object.bfx = bpy.props.PointerProperty(type=BFX_Settings)


def unregister():
    del bpy.types.Object.bfx
    bpy.utils.unregister_class(BFX_Settings)
