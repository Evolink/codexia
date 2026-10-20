# Contributing to Codexia

Thanks for your interest in improving Codexia! This guide explains how to set up your environment, make changes, and submit contributions.

## Development Setup

Prerequisites:
- Tauri v2 toolchain (see https://v2.tauri.app/start/prerequisites/)
- Bun package manager
- Rust toolchain (for the Tauri backend)

## Installation

Clone:
```bash
git clone https://github.com/milisp/codexia
cd codexia
```

Install dependencies:
```bash
bun install
```

Optional environment setup:
```sh
cp .env.example .env
```

Use this when you need to configure local environment variables for development or cloud-backed integrations.

Run the app in development:
```bash
bun tauri dev
```

Copy the pre-commit hook used in this repo to prevent common frontend issues.
```bash
cp docs/pre-commit .git/hooks/pre-commit
```

Build the frontend only:
```bash
# codex app-server generate-ts -o src/bindings  # Option to develop new codex feature
bun run build
```

Rust checks and formatting:
```bash
cd src-tauri && cargo check
# cd src-tauri && cargo fmt --all # Option format
```

## Pull Request Process

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Make changes with clear, English-only code comments and docs.
4. Before pushing, verify builds pass:
   - `bun run build`
   - `cd src-tauri && cargo check`
5. Push your branch: `git push origin feature/amazing-feature`.
6. Open a Pull Request and describe your changes, rationale, and testing steps.

## Listing an MCP server

Connectors are maintainer-picked. To propose one, follow [`registry/README.md`](registry/README.md).

Listing is free. Reviews happen when a maintainer has time, there is no deadline, and an
open pull request is not a rejection. Sponsoring does not guarantee a listing or a
**Featured** slot. For featured placement or a joint announcement, contact the maintainer
at [milisp@proton.me](mailto:milisp@proton.me) before opening a pull request.

## Reporting Bugs and Requesting Features

- Use GitHub Issues for bug reports and feature requests.
- Include steps to reproduce, expected vs. actual behavior, logs/screenshots, and environment details.

## Style and Conventions

- Language: English-only for code comments and documentation.
- UI: shadcn UI components with Tailwind CSS.
- State: Zustand with persistence.
- Keep changes minimal, focused, and consistent with the existing codebase.

## Related Docs

- Project usage: [USAGE](docs/USAGE.md)
- Architecture overview: [ARCHITECTURE](docs/ARCHITECTURE.md)

## Learning Resources

- Tauri v2: https://v2.tauri.app/start/
- LLM Notes (Tauri): https://tauri.app/llms.txt
