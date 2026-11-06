import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { handleHttpRequest } from "../http-handler.ts";

const allowedOrigin = "http://allowed.test";

describe("handleHttpRequest", () => {
  let baseUrl: string;
  let io: Server;

  // Wired like server.ts, so the tests also cover how it shares the HTTP server with socket.io
  beforeAll(async () => {
    const httpServer = createServer(handleHttpRequest);
    io = new Server(httpServer, {
      cors: { origin: [allowedOrigin], methods: ["GET", "POST"] },
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await io.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers GET /healthz with 200 ok", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("ignores the query string", async () => {
    const response = await fetch(`${baseUrl}/healthz?probe=1`);
    expect(response.status).toBe(200);
  });

  it("doesn't log health requests", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    await fetch(`${baseUrl}/healthz`);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["/", "/health", "/healthz/", "/healthzz", "/socket"])(
    "answers %s with an empty 404",
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    },
  );

  it("answers other methods on /healthz with 404", async () => {
    const response = await fetch(`${baseUrl}/healthz`, { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("leaves the socket.io polling handshake and CORS to socket.io", async () => {
    const response = await fetch(
      `${baseUrl}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: allowedOrigin } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      allowedOrigin,
    );
    // Engine.IO "open" packet, followed by the session as JSON
    expect(await response.text()).toMatch(/^0\{"sid":/);
  });
});
