// Unit tests for check-stack-template-drift.mjs.
// Uses Node's built-in test runner — this repo has zero dependencies, so a
// test framework that ships with Node itself keeps that true.
//
// Run with: npm test  (or: node --test scripts/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  diffFileLists,
  listTracked,
  computeContentDrift,
} from "./check-stack-template-drift.mjs";

test("diffFileLists reports no differences when both lists match", () => {
  const files = ["README.md", "_templates/YY-MM-DD-HAR.md"];
  const result = diffFileLists(files, files);
  assert.deepEqual(result.missingFromMirror, []);
  assert.deepEqual(result.extraInMirror, []);
  assert.deepEqual(result.common, files);
});

test("diffFileLists flags a file present here but missing from the mirror", () => {
  const result = diffFileLists(
    ["README.md", "projects/brain-4/README.md"],
    ["README.md"],
  );
  assert.deepEqual(result.missingFromMirror, ["projects/brain-4/README.md"]);
  assert.deepEqual(result.extraInMirror, []);
  assert.deepEqual(result.common, ["README.md"]);
});

test("diffFileLists flags a file present in the mirror but missing here", () => {
  const result = diffFileLists(
    ["README.md"],
    ["README.md", "projects/brain-4/README.md"],
  );
  assert.deepEqual(result.missingFromMirror, []);
  assert.deepEqual(result.extraInMirror, ["projects/brain-4/README.md"]);
  assert.deepEqual(result.common, ["README.md"]);
});

test("diffFileLists returns empty results for two empty lists", () => {
  const result = diffFileLists([], []);
  assert.deepEqual(result.missingFromMirror, []);
  assert.deepEqual(result.extraInMirror, []);
  assert.deepEqual(result.common, []);
});

// listTracked and computeContentDrift previously ran only against a live
// clone of the sibling repo in CI (see the note in
// check-stack-template-drift.mjs's header). These tests exercise both
// against disposable temp directories instead, so the walk and the
// content-comparison logic are covered without a network call.

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "harness-brain-drift-test-"));
}

async function writeFiles(base, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(base, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }
}

test("listTracked finds nested files under tracked roots only, sorted", async () => {
  const base = await makeTempDir();
  try {
    await writeFiles(base, {
      "README.md": "hello",
      "_templates/YY-MM-DD-HAR.md": "template",
      "projects/brain-1/README.md": "brain one",
      "projects/brain-1/ledger-api/README.md": "nested",
      "not-tracked/ignored.md": "should not appear",
    });
    const found = await listTracked(base, ["README.md", "_templates", "projects"]);
    // listTracked joins path segments with path.join, which is
    // backslash-separated on Windows — build expectations the same way
    // rather than hardcoding "/", so this test holds on every OS.
    assert.deepEqual(found, [
      "README.md",
      path.join("_templates", "YY-MM-DD-HAR.md"),
      path.join("projects", "brain-1", "README.md"),
      path.join("projects", "brain-1", "ledger-api", "README.md"),
    ]);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("listTracked returns an empty list when none of the tracked roots exist", async () => {
  const base = await makeTempDir();
  try {
    const found = await listTracked(base, ["README.md", "_templates", "projects"]);
    assert.deepEqual(found, []);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("computeContentDrift reports no drift when common files are identical", async () => {
  const a = await makeTempDir();
  const b = await makeTempDir();
  try {
    await writeFiles(a, { "README.md": "same content\n" });
    await writeFiles(b, { "README.md": "same content\n" });
    const drift = await computeContentDrift(a, b, ["README.md"]);
    assert.deepEqual(drift, []);
  } finally {
    await fs.rm(a, { recursive: true, force: true });
    await fs.rm(b, { recursive: true, force: true });
  }
});

test("computeContentDrift flags only the files whose content actually differs", async () => {
  const a = await makeTempDir();
  const b = await makeTempDir();
  try {
    await writeFiles(a, {
      "README.md": "same content\n",
      "_templates/YY-MM-DD-HAR.md": "template v1\n",
    });
    await writeFiles(b, {
      "README.md": "same content\n",
      "_templates/YY-MM-DD-HAR.md": "template v2 — edited on one side only\n",
    });
    const drift = await computeContentDrift(a, b, [
      "README.md",
      "_templates/YY-MM-DD-HAR.md",
    ]);
    assert.deepEqual(drift, ["_templates/YY-MM-DD-HAR.md"]);
  } finally {
    await fs.rm(a, { recursive: true, force: true });
    await fs.rm(b, { recursive: true, force: true });
  }
});
