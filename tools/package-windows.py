"""Build the ready-to-use Windows package.

Run with: python tools/package-windows.py
"""

from pathlib import Path
import json
import stat
import zipfile

PROJECT = Path(__file__).resolve().parent.parent
RELEASE_DIR = PROJECT / "release"
VERSION = json.loads((PROJECT / "package.json").read_text(encoding="utf-8"))["version"]
ZIP_PATH = RELEASE_DIR / f"丘丘背单词-v{VERSION}-Windows.zip"

files: list[tuple[str, int]] = [
    ("start-windows.cmd", 0o644),
    ("使用说明-Windows.md", 0o644),
    ("README.md", 0o644),
    ("词库格式说明.md", 0o644),
    ("launcher/serve.mjs", 0o644),
    ("launcher/qqwords-server-windows-amd64.exe", 0o644),
    ("samples/单词合集示例.csv", 0o644),
    ("samples/词库合集示例.json", 0o644),
]

for path in sorted((PROJECT / "dist").rglob("*")):
    if path.is_file():
        files.append((path.relative_to(PROJECT).as_posix(), 0o644))

for path in sorted((PROJECT / "docs" / "screenshots").rglob("*.png")):
    files.append((path.relative_to(PROJECT).as_posix(), 0o644))


def main() -> None:
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative, mode in files:
            source = PROJECT / relative
            if not source.is_file():
                raise FileNotFoundError(source)
            info = zipfile.ZipInfo("丘丘背单词/" + relative)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            info.date_time = (2026, 11, 5, 7, 30, 0)
            archive.writestr(info, source.read_bytes())

    with zipfile.ZipFile(ZIP_PATH) as archive:
        names = set(archive.namelist())
        required = [
            "丘丘背单词/start-windows.cmd",
            "丘丘背单词/launcher/qqwords-server-windows-amd64.exe",
            "丘丘背单词/dist/index.html",
            "丘丘背单词/README.md",
            "丘丘背单词/使用说明-Windows.md",
            "丘丘背单词/词库格式说明.md",
            "丘丘背单词/samples/单词合集示例.csv",
            "丘丘背单词/samples/词库合集示例.json",
            "丘丘背单词/docs/screenshots/home.png",
        ]
        for item in required:
            if item not in names:
                raise RuntimeError(f"missing {item}")

    print(f"created {ZIP_PATH}")
    print(f"size {ZIP_PATH.stat().st_size / 1024 / 1024:.1f} MB")
    print(f"files {len(names)}")


if __name__ == "__main__":
    main()
