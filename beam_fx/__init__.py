# SPDX-License-Identifier: GPL-3.0-or-later
"""Beam FX: animated reveal, scan and hologram effects for Blender.

Panel: 3D Viewport > Sidebar (N) > FX > Beam FX
"""

bl_info = {
    "name": "Beam FX",
    "author": "rushichatur",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar > FX",
    "description": "Animated reveal, scan and hologram effects for any object",
    "category": "Animation",
}

from . import ops, props, ui

_modules = (props, ops, ui)


def register():
    for m in _modules:
        m.register()


def unregister():
    for m in reversed(_modules):
        m.unregister()
