from __future__ import annotations

import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

# Zip-bomb guards (review PY-05). A well-formed HWPX has far fewer entries and
# expands to well under these bounds; anything larger is rejected before extract.
MAX_ZIP_ENTRIES = 5000
MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024  # 300MB total


def unpack_hwpx(source: Path, destination: Path) -> None:
    """Extract an HWPX (zip) into destination, rejecting hostile archives.

    Guards against (a) path traversal — zipfile normalizes some absolute/`..`
    paths but not all platform variants, so each resolved target is validated to
    stay inside destination — and (b) zip bombs, by capping the entry count and
    the total declared uncompressed size before writing anything.
    """
    destination.mkdir(parents=True, exist_ok=True)
    dest_root = destination.resolve()
    with ZipFile(source) as archive:
        members = archive.infolist()
        if len(members) > MAX_ZIP_ENTRIES:
            raise ValueError(f"zip archive has too many entries ({len(members)} > {MAX_ZIP_ENTRIES})")
        total_uncompressed = 0
        for member in members:
            total_uncompressed += member.file_size
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("zip archive expands beyond the allowed size (possible zip bomb)")
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
