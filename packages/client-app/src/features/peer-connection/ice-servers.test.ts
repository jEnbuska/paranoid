import { describe, expect, test } from "vitest";
import { defaultIceServers, parseIceServers } from "./ice-servers";

describe("parseIceServers", () => {
  describe("missing values", () => {
    test.each([[undefined], [""], ["   "]])(
      "%j gives the defaults",
      (value) => {
        expect(parseIceServers(value)).toEqual(defaultIceServers);
      },
    );

    test("the defaults are Google's STUN servers", () => {
      expect(defaultIceServers).toEqual([
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
          ],
        },
      ]);
    });
  });

  describe("valid values", () => {
    test.each([
      ["one URL as a string", [{ urls: "stun:stun.example.com:3478" }]],
      ["a list of URLs", [{ urls: ["stun:a.example", "stun:b.example:3478"] }]],
      ["several servers", [{ urls: "stun:a.test" }, { urls: "stuns:b.test" }]],
      ["an IPv4 address", [{ urls: "stun:127.0.0.1:3478" }]],
      ["an IPv6 address", [{ urls: "stun:[2001:db8::1]:3478" }]],
      ["no servers at all", []],
    ])("%s", (_name, servers) => {
      expect(parseIceServers(JSON.stringify(servers))).toEqual(servers);
    });
  });

  describe("invalid values", () => {
    test.each([
      ["not JSON", "stun:stun.example.com", /isn't valid JSON/],
      ["an object", '{"urls":"stun:a.test"}', /isn't an array/],
      ["a string in the array", '["stun:a.test"]', /at \[0\]/],
      ["no urls", "[{}]", /STUN URLs at \[0\]/],
      ["empty urls", '[{"urls":[]}]', /STUN URLs at \[0\]/],
      [
        "a number in urls",
        '[{"urls":["stun:a.test",1]}]',
        /STUN URLs at \[0\]/,
      ],
      ["a misspelled key", '[{"url":"stun:a.test"}]', /other than "urls"/],
      ["another scheme", '[{"urls":"https://a.test"}]', /STUN URLs at \[0\]/],
      ["a TURN URL", '[{"urls":"turn:a.test:3478"}]', /STUN URLs at \[0\]/],
      ["a query", '[{"urls":"stun:a.test?x=1"}]', /STUN URLs at \[0\]/],
      ["a port out of range", '[{"urls":"stun:a.test:65536"}]', /STUN URLs/],
      ["a second server", '[{"urls":"stun:a.test"},{}]', /at \[1\]/],
    ])("%s", (_name, value, message) => {
      expect(() => parseIceServers(value)).toThrow(message);
    });

    test("rejects credentials", () => {
      const value = JSON.stringify([
        { urls: "stun:a.test", username: "user", credential: "hunter2" },
      ]);
      expect(() => parseIceServers(value)).toThrow(/Credentials must not/);
    });

    test.each([
      ["a shape error", '[{"urls":"stun:a.test","credential":"hunter2"}]'],
      ["invalid JSON", '[{"urls":"stun:a.test","credential":"hunter2"}'],
      ["a bad URL", '[{"urls":"nope:hunter2"}]'],
    ])("doesn't quote the value in %s", (_name, value) => {
      expect(() => parseIceServers(value)).toThrow(/^VITE_ICE_SERVERS /);
      expect(() => parseIceServers(value)).not.toThrow(/hunter2/);
    });
  });
});
