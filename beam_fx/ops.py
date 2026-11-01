# SPDX-License-Identifier: GPL-3.0-or-later
import bpy
from bpy.props import IntProperty

from . import core


def _targets(context):
    objs = [o for o in context.selected_objects if o.type in core.SUPPORTED_TYPES]
    act = context.active_object
    if act is not None and act.type in core.SUPPORTED_TYPES and act not in objs:
        objs.insert(0, act)
    return objs


class BFX_OT_apply(bpy.types.Operator):
    bl_idname = "bfx.apply"
    bl_label = "Apply to Selected"
    bl_description = "Apply the active object's effect settings to all selected objects and animate them"
    bl_options = {"REGISTER", "UNDO"}

    stagger: IntProperty(
        name="Stagger",
        description="Delay each following object by this many frames (sorted along the effect axis)",
        default=0,
        min=0,
    )

    @classmethod
    def poll(cls, context):
        return bool(_targets(context))

    def execute(self, context):
        act = context.active_object
        objs = _targets(context)
        src = act if act in objs else objs[0]

        axis = {"X": 0, "Y": 1, "Z": 2}[src.bfx.axis]
        sign = -1.0 if src.bfx.invert else 1.0
        objs.sort(key=lambda o: sign * o.matrix_world.translation[axis])

        for i, obj in enumerate(objs):
            if obj is not src:
                core.copy_settings(src, obj)
            if self.stagger:
                obj.bfx["frame_start"] = src.bfx.frame_start + i * self.stagger
                obj.bfx["frame_end"] = src.bfx.frame_end + i * self.stagger
            core.apply(obj)

        self.report({"INFO"}, "Beam FX applied to %d object(s)" % len(objs))
        return {"FINISHED"}


class BFX_OT_remove(bpy.types.Operator):
    bl_idname = "bfx.remove"
    bl_label = "Remove"
    bl_description = "Remove the effect and its animation from the selected objects"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return any(core.is_applied(o) for o in _targets(context))

    def execute(self, context):
        n = 0
        for obj in _targets(context):
            if core.is_applied(obj):
                core.remove(obj)
                n += 1
        self.report({"INFO"}, "Beam FX removed from %d object(s)" % n)
        return {"FINISHED"}


class BFX_OT_refresh_bounds(bpy.types.Operator):
    bl_idname = "bfx.refresh_bounds"
    bl_label = "Refit to Object"
    bl_description = "Recompute the effect range after editing the object's shape or modifiers"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        for obj in _targets(context):
            core.refresh_bounds(obj)
        return {"FINISHED"}


# ---------------------------------------------------------------------------
# Glow (compositor bloom)
# ---------------------------------------------------------------------------

GLOW_NODE = "BFX Glow"


def _set(node, attr, socket, value):
    """Set a node option that is a property in older Blender and a socket in newer."""
    if hasattr(node, attr):
        try:
            setattr(node, attr, value if not isinstance(value, tuple) else value[0])
            return
        except (TypeError, ValueError):
            pass
    sock = node.inputs.get(socket)
    if sock is not None:
        try:
            sock.default_value = value[1] if isinstance(value, tuple) else value
        except (TypeError, ValueError):
            pass


def _configure_glare(glare):
    glare.name = GLOW_NODE
    glare.label = "Beam FX Glow"
    # (property value, menu socket value)
    _set(glare, "glare_type", "Type", ("BLOOM", "Bloom"))
    _set(glare, "quality", "Quality", ("HIGH", "High"))
    _set(glare, "threshold", "Threshold", 1.0)
    _set(glare, "size", "Size", 7 if hasattr(glare, "size") else 0.6)


def _insert_glare(tree, out_socket):
    glare = tree.nodes.get(GLOW_NODE)
    if glare is not None:
        return glare
    if not out_socket.is_linked:
        return None
    src = out_socket.links[0].from_socket
    glare = tree.nodes.new("CompositorNodeGlare")
    _configure_glare(glare)
    to = out_socket.node
    glare.location = (to.location.x - 250, to.location.y)
    tree.links.new(src, glare.inputs["Image"])
    tree.links.new(glare.outputs["Image"], out_socket)
    return glare


def _new_tree_5x(scene):
    tree = bpy.data.node_groups.new("Beam FX Compositor", "CompositorNodeTree")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = tree.nodes.new("CompositorNodeRLayers")
    rl.location = (-300, 0)
    out = tree.nodes.new("NodeGroupOutput")
    out.location = (300, 0)
    tree.links.new(rl.outputs["Image"], out.inputs[0])
    scene.compositing_node_group = tree
    return tree


class BFX_OT_add_glow(bpy.types.Operator):
    bl_idname = "bfx.add_glow"
    bl_label = "Add Glow"
    bl_description = "Add a bloom glow to the compositor so the effect's emission glows (renders and viewport)"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        scene = context.scene
        try:
            if hasattr(scene, "compositing_node_group"):  # Blender 5.0+
                tree = scene.compositing_node_group or _new_tree_5x(scene)
                out = next((n for n in tree.nodes if n.bl_idname == "NodeGroupOutput"), None)
                glare = _insert_glare(tree, out.inputs[0]) if out is not None else None
            else:
                scene.use_nodes = True
                tree = scene.node_tree
                out = next((n for n in tree.nodes if n.bl_idname == "CompositorNodeComposite"), None)
                glare = _insert_glare(tree, out.inputs["Image"]) if out is not None else None
        except Exception as ex:  # compositor API differs a lot between versions
            self.report({"ERROR"}, "Could not set up glow: %s" % ex)
            return {"CANCELLED"}

        if glare is None:
            self.report({"WARNING"}, "No connected compositor output found; add a Glare node manually")
            return {"CANCELLED"}

        space = context.space_data
        if space is not None and space.type == "VIEW_3D" and hasattr(space.shading, "use_compositor"):
            space.shading.use_compositor = "ALWAYS"
        self.report({"INFO"}, "Glow added to compositor")
        return {"FINISHED"}


classes = (BFX_OT_apply, BFX_OT_remove, BFX_OT_refresh_bounds, BFX_OT_add_glow)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
