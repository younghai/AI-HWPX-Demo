from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


def unpack_hwpx(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with ZipFile(source) as archive:
        archive.extractall(destination)


def pack_hwpx(source_dir: Path, output_file: Path) -> None:
    source_dir = source_dir.resolve()
    output_file.parent.mkdir(parents=True, exist_ok=True)

    entries = sorted(
        [path for path in source_dir.rglob("*") if path.is_file()],
        key=lambda path: (path.name != "mimetype", path.as_posix()),
    )

    with ZipFile(output_file, "w") as archive:
        for path in entries:
            arcname = path.relative_to(source_dir).as_posix()
            compression = ZIP_STORED if arcname == "mimetype" else ZIP_DEFLATED
            archive.write(path, arcname=arcname, compress_type=compression)
