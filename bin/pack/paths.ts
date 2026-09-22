import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const INDEX_DB = "index.db";
export const EXPLORER_DB = "explorer.db";
export const CACHE_SLUG_MAX_LEN = 48;
export const ROOT_HASH_LEN = 12;

export class PathsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathsError";
  }
}

export function projectRootHash(projectRoot: string): string {
  return createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, ROOT_HASH_LEN);
}

export function projectCacheSlug(projectRoot: string): string {
  const root = path.resolve(projectRoot);
  const parts = root.split(path.sep);
  const slugBase = path.basename(root) || parts[parts.length - 1] || "project";
  let slug = slugBase.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  if (slug.length > CACHE_SLUG_MAX_LEN) {
    slug = slug.slice(0, CACHE_SLUG_MAX_LEN).replace(/-+$/, "");
  }
  const digest = projectRootHash(root).slice(0, 6);
  return `${slug}-${digest}`;
}

export function scipCliCacheDir(projectRoot: string): string {
  return path.join(homedir(), ".cache", "scip-cli", "projects", projectCacheSlug(projectRoot));
}

export function defaultIndexPath(projectRoot: string): string {
  return path.join(scipCliCacheDir(projectRoot), INDEX_DB);
}

export function defaultAtlasPath(indexPath: string): string {
  return path.join(path.dirname(indexPath), "atlas.db");
}

export function defaultOutputPath(atlasPath: string): string {
  return path.join(path.dirname(atlasPath), EXPLORER_DB);
}

export function compressedOutputPath(outputPath: string): string {
  if (outputPath.endsWith(".gz")) {
    return outputPath;
  }
  return `${outputPath}.gz`;
}

export function explorerDbPath(outputPath: string): string {
  if (outputPath.endsWith(".gz")) {
    return outputPath.slice(0, -3);
  }
  return outputPath;
}

export function resolveGitRoot(start?: string): string {
  const base = path.resolve(start ?? process.cwd());
  try {
    const out = execFileSync("git", ["-C", base, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
    return path.resolve(out);
  } catch {
    throw new PathsError(`not a git repository: ${base}`);
  }
}

export type ResolvedPaths = {
  repoPath: string;
  indexPath: string;
  atlasPath: string;
  outputPath: string;
};

export function resolvePackPaths(options: {
  repo?: string;
  index?: string;
  atlas?: string;
  output?: string;
}): ResolvedPaths {
  const repoPath = options.repo ? resolveGitRoot(options.repo) : resolveGitRoot();
  const indexPath = path.resolve(options.index ?? defaultIndexPath(repoPath));
  const atlasPath = path.resolve(options.atlas ?? defaultAtlasPath(indexPath));
  const outputPath = path.resolve(options.output ?? defaultOutputPath(atlasPath));
  return { repoPath, indexPath, atlasPath, outputPath };
}
