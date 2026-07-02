from __future__ import annotations

import argparse
from pathlib import Path

from hwpx_utils import pack_hwpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Pack an unpacked HWPX directory back into a .hwpx file.")
    parser.add_argument("source_dir", help="Directory containing unpacked HWPX contents")
    parser.add_argument("output", help="Output .hwpx file")
    args = parser.parse_args()

    source_dir = Path(args.source_dir).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()

    if not source_dir.exists():
        raise SystemExit(f"Source directory not found: {source_dir}")

    pack_hwpx(source_dir, output)
    print(f"Packed {source_dir} -> {output}")


if __name__ == "__main__":
    main()
