// Unit tests for the pure diff function in check-stack-template-drift.mjs.
// Uses Node's built-in test runner — this repo has zero dependencies, so a
// test framework that ships with Node itself keeps that true.
//
// Run with: npm test  (or: node --test scripts/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFileLists } from "./check-stack-template-drift.mjs";

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
