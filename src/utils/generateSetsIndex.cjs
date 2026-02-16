// scripts/generateSetsIndex.cjs
const fs = require("fs");
const path = require("path");

const PUBLIC_GAMES_DIR = path.resolve("public", "games");
const OUTPUT_DIR = path.resolve("src", "generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "setsIndex.json");
const PUBLIC_OUT = path.resolve("public", "setsIndex.json");


function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function gather() {
  const index = {};
  if (!fs.existsSync(PUBLIC_GAMES_DIR)) return index;

  const games = fs
    .readdirSync(PUBLIC_GAMES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const game of games) {
    const setsDir = path.join(PUBLIC_GAMES_DIR, game, "sets");
    if (!fs.existsSync(setsDir)) continue;

    const files = fs
      .readdirSync(setsDir)
      .filter(f => f.toLowerCase().endsWith(".json") && f !== "manifest.json")
      .sort();

    if (files.length) {
      // Store paths relative to public root so they’re easy to fetch at runtime
      index[game] = files.map(f => `games/${game}/sets/${f}`);
    }
  }

  return index;
}

function main() {
  const index = gather();
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
  fs.writeFileSync(PUBLIC_OUT, JSON.stringify(index, null, 2));
  const gamesCount = Object.keys(index).length;
  console.log(
    `Generated setsIndex.json for ${gamesCount} game(s)${
      gamesCount ? ":" : "."
    }`
  );
  for (const [game, files] of Object.entries(index)) {
    console.log(`  • ${game}: ${files.length} set file(s)`);
  }
}

main();
