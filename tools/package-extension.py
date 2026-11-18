#!/usr/bin/env python3
"""Build a Chrome/Edge load-unpacked folder and a zip for the extension."""

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "extension"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "dist",
        help="output directory (default: <repo>/dist)",
    )
    args = parser.parse_args()

    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    folder_name = f"dsbridge-extension-{version}"
    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    dest_dir = out_dir / folder_name
    zip_path = out_dir / f"{folder_name}.zip"

    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    shutil.copytree(
        SRC,
        dest_dir,
        ignore=shutil.ignore_patterns(".DS_Store", "Thumbs.db", "desktop.ini"),
    )

    entries = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(dest_dir.rglob("*")):
            if not path.is_file():
                continue
            zf.write(path, path.relative_to(dest_dir).as_posix())
            entries += 1

    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    print(json.dumps({
        "folder": str(dest_dir),
        "zip": str(zip_path),
        "entries": entries,
        "zip_bytes": zip_path.stat().st_size,
        "sha256": digest,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
