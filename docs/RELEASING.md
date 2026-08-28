# Releasing Remaining Usage

This repository contains source code only. Installers, portable executables,
checksums, and signatures belong in GitHub Releases, never in Git history.

## One-time GitHub configuration

Create these repository secrets before publishing a public release:

- `WIN_CSC_LINK`: encrypted or base64-encoded Windows code-signing certificate
  accepted by electron-builder.
- `WIN_CSC_KEY_PASSWORD`: password for that certificate.

Keep the certificate and its password outside the repository. The release
workflow deliberately fails without both secrets, so a tag cannot accidentally
publish an unsigned executable.

Enable branch protection for `main`, require the **CI** workflow, and restrict
who can create version tags. Enable Dependabot alerts and GitHub's private
vulnerability reporting.

## Create a release

1. Update `version` in `package.json` and the matching lockfile metadata.
2. Run `npm ci` followed by `npm run verify` locally.
3. Commit the source-only release change and tag it as `v<version>`.
4. Push the tag. The **Release** workflow builds both Windows targets, writes
   `SHA256SUMS.txt`, and creates the GitHub Release from that tag.
5. Download each generated executable from GitHub Releases. Verify its
   Authenticode signature and SHA-256 checksum before announcing it.
6. Smoke-test the installer and portable build using an ordinary Windows user
   account, both with a provider CLI signed in and with one unavailable.

Do not attach locally built binaries manually to a public release. A release
must be traceable to its tag and signed CI build.

## Release checklist

- `npm run verify` succeeds with no audit findings.
- Codex and Claude unavailable/stale states are still fail-safe.
- Claude workspace trust is still explicitly user-approved.
- The app launches, minimizes to tray, restores, and persists preferences.
- The installer and portable executable have the expected version, checksum,
  and valid code signature.
- Release notes disclose provider/CLI compatibility changes and known limits.
