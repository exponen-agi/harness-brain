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
//      are documented as "omit if none", so they're not required) — and each
//      field must actually have content, not just be present (a field left
//      blank, or filled with a placeholder like "TBD", defeats the point of
//      the log just as much as a missing field does).
//   2. Each commit heading's "<sha>" looks like a real short SHA, not a
//      leftover template placeholder such as "<commit-short-sha>".
//   3. Each <YY-MM-DD> in a filename or heading is a real calendar date
//      (rejects e.g. "26-13-40").
//   4. Each <brain>/<YY-MM-DD>-HAR-compact.md has a "## <project>" block for
//      every repo folder that actually exists in that brain (flags a missing
//      block the same as an orphaned one that doesn't match any real folder —
//      both mean the rollup and the folders on disk have drifted apart).
//   5. Each compact rollup's H1 matches the documented heading shape:
//      "<brain> (<name>) — compact — <YY-MM-DD>" (see CONTRIBUTING.md rule 5).
//
// Exit code 0 = all good, 1 = at least one problem found (errors are printed
// to stderr with the file path, so this is safe to run in CI or locally).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FIELDS = ["What changed", "Why", "Files"];
const COMPACT_HEADING = /^# (brain-\d+) \(.+\) — compact — (\d{2}-\d{2}-\d{2})$/;
const SHA_HEADING = /^## (\S+) — .+$/;
const PLACEHOLDER_VALUES = new Set(["tbd", "todo", "n/a", "na", "-", "..."]);
const MIN_FIELD_LENGTH = 3;

/**
 * Is `yy-mm-dd` (two-digit year, month, day) a real calendar date? Rejects
 * out-of-range months/days (e.g. "26-13-40") that a naive regex would miss.
 * Pure — no filesystem access — so it's unit-testable in isolation.
 *
 * @param {string} yyMmDd
 * @returns {boolean}
 */
export function isValidYyMmDd(yyMmDd) {
  const match = /^(\d{2})-(\d{2})-(\d{2})$/.exec(yyMmDd);
  if (!match) return false;
  const [, yy, mm, dd] = match;
  const year = 2000 + Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Pull the text of one `**Field:**` value out of a commit section, up to the
 * next `**Field:**` label or the end of the section.
 *
 * @param {string} section
 * @param {string} field
 * @returns {string | undefined} undefined if the field isn't present at all
 */
function extractFieldValue(section, field) {
  // Only same-line whitespace after the label — a `\s*` here would also eat
  // the blank line separating an *empty* field from the next "**Field:**",
  // which erases the very boundary the lookahead below needs to spot it.
  const re = new RegExp(`\\*\\*${field}:?\\*\\*[ \\t]*([\\s\\S]*?)(?=\\n\\*\\*[^*]+:?\\*\\*|$)`);
  const match = re.exec(section);
  return match ? match[1].trim() : undefined;
}

/**
 * Evaluate one detailed log file's full text against the baseline content
 * rules. Pure function — no filesystem access — so it's unit-testable in
 * isolation.
 *
 * @param {string} text
 * @returns {string[]} issues found (empty array = pass)
 */
export function validateDetailedLogContent(text) {
  const issues = [];
  const sections = text.split(/^## /m).slice(1); // drop the H1 preamble
  if (sections.length === 0) {
    issues.push("no '## <sha> — <subject>' commit sections found");
    return issues;
  }

  for (const section of sections) {
    const headingLine = section.split("\n", 1)[0];
    const heading = "## " + headingLine;
    const shaMatch = SHA_HEADING.exec(heading);
    const sha = shaMatch?.[1];
    if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
      issues.push(`section "${heading}" doesn't start with a real short commit SHA`);
    }

    for (const field of REQUIRED_FIELDS) {
      const value = extractFieldValue(section, field);
      if (value === undefined) {
        issues.push(`section "${heading}" is missing required field **${field}:**`);
        continue;
      }
      if (value.length < MIN_FIELD_LENGTH || PLACEHOLDER_VALUES.has(value.toLowerCase())) {
        issues.push(
          `section "${heading}" has an empty or placeholder **${field}:** value ("${value}")`,
        );
      }
    }
  }

  return issues;
}

/**
 * Evaluate one compact rollup file's full text against the baseline content
 * rules, given the real repo folders that exist in its brain. Pure function —
 * no filesystem access — so it's unit-testable in isolation.
 *
 * @param {string} text
 * @param {readonly string[]} realRepoFolders
 * @returns {string[]} issues found (empty array = pass)
 */
export function validateCompactRollupContent(text, realRepoFolders) {
  const issues = [];
  const firstLine = text.split("\n", 1)[0];
  const headingMatch = COMPACT_HEADING.exec(firstLine);
  if (!headingMatch) {
    issues.push(
      `heading "${firstLine}" doesn't match "<brain> (<name>) — compact — <YY-MM-DD>" ` +
        `(see _templates/YY-MM-DD-HAR-compact.md)`,
    );
  } else if (!isValidYyMmDd(headingMatch[2])) {
    issues.push(`heading date "${headingMatch[2]}" is not a real calendar date`);
  }

  const projectHeadings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  if (projectHeadings.length === 0) {
    issues.push("no '## <project>' blocks found");
  }

  const realFolders = new Set(realRepoFolders);
  const coveredFolders = new Set();
  for (const project of projectHeadings) {
    if (!realFolders.has(project)) {
      issues.push(`"## ${project}" doesn't match any real repo folder in this brain`);
    } else {
      coveredFolders.add(project);
    }
  }
  for (const folder of realFolders) {
    if (!coveredFolders.has(folder)) {
      issues.push(`repo folder "${folder}" has no "## ${folder}" block in this compact rollup`);
    }
  }

  return issues;
}

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectsDir = path.join(root, "projects");

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

function main() {
  for (const brainDir of listBrains()) {
    for (const repoName of repoFoldersOf(brainDir)) {
      const repoDir = path.join(brainDir, repoName);
      for (const entry of readdirSync(repoDir)) {
        const dateMatch = /^(\d{2}-\d{2}-\d{2})-HAR\.md$/.exec(entry);
        if (!dateMatch) continue;
        const file = path.join(repoDir, entry);
        if (!isValidYyMmDd(dateMatch[1])) {
          fail(file, `filename date "${dateMatch[1]}" is not a real calendar date`);
        }
        const text = readFileSync(file, "utf8");
        for (const issue of validateDetailedLogContent(text)) fail(file, issue);
      }
    }

    for (const entry of readdirSync(brainDir)) {
      const dateMatch = /^(\d{2}-\d{2}-\d{2})-HAR-compact\.md$/.exec(entry);
      if (!dateMatch) continue;
      const file = path.join(brainDir, entry);
      if (!isValidYyMmDd(dateMatch[1])) {
        fail(file, `filename date "${dateMatch[1]}" is not a real calendar date`);
      }
      const text = readFileSync(file, "utf8");
      for (const issue of validateCompactRollupContent(text, repoFoldersOf(brainDir))) {
        fail(file, issue);
      }
    }
  }

  if (problems > 0) {
    console.error(`\n${problems} problem(s) found.`);
    process.exit(1);
  } else {
    console.log("All brain entries look well-formed.");
  }
}

// Only run the CLI when this file is executed directly (e.g. `node
// scripts/validate-entries.mjs`) — not when the exported functions are
// imported for unit testing, so importing this module never has side effects.
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  main();
}
