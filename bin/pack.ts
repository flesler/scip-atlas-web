#!/usr/bin/env node
import { buildExplorerDb } from "./pack/build.js";
import { PackError } from "./pack/slim.js";
import { PathsError, resolvePackPaths } from "./pack/paths.js";

function parseArgs(argv: string[]) {
  const options: {
    repo?: string;
    index?: string;
    atlas?: string;
    output?: string;
  } = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") {
      options.repo = argv[++i];
    } else if (arg === "--index") {
      options.index = argv[++i];
    } else if (arg === "--atlas") {
      options.atlas = argv[++i];
    } else if (arg === "--output") {
      options.output = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npx tsx bin/pack.ts [options]

Options:
  --repo PATH    Git repo root (default: git root of cwd)
  --index PATH   Full scip-cli index.db (default: ~/.cache/scip-cli/.../index.db)
  --atlas PATH   Atlas sidecar (default: atlas.db beside index)
  --output PATH  Output explorer.db (default: explorer.db beside atlas)
`);
}

function main() {
  try {
    const paths = resolvePackPaths(parseArgs(process.argv.slice(2)));
    buildExplorerDb(paths);
  } catch (error) {
    if (error instanceof PackError || error instanceof PathsError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main();
