# Signaling server

Rules for `packages/signaling-server`, on top of the root [CLAUDE.md](../../CLAUDE.md), which also has the privacy rule that the server forgets an invite once the peers have connected.

- Keep it thin: Node.js built-ins plus socket.io. No web framework, middleware or dotenv; its only job is holding invites in memory and relaying encrypted payloads.
- Configuration comes from environment variables (`PORT`, `HOST`, `CORS_ORIGINS`, `MAX_INVITES`), loaded from `packages/signaling-server/.env` and then `.env.local` with Node's `--env-file-if-exists`. Document new variables in `.env` and the root README's configuration table.
- Never log event payloads, even encrypted ones. Log startup, shutdown, connections, disconnections and errors only.
- socket.io's `cors` option is the only CORS handling. The client sends no cookies, so don't enable `credentials`.
