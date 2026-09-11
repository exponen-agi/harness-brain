# Security Policy

## Supported versions

This repo is plain Markdown with no releases or version numbers — there's
one supported line: **the latest content on `main`.**

## Reporting a vulnerability

This repo has no code that runs in production and no dependencies (see
`package.json` — zero `dependencies`/`devDependencies`), so "vulnerability"
here mostly means something in the two Node scripts under `scripts/`
(`validate-entries.mjs` and its test file) or in the GitHub Actions CI
workflow — for example, a crafted file path or filename that could make the
validator read or write somewhere unintended, or a workflow change that
could leak a secret.

Please **do not** open a public GitHub issue for a security concern — that
publishes the details before a fix exists. Instead, use GitHub's private
reporting:

1. Go to the [Security tab](https://github.com/exponen-agi/harness-brain/security/advisories/new)
   of this repository.
2. Click **"Report a vulnerability"** and describe what you found.

This reaches the maintainer(s) listed in
[`.github/CODEOWNERS`](.github/CODEOWNERS) privately.

If you don't have (or don't want) a GitHub account, opening a regular issue
with **no technical details** — just "I think I found a security issue,
please contact me" plus a way to reach you — is fine too; a maintainer will
follow up privately.

## What to expect

We aim to acknowledge reports within a few days and keep you updated as a
fix is worked on. Please give us reasonable time to ship a fix before any
public disclosure.
