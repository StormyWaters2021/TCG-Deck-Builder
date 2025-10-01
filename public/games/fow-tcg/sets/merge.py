#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import json
import csv
from copy import deepcopy
from typing import Any, Dict, List, Tuple, Optional

# =========================
# CONFIG
# =========================
DRY_RUN = False            # Set to False to write changes back to JSON files
LOG_CSV = "merge_and_append_alternates_log.csv"
JSON_EXT = ".json"        # Process *.json in current folder
CARDS_KEY_CANDIDATES = ["cards"]  # If JSON is an object, look for these as the array key
SEPARATOR = "|"           # Joiner for differing property values
SKIP_KEYS = {"id", "image"}  # Never merged/overwritten during merge
# =========================


# --------- Utilities ---------
def ensure_str(x: Any) -> str:
    if x is None:
        return ""
    if isinstance(x, (dict, list)):
        return json.dumps(x, ensure_ascii=False)
    return str(x)


def load_json_any(path: str) -> Tuple[Any, Optional[str]]:
    """Load a JSON file that may be [cards] or {cards:[...]}. Returns (data, cards_key)."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    cards_key = None
    if isinstance(data, dict):
        for k in CARDS_KEY_CANDIDATES:
            if k in data and isinstance(data[k], list):
                cards_key = k
                break
    return data, cards_key


def save_json_any(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_card_number(card_number: str) -> str:
    """
    Derive the BASE number (uppercase):
      1) remove trailing '*' (one or more),
      2) remove trailing letters (A..Z).
    Examples:
      ABC-123      -> ABC-123
      ABC-123*     -> ABC-123
      ABC-123J     -> ABC-123
      ABC-123J*    -> ABC-123
    """
    if not isinstance(card_number, str):
        return ""
    s = card_number.strip().upper()
    s = re.sub(r"\*+$", "", s)   # drop one or more trailing stars
    s = re.sub(r"[A-Z]+$", "", s)  # drop trailing letters
    return s


def group_by_base_number(cards: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group cards by normalized base Card Number. Ignores cards without 'Card Number'."""
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for c in cards:
        num = c.get("Card Number")
        if not num:
            continue
        base = normalize_card_number(ensure_str(num))
        if not base:
            continue
        groups.setdefault(base, []).append(c)
    return groups


def pick_base_card(group_cards: List[Dict[str, Any]], base_upper: str) -> Dict[str, Any]:
    """
    Base card selection:
      1) case-insensitive exact match of 'Card Number' to base_upper, if present
      2) else the card with the shortest 'Card Number' length (then lexicographically)
    """
    exact = [
        c for c in group_cards
        if ensure_str(c.get("Card Number")).strip().upper() == base_upper
    ]
    if exact:
        return exact[0]
    return sorted(
        group_cards,
        key=lambda c: (len(ensure_str(c.get("Card Number"))), ensure_str(c.get("Card Number")))
    )[0]


def property_values_equal(a: Any, b: Any) -> bool:
    sa, sb = ensure_str(a).strip(), ensure_str(b).strip()
    return sa == sb


def merge_card_properties(base: Dict[str, Any], others: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Merge properties from others into base:
      - Do NOT merge/overwrite 'id' or 'image'
      - If all values for a key are identical, keep as-is
      - If values differ, join distinct, non-empty strings with SEPARATOR (|).
    """
    merged = deepcopy(base)
    all_keys = set().union(*(d.keys() for d in [base] + others)) - SKIP_KEYS

    for key in sorted(all_keys):
        base_val = ensure_str(base.get(key))
        vals = [base_val] + [ensure_str(d.get(key)) for d in others]

        # If all equal -> nothing to do
        if all(property_values_equal(vals[0], v) for v in vals[1:]):
            continue

        # Build dedupbed, non-empty join
        dedup: List[str] = []
        for v in vals:
            v = v.strip()
            if v and v not in dedup:
                dedup.append(v)
        merged[key] = SEPARATOR.join(dedup)

    return merged


def append_alternate_fields(merged: Dict[str, Any], extras_sorted: List[Dict[str, Any]]) -> None:
    """
    Append complete copies of extra cards' fields under alternate1_/alternate2_ prefixes.
    Includes their original 'id' and 'image' (we're just copying under new keys).
    """
    prefixes = ["alternate1_", "alternate2_"]
    for idx, extra in enumerate(extras_sorted[:2]):
        prefix = prefixes[idx]
        for k, v in extra.items():
            merged[f"{prefix}{k}"] = v


def assign_side_images_from_extras(merged: Dict[str, Any], extras_sorted: List[Dict[str, Any]]) -> None:
    """
    Set side images from extras:
      - keep base merged['image'] as-is (do NOT fill it from extras)
      - first extra's 'image' -> 'backimage' (if non-empty)
      - second extra's 'image' -> 'unfoldimage' (if non-empty)
    """
    if len(extras_sorted) >= 1:
        img1 = ensure_str(extras_sorted[0].get("image")).strip()
        if img1:
            merged["backimage"] = img1
    if len(extras_sorted) >= 2:
        img2 = ensure_str(extras_sorted[1].get("image")).strip()
        if img2:
            merged["unfoldimage"] = img2


def collect_text(c: Optional[Dict[str, Any]]) -> str:
    if not c:
        return ""
    # Prefer 'Text', then 'text'
    return ensure_str(c.get("Text") if "Text" in c else c.get("text"))


# --------- Per-file processing ---------
def process_file(path: str, dry_run: bool, csv_writer) -> None:
    data, cards_key = load_json_any(path)

    # Extract card list
    if cards_key:
        cards = data.get(cards_key, [])
    else:
        cards = data if isinstance(data, list) else []

    if not isinstance(cards, list) or not cards:
        return

    groups = group_by_base_number(cards)
    to_remove_ids = set()

    for base_upper, group in groups.items():
        if len(group) <= 1:
            continue  # nothing to merge

        # Identify base and extras
        base_card = pick_base_card(group, base_upper)
        extras = [c for c in group if c is not base_card]

        # Sort extras (stable order for alternate1/2 and side images)
        extras_sorted = sorted(
            extras,
            key=lambda c: (len(ensure_str(c.get("Card Number"))), ensure_str(c.get("Card Number")))
        )

        # Build merged object
        merged = merge_card_properties(base_card, extras_sorted)

        # Keep base image exactly as-is (do NOT fill from extras)
        # (No action required; we never changed it during merge.)

        # Assign side images
        assign_side_images_from_extras(merged, extras_sorted)

        # Append alternate copies
        append_alternate_fields(merged, extras_sorted)

        # Normalize 'name' field pipes to ' // '
        if "name" in merged and isinstance(merged["name"], str):
            merged["name"] = merged["name"].replace("|", " // ")

        # Prepare CSV row (log up to 3 cards)
        c1 = base_card
        c2 = extras_sorted[0] if len(extras_sorted) >= 1 else None
        c3 = extras_sorted[1] if len(extras_sorted) >= 2 else None

        row = {
            "file": os.path.basename(path),
            "group_base": base_upper,
            "count": len(group),
            "card1_name": ensure_str(c1.get("name")) if c1 else "",
            "card1_number": ensure_str(c1.get("Card Number")) if c1 else "",
            "card1_text": collect_text(c1),
            "card2_name": ensure_str(c2.get("name")) if c2 else "",
            "card2_number": ensure_str(c2.get("Card Number")) if c2 else "",
            "card2_text": collect_text(c2),
            "card3_name": ensure_str(c3.get("name")) if c3 else "",
            "card3_number": ensure_str(c3.get("Card Number")) if c3 else "",
            "card3_text": collect_text(c3),
            "merged_object": json.dumps(merged, ensure_ascii=False),
        }
        csv_writer.writerow(row)

        if not dry_run:
            # Replace base card in-place with merged content
            base_card.clear()
            base_card.update(merged)
            # Mark the extras for removal
            for e in extras_sorted:
                to_remove_ids.add(id(e))

    if not dry_run and to_remove_ids:
        # Rebuild list without removed cards
        new_cards = [c for c in cards if id(c) not in to_remove_ids]
        if cards_key:
            data[cards_key] = new_cards
        else:
            data = new_cards
        save_json_any(path, data)


def main():
    # CSV log setup
    fieldnames = [
        "file", "group_base", "count",
        "card1_name", "card1_number", "card1_text",
        "card2_name", "card2_number", "card2_text",
        "card3_name", "card3_number", "card3_text",
        "merged_object"
    ]
    with open(LOG_CSV, "w", encoding="utf-8", newline="") as csvf:
        writer = csv.DictWriter(csvf, fieldnames=fieldnames)
        writer.writeheader()

        for fname in sorted(os.listdir(".")):
            if not fname.lower().endswith(JSON_EXT):
                continue
            try:
                process_file(fname, DRY_RUN, writer)
            except Exception as e:
                writer.writerow({
                    "file": fname,
                    "group_base": "ERROR",
                    "count": "",
                    "card1_name": "",
                    "card1_number": "",
                    "card1_text": "",
                    "card2_name": "",
                    "card2_number": "",
                    "card2_text": "",
                    "card3_name": "",
                    "card3_number": "",
                    "card3_text": "",
                    "merged_object": f"Error: {type(e).__name__}: {e}"
                })


if __name__ == "__main__":
    main()
