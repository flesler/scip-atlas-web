import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildExplorerDb } from "../bin/pack/build.js";
import { dumpExplorerUi } from "../bin/dump-ui.js";

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const tempDirs: string[] = [];

function buildFixtureExplorer(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-dump-"));
  tempDirs.push(dir);
  const output = path.join(dir, "explorer.db");
  buildExplorerDb({
    repoPath: FIXTURE_DIR,
    indexPath: path.join(FIXTURE_DIR, "index.db"),
    atlasPath: path.join(FIXTURE_DIR, "atlas.db"),
    outputPath: output,
  });
  return output;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("dumpExplorerUi", () => {
  it("reports tree roots and nullable summary columns like the UI would see", () => {
    const report = dumpExplorerUi(buildFixtureExplorer());

    expect(report.roots.some((node) => node.path === "src")).toBe(true);
    expect(report.samples.file).not.toBeNull();
    expect(report.nullStats.files?.summary.nulls).toBeGreaterThan(0);
    expect(report.tables.some((table) => table.name === "mentions")).toBe(true);
  });
});
