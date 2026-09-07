#!/usr/bin/env python3
"""Fail if an em dash (U+2014) appears in project text files."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    ".git",
    "node_modules",
    ".next",
    "__pycache__",
    ".turbo",
    "dist",
    ".venv",
}
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2"}
SKIP_NAMES = {"check_no_emdash.py", "check-content.mjs"}


def iter_files() -> list[Path]:
    found: list[Path] = []
    for path in ROOT.rglob("*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if not path.is_file() or path.suffix.lower() in SKIP_SUFFIXES:
            continue
        if path.name in SKIP_NAMES:
            continue
        found.append(path)
    return found


def main() -> int:
    hits: list[str] = []
    for path in iter_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "\u2014" in text or "\\u2014" in text:
            hits.append(str(path.relative_to(ROOT)))
    if hits:
        print("em dash found in:")
        for hit in hits:
            print(" ", hit)
        return 1
    print("no em dashes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
