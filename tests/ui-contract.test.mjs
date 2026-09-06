import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { view } from "../game-view.js";

test("shared view has unique IDs and every literal controller target exists", async () => {
  const ids = [...view.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  const game = await readFile(new URL("../game.js", import.meta.url), "utf8");
  const targets = [...game.matchAll(/\$\(['"]([^'"]+)['"]\)/g)];
  assert.ok(targets.length > 30, 'Controller targets must actually be checked');
  for (const [, id] of targets)
    assert.ok(ids.includes(id), `Missing controller target: ${id}`);
});
test("static package includes every local module and stylesheet the entrypoint needs", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const builder = await readFile(new URL("../build-static.mjs", import.meta.url), "utf8");
  for (const file of ["game.js", "game-view.js", "engine.js", "styles.css"])
    assert.ok(builder.includes(`'${file}'`) || builder.includes(`"${file}"`));
  assert.ok(html.includes('type="module"'));
  assert.ok(html.includes("mountGame(root)"));
});
