import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  compressedOutputPath,
  defaultIndexPath,
  explorerDbPath,
  projectCacheSlug,
  resolveGitRoot,
} from "../bin/pack/paths.js"

const tempDirs: string[] = [];

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-git-"));
  tempDirs.push(dir);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  execFileSync("git", ["add", "."], { cwd: dir, env });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("project paths", () => {
  it("matches scip-cli cache slug algorithm", () => {
    const repo = makeGitRepo();
    const digest = projectCacheSlug(repo).split("-").pop();
    expect(digest).toHaveLength(6);
    expect(projectCacheSlug(repo)).toBe(projectCacheSlug(repo));
  });

  it("resolves git root from subdir", () => {
    const repo = makeGitRepo();
    const subdir = path.join(repo, "src");
    fs.mkdirSync(subdir);
    expect(resolveGitRoot(subdir)).toBe(path.resolve(repo));
  });

  it("maps compressed explorer output paths", () => {
    expect(compressedOutputPath("/cache/explorer.db")).toBe("/cache/explorer.db.gz")
    expect(compressedOutputPath("/cache/explorer.db.gz")).toBe("/cache/explorer.db.gz")
    expect(explorerDbPath("/cache/explorer.db.gz")).toBe("/cache/explorer.db")
    expect(explorerDbPath("/cache/explorer.db")).toBe("/cache/explorer.db")
  });

  it("builds default index path under scip-cli cache", () => {
    const repo = makeGitRepo();
    const indexPath = defaultIndexPath(repo);
    expect(indexPath).toContain(".cache/scip-cli/projects/");
    expect(indexPath.endsWith("/index.db")).toBe(true);
    expect(indexPath).toContain(projectCacheSlug(repo));
  });
});
