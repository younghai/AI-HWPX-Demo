from __future__ import annotations

import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


def unpack_hwpx(source: Path, destination: Path) -> None:
    """Extract an HWPX (zip) into destination, rejecting path-traversal entries.

    zipfile normalizes some absolute/`..` paths, but not all platform variants,
    so we validate each resolved target stays inside destination before writing.
    (Zip-bomb size caps are handled by the Phase 1 hardening pass — review PY-05.)
    """
    destination.mkdir(parents=True, exist_ok=True)
    dest_root = destination.resolve()
    with ZipFile(source) as archive:
        for member in archive.infolist():
            target = (dest_root / member.filename).resolve()
            if target != dest_root and dest_root not in target.parents:
                raise ValueError(f"unsafe path in zip archive: {member.filename!r}")
        archive.extractall(destination)


def pack_hwpx(source_dir: Path, output_file: Path) -> None:
    """Zip source_dir into an HWPX, writing atomically.

    Writes to a temp file in the same directory then os.replace()s it into place,
    so a crash/timeout mid-write can never leave a truncated .hwpx at the served
    path. mimetype is stored first and uncompressed per the OCF spec.
    See review PY-03.
    """
    source_dir = source_dir.resolve()
    output_file.parent.mkdir(parents=True, exist_ok=True)

    entries = sorted(
        [path for path in source_dir.rglob("*") if path.is_file()],
        key=lambda path: (path.name != "mimetype", path.as_posix()),
    )

    tmp_file = output_file.with_name(f".{output_file.name}.{os.getpid()}.tmp")
    try:
        with ZipFile(tmp_file, "w") as archive:
            for path in entries:
                arcname = path.relative_to(source_dir).as_posix()
                compression = ZIP_STORED if arcname == "mimetype" else ZIP_DEFLATED
                archive.write(path, arcname=arcname, compress_type=compression)
        os.replace(tmp_file, output_file)
    finally:
        if tmp_file.exists():
            tmp_file.unlink()
