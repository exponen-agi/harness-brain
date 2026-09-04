// Unit tests for the pure validation functions in validate-entries.mjs.
// Uses Node's built-in test runner — this repo has zero dependencies, so a
// test framework that ships with Node itself keeps that true.
//
// Run with: npm test  (or: node --test scripts/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidYyMmDd,
  validateDetailedLogContent,
  validateCompactRollupContent,
} from "./validate-entries.mjs";

test("isValidYyMmDd accepts a real calendar date", () => {
  assert.equal(isValidYyMmDd("26-06-07"), true);
});

test("isValidYyMmDd rejects an out-of-range month", () => {
  assert.equal(isValidYyMmDd("26-13-40"), false);
});

test("isValidYyMmDd rejects an out-of-range day", () => {
  assert.equal(isValidYyMmDd("26-02-30"), false);
});

test("isValidYyMmDd rejects a malformed string", () => {
  assert.equal(isValidYyMmDd("2026-06-07"), false);
});

const validEntry = `# repo — 26-06-07 (detailed log)

## a1b2c3d — Add retry to the webhook sender

**What changed:** Wrapped the outbound webhook POST in a 3-attempt retry with backoff.

**Why:** Flaky downstream endpoint was dropping ~2% of events silently.

**Files:** \`src/webhooks.ts\`
`;

test("validateDetailedLogContent passes a well-formed entry", () => {
  assert.deepEqual(validateDetailedLogContent(validEntry), []);
});

test("validateDetailedLogContent passes a well-formed entry with CRLF line endings", () => {
  // A Windows checkout (git's default core.autocrlf) hands this function
  // "\r\n" line endings — a real entry must not fail validation just
  // because of which OS checked it out.
  assert.deepEqual(validateDetailedLogContent(validEntry.replace(/\n/g, "\r\n")), []);
});

test("validateDetailedLogContent flags a missing field", () => {
  const text = validEntry.replace(/\*\*Files:\*\*.*\n?/, "");
  const issues = validateDetailedLogContent(text);
  assert.ok(issues.some((i) => i.includes("missing required field **Files:**")));
});

test("validateDetailedLogContent flags a blank field value", () => {
  const text = validEntry.replace(/\*\*Why:\*\*.*/, "**Why:**");
  const issues = validateDetailedLogContent(text);
  assert.ok(issues.some((i) => i.includes("empty or placeholder **Why:**")));
});

test("validateDetailedLogContent flags a placeholder field value", () => {
  const text = validEntry.replace(/\*\*Why:\*\*.*/, "**Why:** TBD");
  const issues = validateDetailedLogContent(text);
  assert.ok(issues.some((i) => i.includes("empty or placeholder **Why:**")));
});

test("validateDetailedLogContent flags a leftover template SHA placeholder", () => {
  const text = validEntry.replace("a1b2c3d", "<commit-short-sha>");
  const issues = validateDetailedLogContent(text);
  assert.ok(issues.some((i) => i.includes("real short commit SHA")));
});

test("validateDetailedLogContent flags a file with no commit sections at all", () => {
  const issues = validateDetailedLogContent("# repo — 26-06-07 (detailed log)\n\nJust prose.\n");
  assert.ok(issues.some((i) => i.includes("no '## <sha>")));
});

const validRollup = `# brain-1 (Ledger) — compact — 26-06-07

## ledger-api
- a1b2c3d Add retry to the webhook sender

## ledger-web
- f9e8d7c Bump the API client to v2
`;

test("validateCompactRollupContent passes when every real folder has a block", () => {
  const issues = validateCompactRollupContent(validRollup, ["ledger-api", "ledger-web"]);
  assert.deepEqual(issues, []);
});

test("validateCompactRollupContent passes a well-formed rollup with CRLF line endings", () => {
  const issues = validateCompactRollupContent(
    validRollup.replace(/\n/g, "\r\n"),
    ["ledger-api", "ledger-web"],
  );
  assert.deepEqual(issues, []);
});

test("validateCompactRollupContent flags an orphaned block with no matching folder", () => {
  const issues = validateCompactRollupContent(validRollup, ["ledger-api", "ledger-web", "ledger-cli"]);
  assert.ok(issues.some((i) => i.includes('repo folder "ledger-cli" has no')));
});

test("validateCompactRollupContent flags a real folder missing its block", () => {
  const issues = validateCompactRollupContent(validRollup, ["ledger-api"]);
  assert.ok(issues.some((i) => i.includes('"## ledger-web" doesn\'t match any real repo folder')));
});

test("validateCompactRollupContent flags a malformed heading", () => {
  const text = validRollup.replace(
    "# brain-1 (Ledger) — compact — 26-06-07",
    "# Ledger compact rollup",
  );
  const issues = validateCompactRollupContent(text, ["ledger-api", "ledger-web"]);
  assert.ok(issues.some((i) => i.includes("doesn't match")));
});

test("validateCompactRollupContent flags an invalid calendar date in the heading", () => {
  const text = validRollup.replace("26-06-07", "26-13-40");
  const issues = validateCompactRollupContent(text, ["ledger-api", "ledger-web"]);
  assert.ok(issues.some((i) => i.includes("not a real calendar date")));
});
