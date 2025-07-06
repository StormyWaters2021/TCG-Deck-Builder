import json
from collections import OrderedDict

# === CONFIGURATION ===
json_path = 'cards.json'
icon_map = {
    '@': 'Terror',
    '#': 'Combat',
    '$': 'Arcane',
    '%': 'Investigation',
}

# === LOAD CARDS ===
with open(json_path, 'r', encoding='utf-8') as f:
    cards = json.load(f)

updated_count = 0

for card in cards:
    icons = card.get('Icons')
    if not isinstance(icons, str) or not icons:
        continue

    ordered_counts = OrderedDict()
    for symbol in icons:
        if symbol in icon_map:
            ordered_counts[symbol] = ordered_counts.get(symbol, 0) + 1

    if not ordered_counts:
        continue

    parts = []
    for symbol, count in ordered_counts.items():
        label = icon_map[symbol]
        if count == 1:
            parts.append(f"{label}.")
        else:
            parts.append(f"{label} (x{count}).")

    card['Icons'] = ''.join(parts)
    updated_count += 1

# === SAVE UPDATED CARDS ===
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(cards, f, indent=2, ensure_ascii=False)

print(f"✅ Updated {updated_count} card(s) with transformed Icons.")
