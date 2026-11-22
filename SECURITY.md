# Security

This repository is public and holds no credentials, no user data and no
internal addresses. `scripts/check-public.mjs` (part of `npm test` and CI)
fails on secrets, internal hosts and machine paths in tracked files.

The app it builds is read-only: the host exposes one command,
`awai_host_info`, and no filesystem, network, shell or installer permission;
the page declares no external operation and the APK asks for no INTERNET
permission.

Please report a vulnerability privately through GitHub's
"Report a vulnerability" (Security → Advisories) on this repository. Do not
open a public issue for it.
