// check-served-sets.mjs
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BASE_URL || "http://localhost:5173/"; // adjust if needed
const manifestPath = "src/generated/setsIndex.json";
const game = "fow-tcg";

const setsIndex = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
const files = setsIndex[game] || [];

let ok = 0, bad = 0;
for (const rel of files) {
  const url = new URL(rel, baseUrl).toString();
  try {
    const res = await fetch(encodeURI(url), { cache: "no-store" });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("application/json")) {
      const text = await res.text();
      console.warn("BAD:", res.status, ct, url, "→", text.slice(0, 80).replace(/\s+/g, " "));
      bad++;
    } else {
      ok++;
    }
  } catch (e) {
    console.warn("ERR:", url, e);
    bad++;
  }
}
console.log("OK:", ok, "BAD:", bad);
