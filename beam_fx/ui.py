# SPDX-License-Identifier: GPL-3.0-or-later
import bpy

from . import core
from .nodes import PROP_PROGRESS


class _Base:
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "FX"

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj is not None and obj.type in core.SUPPORTED_TYPES


class BFX_PT_main(_Base, bpy.types.Panel):
    bl_label = "Beam FX"
    bl_idname = "BFX_PT_main"

    @classmethod
    def poll(cls, context):
        return True

    def draw(self, context):
        layout = self.layout
        obj = context.active_object
        if obj is None or obj.type not in core.SUPPORTED_TYPES:
            layout.label(text="Select a mesh, curve or text object", icon="INFO")
            return
        s = obj.bfx

        layout.row().prop(s, "effect", expand=True)

        row = layout.row(align=True)
        row.scale_y = 1.4
        row.operator("bfx.apply", icon="PLAY")
        row.operator("bfx.remove", text="", icon="X")

        col = layout.column(align=True)
        col.use_property_split = True
        col.use_property_decorate = False
        col.prop(s, "direction")
        sub = col.column(align=True)
        sub.prop(s, "frame_start", text="Frame Start")
        sub.prop(s, "frame_end", text="End")
        col.prop(s, "easing")
        row = col.row(align=True)
        row.prop(s, "axis", expand=True)
        row.prop(s, "invert", text="", icon="ARROW_LEFTRIGHT")

        if core.is_applied(obj):
            box = layout.box()
            box.prop(obj, '["%s"]' % PROP_PROGRESS, text="Progress", slider=True)
            box.operator("bfx.refresh_bounds", icon="FILE_REFRESH")


class BFX_PT_look(_Base, bpy.types.Panel):
    bl_label = "Look"
    bl_parent_id = "BFX_PT_main"

    def draw(self, context):
        s = context.active_object.bfx
        layout = self.layout
        layout.use_property_split = True
        layout.use_property_decorate = False

        if s.effect == "REVEAL":
            col = layout.column(align=True)
            col.prop(s, "wire_color")
            col.prop(s, "wire_strength")
            col.prop(s, "wire_width")
            col = layout.column(align=True)
            col.prop(s, "wire_style")
            col.prop(s, "wire_thickness")
            if s.wire_style == "GRID":
                col.prop(s, "grid_density")
            col = layout.column(align=True)
            col.prop(s, "edge_color")
            col.prop(s, "edge_strength")
            col.prop(s, "edge_width")
            col.prop(s, "softness")
        elif s.effect == "SCAN":
            col = layout.column(align=True)
            col.prop(s, "band_color")
            col.prop(s, "band_strength")
            col.prop(s, "band_width")
            col = layout.column(align=True)
            col.prop(s, "scan_line_density")
            col.prop(s, "scan_line_strength")
            col = layout.column(align=True)
            col.prop(s, "trail_length")
            col.prop(s, "trail_strength")
            layout.prop(s, "scan_reveal")
        else:
            col = layout.column(align=True)
            col.prop(s, "holo_color")
            col.prop(s, "holo_strength")
            col.prop(s, "holo_opacity")
            col.prop(s, "rim_power")
            col = layout.column(align=True)
            col.prop(s, "holo_line_density")
            col.prop(s, "holo_line_speed")
            col.prop(s, "holo_line_strength")
            col = layout.column(align=True)
            col.prop(s, "flicker_amount")
            col.prop(s, "flicker_speed")
            col = layout.column(align=True)
            col.prop(s, "edge_color", text="Materialize Edge")
            col.prop(s, "edge_strength")
            col.prop(s, "edge_width")
            layout.prop(s, "original_mix")

        col = layout.column(align=True)
        col.prop(s, "noise_amount")
        col.prop(s, "noise_scale")


class BFX_PT_glow(_Base, bpy.types.Panel):
    bl_label = "Glow"
    bl_parent_id = "BFX_PT_main"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        layout.operator("bfx.add_glow", icon="LIGHT_SUN")
        layout.label(text="Adds bloom in the compositor.", icon="INFO")


classes = (BFX_PT_main, BFX_PT_look, BFX_PT_glow)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
