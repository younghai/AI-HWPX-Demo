from __future__ import annotations

import argparse
from pathlib import Path

from hwpx_utils import unpack_hwpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Unpack a .hwpx archive into a directory.")
    parser.add_argument("source", help="Input .hwpx file")
    parser.add_argument("destination", help="Output directory")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    destination = Path(args.destination).expanduser().resolve()

    if not source.exists():
        raise SystemExit(f"Input file not found: {source}")

    unpack_hwpx(source, destination)
    print(f"Unpacked {source.name} -> {destination}")


if __name__ == "__main__":
    main()
