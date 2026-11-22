# Security policy

Paranoid is a peer-to-peer, end-to-end encrypted chat, so a security bug matters. Thank you for reporting one.

## Reporting a vulnerability

Report it privately, through the [**Report a vulnerability**](https://github.com/jEnbuska/paranoid/security/advisories/new) form on the repository's Security tab. Only the maintainer, and anyone they add to the report, can see it. Never report a vulnerability in a public issue, pull request or discussion, because the details would be public before a fix is out.

The form is the only channel. There is no email address or other contact for security reports.

A good report contains:

- the affected version or commit;
- the steps to reproduce it;
- the impact: what an attacker could do, and what they need for it.

Contributors find the same in CONTRIBUTING.md's ["Reporting a security vulnerability"](CONTRIBUTING.md#reporting-a-security-vulnerability) section.

## Scope

In scope:

- the client app (`packages/client-app`);
- the signaling server (`packages/signaling-server`);
- the end-to-end encryption and the peer-to-peer connection;
- the deploy workflows and scripts in `deploy/` and `.github/`;
- the handling of secrets, in the repository and its workflows.

Out of scope:

- a fork's own deployment and its cloud account;
- third-party services, such as the STUN servers, sslip.io, Let's Encrypt and the cloud providers;
- social engineering.

## What to expect

Paranoid is a personal open-source project. There is no bug bounty and no guaranteed response time, but every report is taken seriously.

The fix is made privately, in the advisory's temporary private fork, and released like any other change, through `dev` into `main`. The advisory is published once the fix is out.

## Supported versions

Only the latest `main` is supported. Fixes aren't backported to older commits.

## How the repository is checked

- **Dependencies: `pnpm audit`.** CI audits a PR into `dev` that changes the dependencies, and the whole tree on every PR into `main` and push to it, so a finding of high severity or worse blocks the release. [`audit.yml`](.github/workflows/audit.yml) also audits the whole tree weekly. The details are in the README's ["Continuous integration"](README.md#continuous-integration).
- **Actions: Dependabot.** Every action is pinned to a commit SHA, and Dependabot keeps them current. It doesn't check the npm dependencies. CONTRIBUTING.md's ["Dependabot"](CONTRIBUTING.md#dependabot) says what it does and doesn't do here.
- **Code: CodeQL.** GitHub's CodeQL code scanning is required: an alert blocks the merge. The README's ["Continuous integration"](README.md#continuous-integration) says what it analyses and when.
- **Secrets: secret scanning and gitleaks.** GitHub's secret scanning is on, with push protection. CI also runs [gitleaks](https://github.com/gitleaks/gitleaks) over the commits of every PR and push, with the token rules in [`.gitleaks.toml`](.gitleaks.toml) for providers GitHub doesn't know. See the README's ["Continuous integration"](README.md#continuous-integration).
