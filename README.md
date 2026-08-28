# Remaining Usage

Local Windows overlay that shows plan-usage windows exposed by the Codex and
Claude CLIs already authenticated on your computer. It is a desktop monitor,
not a proxy and not an API quota dashboard.

The interface follows the Windows display language: Spanish for `es-*` locales
(including `es-AR`) and English otherwise.

> This project is independent and is not affiliated with, endorsed by, or
> sponsored by OpenAI or Anthropic. “Codex” and “Claude” are trademarks of
> their respective owners.

## What it does

- Reads Codex plan windows through the authenticated local Codex app server.
- Opens an isolated local terminal for Claude and asks only its fixed usage
  commands (`/status`, with `/usage` as fallback).
- Shows multiple verified windows when a provider exposes them, such as a
  short and an extended period.
- Refreshes every five minutes, preserves the last verified value as **stale**
  after a failed read, and never estimates missing limits.
- Plays an in-app double tone when a verified exhausted limit becomes available
  again; it does not rely on Windows notification sounds.

Read the [privacy notes](PRIVACY.md) and [security model](SECURITY.md) before
installing.

## Maintenance and support

This is a personal project, built and maintained by one person in spare time.
It is shared because it may be useful, not because it is a supported product.

- Issues and pull requests are welcome, and may go unanswered.
- There is no support commitment, response time, or roadmap.
- Provider CLIs change their output without notice. When that happens the app
  reports **unavailable** or **stale** rather than guessing, and a fix arrives
  whenever it arrives.

If you need something dependable, fork it. The MIT license is there for that.

## Install and use

This first public release supports **Windows 10/11** only.

> Prebuilt binaries are not published yet. Until they are, use
> [Build from source](#build-from-source); the numbered steps below describe
> the installer route for when a release exists.

1. Install the provider CLI or CLIs you want to monitor, then sign in to each
   using its normal, official flow. The app needs no API key and does not
   handle your credentials itself.
2. Download `Remaining-Usage-Setup-<version>.exe` from the project's
   **GitHub Releases** page and run it. Node.js and npm are not required for
   this route.
3. Launch **Remaining Usage**. A missing or unauthenticated provider is shown
   as unavailable; the other provider can still be monitored.
4. For Claude, select a workspace from the app. Open Claude yourself once in
   that same folder and approve its workspace-trust prompt if it appears. The
   app will never approve this prompt on your behalf.

The setup executable installs the app for the current Windows user. The
optional `Remaining-Usage-<version>-portable.exe` is an unpack-and-run build;
it does not add an installed application entry.

### If Windows SmartScreen warns you

Until a release is code-signed, Windows shows a blue "Windows protected your
PC" screen for the downloaded executable. That warning means the file has no
established publisher reputation yet. It is not a finding that the file is
harmful, and it is not a substitute for checking the file yourself.

Verify the SHA-256 hash first, as described below. If it matches the published
`SHA256SUMS.txt`, you may choose **More info** and then **Run anyway**. If the
hash does not match, delete the file and open an issue.

### Verify a download

Download `SHA256SUMS.txt` from the same GitHub Release as the executable.

```powershell
Get-FileHash .\Remaining-Usage-Setup-<version>.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
Get-AuthenticodeSignature .\Remaining-Usage-Setup-<version>.exe
```

The hash must match. Official releases are produced in GitHub Actions and are
blocked unless the release signing certificate is configured. Do not trust an
executable copied from an issue, chat, fork, or source-code archive.

## Privacy and limits

- No API keys, tokens, cookies, credential files, raw terminal output, source
  code, prompts, or usage snapshots are stored by this application.
- Only window position, compact mode, refresh interval, configured CLI paths,
  and the selected Claude workspace are persisted locally.
- The provider CLIs retain their normal authenticated network behavior. This
  app does not bypass plan limits, buy credits, reset usage, or send prompts.
- CLI output and local protocols are not stable public quota APIs. A changed
  format, missing login, timeout, or untrusted Claude workspace results in
  **unavailable** or **stale**, never a made-up percentage.

## Build from source

Use this route if you want to inspect or modify the application. It produces
an unsigned local artifact; it is not the recommended route for ordinary end
users.

```powershell
git clone https://github.com/ZombieArg/remaining-usage-models.git
cd remaining-usage-models
npm ci
npm run verify
npm run dist
npm run checksums
```

Artifacts are written to `release/` and intentionally ignored by Git:

- `Remaining-Usage-Setup-<version>.exe` — installer.
- `Remaining-Usage-<version>-portable.exe` — portable build.
- `SHA256SUMS.txt` — checksums generated locally or by the release workflow.

For development, run `npm run dev:electron` after `npm ci`.

## Project health

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Privacy notes](PRIVACY.md)
- [Release process](docs/RELEASING.md)
- [MIT License](LICENSE)

Before opening a pull request, run `npm run verify`. Please do not include
personal usage data, CLI output, credentials, or workspace paths in issues,
fixtures, screenshots, or commits.
