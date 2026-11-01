"""Package the add-on into dist/beam_fx-<version>.zip (installable in Blender 4.2+)."""
import pathlib, re, zipfile

root = pathlib.Path(__file__).parent
src = root / "beam_fx"
version = re.search(r'^version = "(.+)"', (src / "blender_manifest.toml").read_text(), re.M).group(1)
out = root / "dist" / f"beam_fx-{version}.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob("*")):
        if f.is_file() and "__pycache__" not in f.parts:
            z.write(f, f.relative_to(root))
print(out)
