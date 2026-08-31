# Versioning Remaining Usage

This repository contains source code only. It publishes no installers, no
portable executables and no GitHub Release assets, so there is nothing here
about build servers or signing keys.

## Why there are no binaries

Signing a Windows executable requires a code-signing certificate whose private
key is held on certified hardware. Without one, a published `.exe` triggers
SmartScreen and gives a user no way to tell a genuine build from a tampered
one. Telling people to click through that warning on a file they downloaded is
the habit this project would rather not teach.

Everyone able to use this app has already installed a provider CLI, so asking
them to run `npm ci && npm run dist` costs them little and gives them a build
whose provenance they do not have to take on faith. `node-pty` ships prebuilt
Windows binaries, so no C++ toolchain is involved.

If that changes, a signed release is a matter of restoring a workflow, not
redesigning the project.

## Cut a version

1. Update `version` in `package.json` and the matching lockfile metadata.
   `npm version --no-git-tag-version <version>` does both.
2. Run `npm ci` followed by `npm run verify`.
3. Commit the version change and tag it as `v<version>`.
4. Push the branch and the tag. The tag is the release: GitHub serves a source
   archive for it, and it is what `SECURITY.md` means by the supported version.

## Before tagging

- `npm run verify` succeeds with no audit findings.
- Codex and Claude unavailable/stale states are still fail-safe.
- Claude workspace trust is still explicitly user-approved.
- The app launches, minimizes to tray, restores, and persists preferences.
- `npm run dist` produces both Windows targets and the installer runs on an
  ordinary Windows user account, with a provider CLI signed in and with one
  unavailable.
- Release notes disclose provider/CLI compatibility changes and known limits.

## Repository configuration

Enable branch protection for `main`, require the **CI** workflow, and restrict
who can create version tags. Enable Dependabot alerts and GitHub's private
vulnerability reporting.
