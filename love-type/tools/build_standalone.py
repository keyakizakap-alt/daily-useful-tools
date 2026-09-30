#!/usr/bin/env python3
"""index.html から、画像をdata URIで埋め込んだ単一ファイル版を生成する。

用途: Artifact など、外部ファイルを置けない配布先向け。
    python3 tools/build_standalone.py [出力パス] [--fragment]
    --fragment を付けると <!DOCTYPE>/<html>/<head>/<body> を外した断片を出力する。
"""
import base64, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "index.html").read_text(encoding="utf-8")

assets = {}
for f in sorted((ROOT / "assets" / "characters").glob("char-*.webp")):
    n = f.stem.split("-")[1]
    assets[n] = "data:image/webp;base64," + base64.b64encode(f.read_bytes()).decode()

payload = "{" + ",".join(f'"{k}":"{v}"' for k, v in sorted(assets.items())) + "}"
out = src.replace("const ASSETS = null;", "const ASSETS = " + payload + ";", 1)
if "const ASSETS = " + payload not in out:
    sys.exit("差し込み位置 (const ASSETS = null;) が見つかりません")

if "--fragment" in sys.argv:
    head = out.split("<head>")[1].split("</head>")[0]
    head = re.sub(r"<meta[^>]*>\s*", "", head)
    out = head.strip() + "\n" + out.split("<body>")[1].split("</body>")[0].strip() + "\n"

dest = pathlib.Path([a for a in sys.argv[1:] if not a.startswith("--")][0])
dest.write_text(out, encoding="utf-8")
print(f"{dest} ({dest.stat().st_size / 1024:.0f} KB, 画像 {len(assets)} 枚を埋め込み)")
