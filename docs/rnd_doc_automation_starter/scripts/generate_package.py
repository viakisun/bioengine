from __future__ import annotations

import argparse
from pathlib import Path

from builders.orchestrator import generate, load_input


def main():
    parser = argparse.ArgumentParser(description="Generate R&D evidence document package.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, default=Path("outputs/generated"))
    args = parser.parse_args()

    data = load_input(args.input)
    files = generate(data, args.out)
    print(f"Generated {len(files)} files in {args.out}")
    for path in files:
        print(path)


if __name__ == "__main__":
    main()
