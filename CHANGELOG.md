# Changelog

All notable changes to harness-brain are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Raised the minimum supported Node.js version from 18 to 22, matching what
  CI actually exercises and the sibling
  [harness-stack](https://github.com/exponen-agi/harness-stack) repo's floor
  (Node 20 reached end-of-life in April 2026).

### Fixed

- The README no longer describes `cross-repo-discovery-agent` as something
  that runs today — it's a planned Phase 2 agent, not shipped yet. "How it
  is read" now documents the manual path (`harness seed`, or reading the
  rollup/logs directly) that works today.

## [Initial]

- `_templates/`, `projects/` worked examples (related-repos and
  unrelated-repos cases), `scripts/validate-entries.mjs`,
  `scripts/check-stack-template-drift.mjs`.
