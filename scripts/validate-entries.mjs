#!/usr/bin/env node
// Content-level validation for brain entries — a step up from the filename
// and folder-shape checks already run in .github/workflows/ci.yml.
//
// This repo has no dependencies (it's plain Markdown), so this script only
// uses Node's built-in modules and runs the same way on Linux, macOS, and
// Windows: `node scripts/validate-entries.mjs`.
//
// What it checks, for every brain under projects/<brain-n>/:
//   1. Each <repo>/<YY-MM-DD>-HAR.md has, for every "## <sha> — ..." commit
//      section, the three required fields in order: What changed, Why, Files
//      (see _templates/YY-MM-DD-HAR.md — Cross-repo impact and Flags / to-dos
//      are documented as "omit if none", so they're not required).
//   2. Each <brain>/<YY-MM-DD>-HAR-compact.md has a "## <project>" block for
//      every repo folder that actually exists in that brain (and flags an
//      orphaned "## <project>" block that doesn't match any real folder).
//   3. Each compact rollup's H1 matches the documented heading shape:
//      "<brain> (<name>) — compact — <YY-MM-DD>" (see CONTRIBUTING.md rule 5).
//
// Exit code 0 = all good, 1 = at least one problem found (errors are printed
// to stderr with the file path, so this is safe to run in CI or locally).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const projectsDir = path.join(root, "projects");

const REQUIRED_FIELDS = ["**What changed:**", "**Why:**", "**Files:**"];
const COMPACT_HEADING = /^# (brain-\d+) \(.+\) — compact — \d{2}-\d{2}-\d{2}$/;

let problems = 0;

function fail(file, message) {
  problems++;
  console.error(`${path.relative(root, file)}: ${message}`);
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listBrains() {
  if (!isDir(projectsDir)) return [];
  return readdirSync(projectsDir)
    .map((name) => path.join(projectsDir, name))
    .filter(isDir);
}

function repoFoldersOf(brainDir) {
  return readdirSync(brainDir)
    .filter((name) => isDir(path.join(brainDir, name)))
    .sort();
}

function validateDetailedLog(file) {
  const text = readFileSync(file, "utf8");
  const sections = text.split(/^## /m).slice(1); // drop the H1 preamble
  if (sections.length === 0) {
    fail(file, "no '## <sha> — <subject>' commit sections found");
    return;
  }
  for (const section of sections) {
    const heading = "## " + section.split("\n", 1)[0];
    for (const field of REQUIRED_FIELDS) {
      if (!section.includes(field)) {
        fail(file, `section "${heading}" is missing required field ${field}`);
      }
    }
  }
}

function validateCompactRollup(file, brainDir) {
  const text = readFileSync(file, "utf8");
  const firstLine = text.split("\n", 1)[0];
  if (!COMPACT_HEADING.test(firstLine)) {
    fail(
      file,
      `heading "${firstLine}" doesn't match "<brain> (<name>) — compact — <YY-MM-DD>" ` +
        `(see _templates/YY-MM-DD-HAR-compact.md)`,
    );
  }

  const projectHeadings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  if (projectHeadings.length === 0) {
    fail(file, "no '## <project>' blocks found");
  }

  const realRepoFolders = new Set(repoFoldersOf(brainDir));
  for (const project of projectHeadings) {
    if (!realRepoFolders.has(project)) {
      fail(file, `"## ${project}" doesn't match any repo folder in ${path.relative(root, brainDir)}/`);
    }
  }
}

for (const brainDir of listBrains()) {
  for (const repoName of repoFoldersOf(brainDir)) {
    const repoDir = path.join(brainDir, repoName);
    for (const entry of readdirSync(repoDir)) {
      if (/^\d{2}-\d{2}-\d{2}-HAR\.md$/.test(entry)) {
        validateDetailedLog(path.join(repoDir, entry));
      }
    }
  }

  for (const entry of readdirSync(brainDir)) {
    if (/^\d{2}-\d{2}-\d{2}-HAR-compact\.md$/.test(entry)) {
      validateCompactRollup(path.join(brainDir, entry), brainDir);
    }
  }
}

if (problems > 0) {
  console.error(`\n${problems} problem(s) found.`);
  process.exit(1);
} else {
  console.log("All brain entries look well-formed.");
}
