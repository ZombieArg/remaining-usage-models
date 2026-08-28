# Security policy

## Supported versions

Only the latest release published in GitHub Releases is supported with security
fixes. Development builds and artifacts shared outside Releases are not a
trusted distribution channel.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability, especially if
it could expose an authenticated CLI session or allow command injection.

Use GitHub's private security advisory form for this repository:

https://github.com/ZombieArg/remaining-usage-models/security/advisories/new

Include reproduction steps, the app and CLI versions, impact, and any safe
proof of concept. Do not include API keys, tokens, cookies, terminal history,
or personal usage data. We will acknowledge the report and coordinate a fix
before public disclosure.

## Security model

The application intentionally does not read credential files, persist tokens,
or accept arbitrary commands from the renderer. It starts only detected local
provider CLIs with fixed, read-only usage commands. Those CLIs use the user's
own already-authenticated sessions.

Provider CLI output and local protocols can change. If a response cannot be
validated, the app reports it as unavailable or stale instead of guessing a
quota value.
