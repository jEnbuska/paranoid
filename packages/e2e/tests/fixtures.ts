import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

export type PeerOptions = {
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
 *
 * The app's handshake needs ICE gathering to end after signaling and before
 * the handshake itself ends. Without STUN servers it can end within
 * milliseconds, and on a busy machine too late. So the app gets the end of
 * candidates exactly when ICE connects, whenever gathering really ends: by then
 * both sides have each other's descriptions, and the handshake hasn't started.
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
  class TestPeerConnection extends NativePeerConnection {
    constructor(configuration?: RTCConfiguration) {
      super({ ...configuration, iceServers: options.iceServers });
      record.connections.push(this);
      let released = false;
      let releasing = false;
      // Added before any listener of the app, so the app never sees the original
      this.addEventListener("icecandidate", (event) => {
        if (event.candidate || releasing) return;
        event.stopImmediatePropagation();
      });
      this.addEventListener("iceconnectionstatechange", () => {
        const connected = ["connected", "completed"].includes(
          this.iceConnectionState,
        );
        if (released || !connected) return;
        released = true;
        releasing = true;
        this.dispatchEvent(
          new RTCPeerConnectionIceEvent("icecandidate", { candidate: null }),
        );
        releasing = false;
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
  /** A person with their own browser context, on a blank page */
  openPeer(options?: PeerOptions): Promise<Page>;
};

export const test = base.extend<Fixtures>({
  openPeer: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    const externalRequests: string[] = [];
    await use(async (options = {}) => {
      const context = await browser.newContext(options.context);
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
    expect(externalRequests, "requests outside this machine").toEqual([]);
  },
});

export { expect };
