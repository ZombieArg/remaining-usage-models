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
audit. Use `npm run dist` to produce the NSIS installer and portable executable
in `release/`, which is also how users install the app: the project publishes no
binaries. Keep both targets working.

Tests must pass on a machine that has neither provider CLI installed. Inject the
locator and the probes rather than letting a test reach the real PATH, or it
will pass for you and fail for everyone else.

## Adding a provider

Before writing any code, check that the CLI reports **account-level remaining
quota**, not session token counts. A CLI that only reports what the current
session consumed cannot answer "how much of my plan is left" and does not
belong here. Most AI CLIs bill per token and expose no plan window at all.

Prefer a structured response, like the Codex app server's JSON-RPC, over
scraping a terminal UI, like Claude's `/status`. Screen output is a
presentation surface: it changes without notice and carries decoration that is
easy to mistake for data.

Providers are declared in `src/main/provider-registry.ts` as a total
`Record<ProviderId, ProviderDefinition>`. Adding an id fails the type check
until every part exists, so the compiler tells you what is still missing.

1. Add the id to `PROVIDERS` and its display name to `PROVIDER_NAMES`, both in
   `src/shared/usage.ts`.
2. Add the `PROVIDER_REGISTRY` entry in `src/main/provider-registry.ts`:
   - `commandName`: what `where.exe` looks for, and the executable name used
     when scanning known install folders.
   - `knownFolders(env)`: install locations outside PATH. Propose only real
     executables. The probes spawn without a shell, so a `.cmd` shim would
     trade a "not found" for an EINVAL on Node 20.12 and later.
   - `read(context)`: resolves to verified buckets, or throws one of the
     `DIAGNOSTIC_CODES` from `src/shared/usage.ts` as the error message.
3. Add tests. `src/main/provider-registry.test.ts` already asserts that names
   and commands stay unique and that each `read` uses only its own probe.

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
