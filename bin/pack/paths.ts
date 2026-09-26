import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { FALLBACK_PACKED_DB, packedDbBasename } from "./meta.js";

export const INDEX_DB = "index.db";
export const EXPLORER_DB = FALLBACK_PACKED_DB;
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

export function scipCliProjectsDir(): string {
  return path.join(homedir(), ".cache", "scip-cli", "projects");
}

export function scipCliCacheDir(projectRoot: string): string {
  return path.join(scipCliProjectsDir(), projectCacheSlug(projectRoot));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveProjectCacheDir(name: string, projectsDir = scipCliProjectsDir()): string {
  const exact = path.join(projectsDir, name);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) {
    return exact;
  }

  if (!fs.existsSync(projectsDir)) {
    throw new PathsError(`no scip-cli projects cache at ${projectsDir}`);
  }

  const pattern = new RegExp(`^${escapeRegExp(name)}-[a-f0-9]{6}$`);
  const matches = fs.readdirSync(projectsDir).filter((entry) => {
    const full = path.join(projectsDir, entry);
    return fs.statSync(full).isDirectory() && pattern.test(entry);
  });

  if (matches.length === 1) {
    return path.join(projectsDir, matches[0]);
  }
  if (matches.length > 1) {
    throw new PathsError(`ambiguous project "${name}": ${matches.join(", ")}`);
  }
  throw new PathsError(`unknown project "${name}" in ${projectsDir}`);
}

export function defaultIndexPath(projectRoot: string): string {
  return path.join(scipCliCacheDir(projectRoot), INDEX_DB);
}

export function defaultAtlasPath(indexPath: string): string {
  return path.join(path.dirname(indexPath), "atlas.db");
}

export function defaultOutputPath(atlasPath: string): string {
  return path.join(path.dirname(atlasPath), packedDbBasename(atlasPath));
}

function looksLikePackedDbFile(name: string): boolean {
  return name.endsWith(".db") || name.endsWith(".db.gz");
}

export function resolveOutputPath(output: string | undefined, atlasPath: string): string {
  if (!output) {
    return defaultOutputPath(atlasPath);
  }

  const resolved = path.resolve(output);
  const inferredName = packedDbBasename(atlasPath);

  if (fs.existsSync(resolved)) {
    if (fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, inferredName);
    }
    return resolved;
  }

  if (output.endsWith("/") || output.endsWith(path.sep)) {
    return path.join(resolved, inferredName);
  }

  if (looksLikePackedDbFile(path.basename(resolved))) {
    return resolved;
  }

  return path.join(resolved, inferredName);
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
  project?: string;
  index?: string;
  atlas?: string;
  output?: string;
}): ResolvedPaths {
  if (options.repo && options.project) {
    throw new PathsError("use only one of --repo and --project");
  }

  let repoPath: string;
  let indexPath: string;

  if (options.index) {
    indexPath = path.resolve(options.index);
    if (options.project) {
      const resolved = path.resolve(options.project);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        repoPath = resolved;
      } else {
        repoPath = resolveProjectCacheDir(options.project);
      }
    } else {
      repoPath = options.repo ? resolveGitRoot(options.repo) : resolveGitRoot();
    }
  } else if (options.project) {
    const resolved = path.resolve(options.project);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      repoPath = resolved;
      indexPath = path.resolve(defaultIndexPath(resolved));
    } else {
      const cacheDir = resolveProjectCacheDir(options.project);
      repoPath = cacheDir;
      indexPath = path.join(cacheDir, INDEX_DB);
    }
  } else {
    repoPath = options.repo ? resolveGitRoot(options.repo) : resolveGitRoot();
    indexPath = path.resolve(defaultIndexPath(repoPath));
  }

  const atlasPath = path.resolve(options.atlas ?? defaultAtlasPath(indexPath));
  const outputPath = resolveOutputPath(options.output, atlasPath);
  return { repoPath, indexPath, atlasPath, outputPath };
}
