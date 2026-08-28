# Contributing

Thanks for improving Remaining Usage.

## Development setup

Windows 10/11, Node.js 20+, and npm 10+ are required.

```powershell
git clone https://github.com/ZombieArg/remaining-usage-models.git
cd remaining-usage-models
npm ci
npm run verify
npm run dev:electron
```

`npm run verify` runs tests, type checks, the production build, and dependency
audit. Use `npm run dist` to produce a local NSIS installer and portable
executable in `release/`.

## Contribution rules

- Do not add credentials, provider output, usage screenshots, or personal
  paths to commits, fixtures, issues, or pull requests.
- Preserve the fail-safe behavior: an unrecognized provider response must be
  unavailable/stale, never an estimated quota.
- Keep command execution allowlisted and argument-free from renderer input.
- Add fixtures and tests for every supported provider-output variation.
- Do not automate acceptance of workspace-trust prompts.

## Pull requests

Describe the provider and CLI version tested, include focused tests, and avoid
unrelated formatting changes. A maintainer must review any change that expands
process execution, IPC, persistence, or provider parsing.
