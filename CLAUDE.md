# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current State

This repository (`daily-useful-tools`) is currently a bare skeleton. As of this writing it contains only:

- `LICENSE` — MIT License, Copyright (c) 2026 keyakizakap-alt
- `CLAUDE.md` — this file

There is **no source code, build system, dependency manifest, test suite, or CI configuration yet**. The name suggests the intended purpose is a collection of small, standalone utility tools for everyday use, but no implementation exists.

Because nothing has been built yet, there are no project-specific build, lint, or test commands to document. This section should be replaced with concrete instructions once tooling is introduced.

## Guidance for Establishing the Project

When adding the first real code, make foundational choices explicit so this file can be updated to match:

- **Language / runtime**: not yet chosen. The first commit that introduces a manifest (e.g. `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`) sets the direction — record it here along with how to install dependencies.
- **Structure**: a "collection of tools" repo typically grows as either one directory per tool or a single CLI with subcommands. Pick one deliberately and keep it consistent; document the chosen layout here once it exists.
- **Commands**: once a build/test/lint toolchain is in place, add the exact commands (including how to run a single test) to a "Commands" section above.

Keep this file updated as the codebase takes shape — replace the "Current State" section with real architecture notes once there are multiple files whose relationships are worth explaining.

## Conventions

- Licensed under MIT; preserve the license header and copyright.
