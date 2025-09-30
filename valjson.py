#!/usr/bin/env python3
# rename_sets_to_underscores.py
#
# Rename all .json files in a folder to contain ONLY [A-Za-z0-9_].json
# - Replaces spaces and any special character with '_'
# - Removes accents/diacritics (NFKD)
# - Collapses multiple underscores
# - Appends numeric suffix if the sanitized name collides
# - Optionally updates a setsIndex.json manifest to the new names
#
# Usage:
#   python rename_sets_to_underscores.py
#
# Adjust FOLDER and (optional) MANIFEST below as needed.

import os
import re
import json
import shutil
import unicodedata
from pathlib import Path

# === CONFIG ===
FOLDER   = Path(r"./public/games/fow-tcg/sets")  # folder containing set JSONs
MANIFEST = None  # e.g. Path("./public/games/fow-tcg/setsIndex.json") or None
DRY_RUN  = False  # True = print what would happen; False = actually rename

# If your manifest entries include full relative paths (e.g. "games/fow-tcg/sets/XYZ.json"),
# set this to the path prefix used there.
MANIFEST_PATH_PREFIX = "games/fow-tcg/sets/"

def strip_accents(s: str) -> str:
    # Normalize and remove combining marks (accents)
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))

def sanitize_basename(name: str) -> str:
    """
    Convert basename (without extension) so it contains only A-Za-z0-9_.
    - Remove accents
    - Replace any non-alnum with '_'
    - Collapse multiple underscores
    - Strip leading/trailing underscores
    """
    s = strip_accents(name)
    s = re.sub(r"[^A-Za-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s)
    s = s.strip("_")
    # Don't allow empty; fall back to 'set'
    return s or "set"

def unique_target(basename: str, taken: set) -> str:
    """
    Ensure the sanitized basename is unique within 'taken'.
    If collision, append _2, _3, ...
    """
    candidate = basename
    n = 2
    while candidate in taken:
        candidate = f"{basename}_{n}"
        n += 1
    taken.add(candidate)
    return candidate

def rename_files(folder: Path):
    folder = folder.resolve()
    if not folder.is_dir():
        raise SystemExit(f"Folder not found: {folder}")

    files = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".json"]
    if not files:
        print(f"No .json files found in {folder}")
        return {}, []

    taken = set()
    mapping = {}  # old_path -> new_path
    conflicts = []  # list of (old, new) that collide with an existing file on disk

    for p in files:
        base = p.stem  # filename without .json
        sanitized = sanitize_basename(base)
        unique_base = unique_target(sanitized, taken)
        new_name = unique_base + ".json"
        new_path = p.with_name(new_name)

        # If new_path already exists on disk AND it's not the same file, record conflict
        if new_path.exists() and new_path.resolve() != p.resolve():
            conflicts.append((str(p.name), str(new_path.name)))

        mapping[str(p)] = str(new_path)

    # Apply renames
    if DRY_RUN:
        print("=== DRY RUN ===")
        for old, new in mapping.items():
            print(f"{Path(old).name}  →  {Path(new).name}")
        if conflicts:
            print("\nConflicts detected (file already exists):")
            for c in conflicts:
                print("  -", c[0], "→", c[1])
        print(f"\nTotal files: {len(files)}  |  Renamed (planned): {len(mapping)}")
    else:
        for old, new in mapping.items():
            old_p = Path(old)
            new_p = Path(new)
            if old_p.resolve() == new_p.resolve():
                continue  # same name, nothing to do
            # Ensure parent exists
            new_p.parent.mkdir(parents=True, exist_ok=True)
            # Rename (atomic if same filesystem)
            os.replace(old_p, new_p)
            print(f"RENAMED: {old_p.name} → {new_p.name}")

    return mapping, conflicts

def maybe_update_manifest(manifest_path: Path, mapping: dict):
    """
    Update setsIndex.json by replacing old filenames with new ones.
    This handles entries like:
      "games/fow-tcg/sets/Old_Name.json"
    turning into:
      "games/fow-tcg/sets/New_Name.json"
    """
    manifest_path = manifest_path.resolve()
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}")
        return False

    with open(manifest_path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"Failed to parse manifest: {e}")
            return False

    # Build old->new map as basenames (only the filename part)
    old_to_new_file = {}
    for old_abs, new_abs in mapping.items():
        old_name = Path(old_abs).name
        new_name = Path(new_abs).name
        old_to_new_file[old_name] = new_name

    # Replace wherever these basenames appear under the known prefix
    changed = 0

    def swap_in_list(lst):
        nonlocal changed
        out = []
        for item in lst:
            if isinstance(item, str) and item.startswith(MANIFEST_PATH_PREFIX):
                fn = Path(item).name
                if fn in old_to_new_file:
                    new_item = str(Path(MANIFEST_PATH_PREFIX) / old_to_new_file[fn])
                    out.append(new_item)
                    changed += 1
                    continue
            out.append(item)
        return out

    if isinstance(data, dict):
        for k, v in list(data.items()):
            if isinstance(v, list):
                data[k] = swap_in_list(v)
    elif isinstance(data, list):
        data = swap_in_list(data)
    else:
        print("Manifest format is neither dict nor list; skipped updating.")
        return False

    if DRY_RUN:
        print(f"(DRY RUN) Would update {changed} manifest entries in {manifest_path.name}.")
        return True

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Updated {changed} manifest entries in {manifest_path.name}.")
    return True

def main():
    print(f"Scanning: {FOLDER}")
    mapping, conflicts = rename_files(FOLDER)

    # Write the rename map for reference
    if mapping:
        map_path = FOLDER / "rename_map.json"
        with open(map_path, "w", encoding="utf-8") as f:
            json.dump(
                {Path(k).name: Path(v).name for k, v in mapping.items()},
                f, ensure_ascii=False, indent=2
            )
        print(f"Rename map written to: {map_path}")

    if conflicts:
        print("\nConflicts detected (target already exists). Review before re-running:")
        for old, new in conflicts:
            print(f"  - {old} → {new}")

    # Optionally update manifest
    if MANIFEST:
        maybe_update_manifest(Path(MANIFEST), mapping)

    print("\nDone.")

if __name__ == "__main__":
    main()
