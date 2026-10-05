#!/usr/bin/env python3
"""Builds Venuely-offline.html: one self-contained file (CSS + JS inlined, no network needed).
Requires esbuild:  npm i -g esbuild   (or: npx esbuild)"""
import re, subprocess, pathlib, shutil, tempfile, sys
root = pathlib.Path(__file__).resolve().parent.parent
tmp = pathlib.Path(tempfile.mkdtemp()) / 'bundle.js'
esb = shutil.which('esbuild') or None
cmd = [esb] if esb else ['npx', '--yes', 'esbuild']
subprocess.run(cmd + [str(root / 'js/main.js'), '--bundle', '--minify', '--format=iife', '--target=es2020', f'--outfile={tmp}'], check=True)
js = tmp.read_text().replace('</script', '<\\/script')
css = (root / 'css/app.css').read_text()
html = (root / 'index.html').read_text()
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = body.replace('<script type="module" src="js/main.js"></script>', '')
icon = re.search(r'<link rel="icon"[^>]*>', html).group(0)
out = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Venuely – Event Layout Studio</title>
{icon}
<style>
{css}
</style>
</head>
<body>
{body}
<script>
{js}
</script>
</body>
</html>
'''
(root / 'Venuely-offline.html').write_text(out, encoding='utf-8')
print('wrote', root / 'Venuely-offline.html', len(out) // 1024, 'KB')
