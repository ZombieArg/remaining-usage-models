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
  after a failed read, and never estimates missing limits. A reading nobody
  managed to refresh is marked stale on age alone.
- Updates each provider card as soon as that CLI answers, so a fast provider is
  never held back by a slow one.
- Shows remaining percentages in the tray tooltip and tints the tray icon by the
  tightest verified limit, so the window rarely has to be opened.
- Warns when a verified limit drops past 20% and then 10%, and plays an in-app
  double tone when an exhausted limit becomes available again; it does not rely
  on Windows notification sounds.
- Can start with Windows, and refreshes on wake instead of trusting a timer that
  does not fire while the machine is asleep.

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

**Windows 10/11 only.** This project ships source, not binaries: you build the
installer yourself and run what you built.

That is a deliberate choice rather than a missing feature. Signing a Windows
executable now requires a certificate whose private key lives on certified
hardware, and an unsigned download is exactly the thing this app tells you not
to trust. Everyone who can use this app already has a provider CLI installed,
so the toolchain is not the barrier it would be for a consumer application.

You need [Node.js](https://nodejs.org/) 20 or newer. No C++ toolchain is
required: the one native dependency ships prebuilt binaries for Windows.

1. Install the provider CLI or CLIs you want to monitor, then sign in to each
   using its normal, official flow. The app needs no API key and does not
   handle your credentials itself.
2. Build it:

   ```powershell
   git clone https://github.com/ZombieArg/remaining-usage-models.git
   cd remaining-usage-models
   npm ci
   npm run verify
   npm run dist
   ```

3. Run the installer written to `release/`. `Remaining-Usage-Setup-<version>.exe`
   installs the app for the current Windows user; the portable
   `Remaining-Usage-<version>-portable.exe` runs unpacked and adds no installed
   application entry.
4. Launch **Remaining Usage**. A missing or unauthenticated provider is shown
   as unavailable; the other provider can still be monitored.
5. For Claude, select a workspace from the app. Open Claude yourself once in
   that same folder and approve its workspace-trust prompt if it appears. The
   app will never approve this prompt on your behalf.

`npm run verify` in step 2 is not ceremony. It runs the tests, type checks and
audits dependencies, so a build that is broken or has a known vulnerability
fails before you install it.

### Windows will warn you about your own build

The executable you just produced is unsigned, so Windows shows a blue "Windows
protected your PC" screen the first time you run it. The warning means the file
has no established publisher reputation, not that anything is wrong with it.

You compiled this one from source you can read, on your own machine, so choose
**More info** and then **Run anyway**. Apply that reasoning only to a build you
produced yourself. An executable someone sends you from an issue, a chat, a
fork or a mirror has no such provenance, and this project publishes none to
compare it against.

For development, run `npm run dev:electron` after `npm ci`.

## Privacy and limits

- No API keys, tokens, cookies, credential files, raw terminal output, source
  code, prompts, or usage snapshots are stored by this application.
- Only window position, compact mode, refresh interval, the start-with-Windows
  choice, configured CLI paths, and the selected Claude workspace are persisted
  locally. Usage readings themselves are never written to disk.
- The provider CLIs retain their normal authenticated network behavior. This
  app does not bypass plan limits, buy credits, reset usage, or send prompts.
- CLI output and local protocols are not stable public quota APIs. A changed
  format, missing login, timeout, or untrusted Claude workspace results in
  **unavailable** or **stale**, never a made-up percentage.

## Project health

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Privacy notes](PRIVACY.md)
- [Versioning](docs/RELEASING.md)
- [MIT License](LICENSE)

Before opening a pull request, run `npm run verify`. Please do not include
personal usage data, CLI output, credentials, or workspace paths in issues,
fixtures, screenshots, or commits.
