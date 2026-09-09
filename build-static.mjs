import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve("dist/static");
await mkdir(resolve(output, "public"), { recursive: true });
for (const file of [
  "index.html",
  "game-view.js",
  "game.js",
  "engine.js",
  "progress-csv.js",
  "profiles.js",
  "cloud.js",
  "cloud-config.js",
  "styles.css",
  "public/favicon.svg",
  "public/og.png",
])
  await copyFile(file, resolve(output, file));
console.log("Built complete static game in dist/static/");
