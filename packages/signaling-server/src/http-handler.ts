import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Answers the HTTP requests socket.io doesn't claim: it handles `/socket.io/`
 * itself and only passes other paths to the server's own request listener.
 *
 * The health response is constant and isn't logged, so it can't reveal whether
 * anyone is using the server.
 */
export function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  const path = req.url?.split("?")[0];
  if (req.method === "GET" && path === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
}
