# Security policy

## Supported versions

Only the latest tagged version is supported with security fixes. This project
publishes no binaries by design, so the supported form is a build you produce
yourself from that tag. Any executable offered as a build of this project did
not come from here, and is not a trusted distribution channel.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability, especially if
it could expose an authenticated CLI session or allow command injection.

Use GitHub's private security advisory form for this repository:

https://github.com/ZombieArg/remaining-usage-models/security/advisories/new

Include reproduction steps, the app and CLI versions, impact, and any safe
proof of concept. Do not include API keys, tokens, cookies, terminal history,
or personal usage data.

Reports are read and handled on a best-effort basis by one person in their
spare time. Acknowledgement may take a while, and this project cannot offer a
guaranteed response time or a disclosure deadline. Please take that into
account before deciding how and when to disclose publicly.

## Security model

The application intentionally does not read credential files, persist tokens,
or accept arbitrary commands from the renderer. It starts only detected local
provider CLIs with fixed, read-only usage commands. Those CLIs use the user's
own already-authenticated sessions.

Provider CLI output and local protocols can change. If a response cannot be
validated, the app reports it as unavailable or stale instead of guessing a
quota value.
