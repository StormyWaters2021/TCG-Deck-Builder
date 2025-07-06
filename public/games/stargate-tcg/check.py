import json

# === CONFIGURATION ===
json_path = 'cards.json'
classic_sets = ('Set 01', 'Set 02', 'Set 03')

# === LOAD JSON ===
with open(json_path, 'r', encoding='utf-8') as f:
    cards = json.load(f)

# === MODIFY CARDS ===
updated = 0

for card in cards:
    format_value = card.get('Format')
    if not format_value or (isinstance(format_value, str) and format_value.strip() == ''):
        set_value = card.get('Set', '')
        set_normalized = set_value.strip().lower()
        if any(set_normalized.startswith(prefix) for prefix in classic_sets):
            card['Format'] = 'Classic'
        else:
            card['Format'] = 'Expanded'
        updated += 1

# === SAVE UPDATED JSON ===
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(cards, f, indent=2, ensure_ascii=False)

print(f'✅ Updated {updated} cards with missing format values.')
