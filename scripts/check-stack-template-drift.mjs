#!/usr/bin/env node
/**
 * Reciprocal drift check: harness-stack ships an offline mirror of this
 * repo's README.md, _templates/, and projects/ at templates/brain/, and its
 * own CI checks (from harness-stack's side) that the two stay
 * byte-identical. Until this script existed, that check only ran from
 * harness-stack — a structural change could be merged here without anyone
 * finding out harness-stack now fails, until someone happened to run
 * harness-stack's CI later. This runs the same comparison from this repo's
 * side too, so drift is caught on whichever repo's PR introduces it.
 *
 * Usage:
 *   node scripts/check-stack-template-drift.mjs [path-to-harness-stack]
 *
 * The harness-stack checkout is resolved from, in order:
 *   1. the CLI argument
 *   2. $HARNESS_STACK_DIR
 *   3. ../harness-stack (sibling checkout)
 *
 * Exit codes: 0 = in sync · 1 = drift · 2 = harness-stack checkout not found.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Top-level entries harness-stack's mirror reproduces from this repo. */
const TRACKED = ["README.md", "_templates", "projects"];

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const stackDir = path.resolve(
  process.argv[2] ||
    process.env.HARNESS_STACK_DIR ||
    path.join(root, "..", "harness-stack"),
);
const mirrorDir = path.join(stackDir, "templates", "brain");

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Recursively list files under `base`, limited to `roots`, as paths
 *  relative to `base`. Exported so the walk itself is unit-testable against
 *  disposable temp directories, without a live sibling checkout. */
export async function listTracked(base, roots) {
  const out = [];
  async function walk(rel) {
    const abs = path.join(base, rel);
    const st = await fs.stat(abs);
    if (st.isDirectory()) {
      for (const name of await fs.readdir(abs)) {
        await walk(path.join(rel, name));
      }
    } else {
      out.push(rel);
    }
  }
  for (const top of roots) {
    if (await exists(path.join(base, top))) await walk(top);
  }
  return out.sort();
}

/**
 * Byte-for-byte compare each `common` path between two roots. Exported (same
 * reason as `listTracked`) so the content-drift half of the check — the other
 * half of what `main()` reports — also runs against disposable temp
 * directories instead of only ever being exercised via a live CI clone.
 *
 * @param {string} baseA
 * @param {string} baseB
 * @param {readonly string[]} commonPaths relative paths present under both
 * @returns {Promise<string[]>} the subset of commonPaths whose content differs
 */
export async function computeContentDrift(baseA, baseB, commonPaths) {
  const drifted = [];
  for (const rel of commonPaths) {
    const [a, b] = await Promise.all([
      fs.readFile(path.join(baseA, rel), "utf8"),
      fs.readFile(path.join(baseB, rel), "utf8"),
    ]);
    if (a !== b) drifted.push(rel);
  }
  return drifted;
}

/**
 * Compare this repo's tracked file list against the mirror's tracked file
 * list. Pure function — no filesystem access — so it's unit-testable
 * without a real checkout of either repo.
 *
 * @param {readonly string[]} brainFiles
 * @param {readonly string[]} mirrorFiles
 */
export function diffFileLists(brainFiles, mirrorFiles) {
  const mirrorSet = new Set(mirrorFiles);
  const brainSet = new Set(brainFiles);
  return {
    missingFromMirror: brainFiles.filter((f) => !mirrorSet.has(f)),
    extraInMirror: mirrorFiles.filter((f) => !brainSet.has(f)),
    common: brainFiles.filter((f) => mirrorSet.has(f)),
  };
}

async function main() {
  if (!(await exists(stackDir))) {
    console.error(
      `! harness-stack checkout not found at: ${stackDir}\n` +
        `  Pass a path, set HARNESS_STACK_DIR, or place it at ../harness-stack.`,
    );
    process.exit(2);
    return;
  }
  if (!(await exists(mirrorDir))) {
    console.error(`✗ mirror dir missing in harness-stack: ${mirrorDir}`);
    process.exit(1);
    return;
  }

  const [brainFiles, mirrorFiles] = await Promise.all([
    listTracked(root, TRACKED),
    listTracked(mirrorDir, TRACKED),
  ]);

  const { missingFromMirror, extraInMirror, common } = diffFileLists(
    brainFiles,
    mirrorFiles,
  );

  const contentDrift = await computeContentDrift(root, mirrorDir, common);

  const problems = missingFromMirror.length + extraInMirror.length + contentDrift.length;

  if (problems === 0) {
    console.log(
      `✓ this repo is in sync with ${path.relative(process.cwd(), mirrorDir) || mirrorDir} ` +
        `(${common.length} files checked)`,
    );
    return;
  }

  console.error("✗ this repo has drifted from harness-stack's templates/brain/ mirror:\n");
  for (const f of missingFromMirror)
    console.error(`  - in this repo, missing from the mirror:  ${f}`);
  for (const f of extraInMirror)
    console.error(`  - in the mirror, missing from this repo:  ${f}`);
  for (const f of contentDrift)
    console.error(`  - content differs:                        ${f}`);
  console.error(
    `\nResync: update harness-stack's templates/brain/ (or this repo) so the two ` +
      `match again, then re-run \`npm run verify:stack-template\`. See CONTRIBUTING.md.`,
  );
  process.exitCode = 1;
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
