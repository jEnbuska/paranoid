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
