import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { browsers, type BrowserName } from "./browsers.ts";
import {
  startSignalingServer,
  type SignalingServer,
} from "./signaling-server.ts";

export type PeerOptions = {
  /** The browser to open the person in. The project's own by default */
  browser?: BrowserName;
  /** ICE servers for the peer connections. Never a server outside this machine */
  iceServers?: RTCIceServer[];
  /**
   * What `navigator.clipboard.writeText` does: "record" keeps the text in the
   * page, "reject" fails like a denied permission, "real" uses the clipboard.
   */
  clipboard?: "record" | "reject" | "real";
  /** Makes the Web Share API available and records what is shared */
  webShare?: boolean;
  /** Makes each key derivation this much slower, like on a slow device */
  slowKeyDerivationMs?: number;
  context?: BrowserContextOptions;
};

/** What the init script records in the page */
export type PageRecord = {
  clipboard: string[];
  shared: ShareData[];
  connections: RTCPeerConnection[];
};
const recordKey = "__e2e";

/**
 * Runs in every page before the app.
 *
 * The app uses Google's STUN servers by default, and tests must not send
 * traffic there, so each peer connection gets only the
 * given ICE servers: none by default. Peers on one machine connect with host
 * candidates alone.
 */
function preparePage(options: {
  key: string;
  iceServers: RTCIceServer[];
  clipboard: NonNullable<PeerOptions["clipboard"]>;
  webShare: boolean;
  slowKeyDerivationMs: number;
}) {
  const record: PageRecord = { clipboard: [], shared: [], connections: [] };
  Object.assign(window, { [options.key]: record });

  if (options.clipboard !== "real") {
    navigator.clipboard.writeText = async (text) => {
      if (options.clipboard === "reject") throw new Error("Denied");
      record.clipboard.push(text);
    };
  }
  if (options.webShare) {
    navigator.canShare = () => true;
    navigator.share = async (data) => {
      if (data) record.shared.push(data);
    };
  }

  if (options.slowKeyDerivationMs) {
    const deriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
    crypto.subtle.deriveKey = async (...args: Parameters<typeof deriveKey>) => {
      await new Promise((resolve) =>
        setTimeout(resolve, options.slowKeyDerivationMs),
      );
      return deriveKey(...args);
    };
  }

  // Not every WebKit build has WebRTC
  const NativePeerConnection = window.RTCPeerConnection;
  if (!NativePeerConnection) return;
  // WebKit hides its addresses behind mDNS names (`<uuid>.local`) and has no
  // setting to turn that off. Under Playwright no browser resolves those
  // names, so the peer drops the candidates and ICE never starts. Both pages
  // run on this machine, so the name stands for an address that loopback
  // reaches too
  const mdnsHost = / [0-9a-f-]+\.local /gi;
  const loopback = (text: string) => text.replace(mdnsHost, " 127.0.0.1 ");
  class TestPeerConnection extends NativePeerConnection {
    constructor(configuration?: RTCConfiguration) {
      super({ ...configuration, iceServers: options.iceServers });
      record.connections.push(this);
    }
    override setRemoteDescription(description: RTCSessionDescriptionInit) {
      return super.setRemoteDescription({
        type: description.type,
        sdp: description.sdp && loopback(description.sdp),
      });
    }
    override addIceCandidate(candidate?: RTCIceCandidateInit | null) {
      if (!candidate?.candidate) return super.addIceCandidate(candidate);
      const { sdpMid, sdpMLineIndex, usernameFragment } = candidate;
      return super.addIceCandidate({
        candidate: loopback(candidate.candidate),
        sdpMid,
        sdpMLineIndex,
        usernameFragment,
      });
    }
  }
  window.RTCPeerConnection = TestPeerConnection;
}

/** Reads what the init script recorded */
export function pageRecord<T>(
  page: Page,
  read: (record: PageRecord) => T | Promise<T>,
): Promise<T> {
  return page.evaluate(
    ({ key, source }) => {
      const record = (window as unknown as Record<string, PageRecord>)[key];
      return new Function("record", `return (${source})(record)`)(record);
    },
    { key: recordKey, source: read.toString() },
  );
}

const isLocalUrl = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

type Fixtures = {
  /**
   * A person with their own browser context, on a blank page, in the
   * project's browser or the one given
   */
  openPeer(options?: PeerOptions): Promise<Page>;
  /** A signaling server process of the test's own, stopped after the test */
  startSignalingServer(env: Record<string, string>): Promise<SignalingServer>;
};

export const test = base.extend<Fixtures>({
  openPeer: async ({ browser, browserName, playwright }, use) => {
    const contexts: BrowserContext[] = [];
    const launched = new Map<BrowserName, Promise<Browser>>();
    const externalRequests: string[] = [];
    /**
     * Another browser, launched once per test. The project's launch options
     * apply to every browser launched in its worker, so each setting is
     * replaced by the other browser's own.
     */
    const launch = (name: BrowserName) => {
      if (!launched.has(name)) {
        launched.set(
          name,
          playwright[name].launch({
            args: [],
            firefoxUserPrefs: {},
            ...browsers[name].launchOptions,
          }),
        );
      }
      return launched.get(name)!;
    };
    await use(async (options = {}) => {
      const name = options.browser ?? browserName;
      const context = await (name === browserName
        ? browser.newContext(options.context)
        : launch(name).then((other) =>
            // The project's context options, such as its user agent, apply to
            // other browsers' contexts too, so these get their own device's
            other.newContext({ ...browsers[name].device, ...options.context }),
          ));
      contexts.push(context);
      await context.route(
        (url) => !isLocalUrl(url.href),
        (route) => {
          externalRequests.push(route.request().url());
          return route.abort();
        },
      );
      await context.addInitScript(preparePage, {
        key: recordKey,
        iceServers: options.iceServers ?? [],
        clipboard: options.clipboard ?? "record",
        webShare: options.webShare ?? false,
        slowKeyDerivationMs: options.slowKeyDerivationMs ?? 0,
      });
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all(
      [...launched.values()].map(async (other) => (await other).close()),
    );
    expect(externalRequests, "requests outside this machine").toEqual([]);
  },
  startSignalingServer: async ({ baseURL }, use) => {
    const servers: SignalingServer[] = [];
    await use(async (env) => {
      const server = await startSignalingServer({
        clientOrigin: new URL(baseURL!).origin,
        env,
      });
      servers.push(server);
      return server;
    });
    await Promise.all(servers.map((server) => server.stop()));
  },
});

export { expect };
