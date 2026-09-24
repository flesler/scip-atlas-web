#!/usr/bin/env node
import { buildExplorerDb } from "./pack/build.js"
import { PathsError, resolvePackPaths } from "./pack/paths.js"
import { PackError } from "./pack/slim.js"

function parseArgs(argv: string[]) {
  const options: {
    repo?: string;
    project?: string;
    index?: string;
    atlas?: string;
    output?: string;
    compress?: boolean;
  } = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") {
      options.repo = argv[++i];
    } else if (arg === "--project") {
      options.project = argv[++i];
    } else if (arg === "--index") {
      options.index = argv[++i];
    } else if (arg === "--atlas") {
      options.atlas = argv[++i];
    } else if (arg === "--output") {
      options.output = argv[++i];
    } else if (arg === "--compress") {
      options.compress = true;
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
  --repo PATH      Git repo root (default: git root of cwd)
  --project NAME   scip-cli cache slug or basename (e.g. my-app -> my-app-1a3f7a)
  --index PATH     Full scip-cli index.db (default: ~/.cache/scip-cli/.../index.db)
  --atlas PATH     Atlas sidecar (default: atlas.db beside index)
  --output PATH    Output explorer.db (default: explorer.db beside atlas)
  --compress     Write gzip-compressed explorer.db.gz instead of explorer.db
`);
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const paths = resolvePackPaths(args);
    buildExplorerDb(paths, { compress: args.compress });
  } catch (error) {
    if (error instanceof PackError || error instanceof PathsError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main();
