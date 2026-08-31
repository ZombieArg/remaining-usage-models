# Privacy

Remaining Usage is a local Windows desktop application. It has no telemetry,
analytics endpoint, account backend, advertising SDK, or remote configuration
service.

## What it uses

- The authenticated session already managed by the locally installed Codex or
  Claude CLI.
- A user-selected Claude workspace path, only to start Claude in that folder.
- Local preferences: window position, visibility, compact mode, refresh
  interval, the start-with-Windows choice, configured CLI paths, and the
  selected Claude workspace.

## What it does not do

- It does not request, copy, read, or store API keys, access tokens, cookies,
  credential files, chat prompts, source code, or raw terminal output.
- It does not send usage data to a service operated by this project.
- It does not keep a history of your usage. Each reading replaces the previous
  one in memory and is never written to disk, so there is no record of how much
  of your plan you used and when.
- It does not submit provider prompts, approve Claude workspace-trust dialogs,
  purchase credits, alter quotas, or bypass provider limits.

The installed provider CLIs may communicate with their respective services as
part of their normal authenticated operation. Their own privacy terms and
network behavior apply independently.
