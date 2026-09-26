import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { sanitizePackedDbRepoName, packedDbBasename } from "../bin/pack/meta.js"
import {
  PathsError,
  compressedOutputPath,
  defaultIndexPath,
  defaultOutputPath,
  explorerDbPath,
  projectCacheSlug,
  resolveGitRoot,
  resolveOutputPath,
  resolvePackPaths,
  resolveProjectCacheDir,
} from "../bin/pack/paths.js"

const FIXTURE_ATLAS = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "atlas.db")

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

  it("maps compressed packed output paths", () => {
    expect(compressedOutputPath("/cache/sample-app.db")).toBe("/cache/sample-app.db.gz")
    expect(compressedOutputPath("/cache/sample-app.db.gz")).toBe("/cache/sample-app.db.gz")
    expect(explorerDbPath("/cache/sample-app.db.gz")).toBe("/cache/sample-app.db")
    expect(explorerDbPath("/cache/explorer.db")).toBe("/cache/explorer.db")
  })

  it("sanitizes atlas github_repo into a packed db basename", () => {
    expect(sanitizePackedDbRepoName("sample-app")).toBe("sample-app")
    expect(sanitizePackedDbRepoName("")).toBe("explorer")
    expect(packedDbBasename(FIXTURE_ATLAS)).toBe("sample-app.db")
    expect(defaultOutputPath(FIXTURE_ATLAS)).toBe(path.join(path.dirname(FIXTURE_ATLAS), "sample-app.db"))
  })

  it("resolves --output as a file or directory", () => {
    const atlasPath = FIXTURE_ATLAS
    const parent = path.dirname(atlasPath)
    expect(resolveOutputPath(undefined, atlasPath)).toBe(path.join(parent, "sample-app.db"))
    expect(resolveOutputPath(parent, atlasPath)).toBe(path.join(parent, "sample-app.db"))
    expect(resolveOutputPath(`${parent}/`, atlasPath)).toBe(path.join(parent, "sample-app.db"))
    expect(resolveOutputPath(path.join(parent, "custom.db"), atlasPath)).toBe(path.join(parent, "custom.db"))
    expect(resolveOutputPath(path.join(parent, "nested"), atlasPath)).toBe(path.join(parent, "nested", "sample-app.db"))
  })

  it("builds default index path under scip-cli cache", () => {
    const repo = makeGitRepo();
    const indexPath = defaultIndexPath(repo);
    expect(indexPath).toContain(".cache/scip-cli/projects/");
    expect(indexPath.endsWith("/index.db")).toBe(true);
    expect(indexPath).toContain(projectCacheSlug(repo));
  });

  it("resolves project basename to scip-cli cache slug", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-cli-projects-"));
    tempDirs.push(projectsDir);
    const cacheDir = path.join(projectsDir, "amazix-ai-bot-ba7e97");
    fs.mkdirSync(cacheDir);

    expect(resolveProjectCacheDir("amazix-ai-bot", projectsDir)).toBe(cacheDir);
    expect(resolveProjectCacheDir("amazix-ai-bot-ba7e97", projectsDir)).toBe(cacheDir);
  });

  it("errors on ambiguous project basename", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-cli-projects-"));
    tempDirs.push(projectsDir);
    fs.mkdirSync(path.join(projectsDir, "my-app-111111"));
    fs.mkdirSync(path.join(projectsDir, "my-app-222222"));

    expect(() => resolveProjectCacheDir("my-app", projectsDir)).toThrow(PathsError);
    expect(() => resolveProjectCacheDir("my-app", projectsDir)).toThrow(/ambiguous project/);
  });

  it("packs from --project repo path via scip-cli cache slug", () => {
    const repo = makeGitRepo();
    const paths = resolvePackPaths({ project: repo });
    expect(paths.repoPath).toBe(path.resolve(repo));
    expect(paths.indexPath).toBe(defaultIndexPath(repo));
    expect(paths.atlasPath).toBe(path.join(path.dirname(paths.indexPath), "atlas.db"));
  });

  it("rejects --repo and --project together", () => {
    expect(() => resolvePackPaths({ repo: ".", project: "my-app" })).toThrow(PathsError);
  });
});
