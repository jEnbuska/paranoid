import { describe, test, expect } from "vitest";
import {
  decryptECDH,
  encryptECDH,
  generateECDHKeyPair,
} from "~/features/crypt/utils/ecdh";
import {
  decryptWithPassword,
  encryptWithPassword,
} from "~/features/crypt/utils/password";
import { decrypt, encrypt } from "~/features/crypt/utils";

describe("crypt", () => {
  test("password protected data", async () => {
    const password = "=6UmzRuJ!Z+(.X{k";
    const publicKey =
      "BAH/7iCOyFNGbk9EqWUPPnXwcNq3tVdBexM2YKx7UhsJGF4T45urVEjjrRm3JHlTltSAatHdIc29gUMTvSeJaoykaQEkt4wUA5rWU6ALAIwmVr/i+p62R/zDXt5Mfth7+X1xITwnKkAZm3GON4jdqbwJ0ABfS9N9duoaiy3j9YNrwwVIEw==";
    const hash = await encryptWithPassword(publicKey, {
      password,
    });
    expect(hash).toBeDefined();
    const data = await decryptWithPassword<string>(hash, {
      password,
    });
    expect(hash).toBeDefined();
    expect(data).toBe(publicKey);
  });

  test("ECDH + Password", async () => {
    // Generates keys
    const { privateKey, publicKey } = await generateECDHKeyPair();

    // Generate peer keys
    const { privateKey: peerPrivateKey, publicKey: peerPublicKey } =
      await generateECDHKeyPair();

    const password = "Bad password!";
    {
      const message = "Hello, Peer!";
      const encryptedMessage = await encrypt<string>(message, {
        password,
        peerPublicKey,
        privateKey,
      });

      const decryptedMessage = await decrypt<string>(encryptedMessage, {
        password,
        peerPublicKey: publicKey,
        privateKey: peerPrivateKey,
      });
      expect(decryptedMessage).toBe(message);
    }
  });

  test("ECDH", async () => {
    // Peer A generates keys
    const { privateKey, publicKey } = await generateECDHKeyPair();

    // Peer B generates keys
    const { privateKey: peerPrivateKey, publicKey: peerPublicKey } =
      await generateECDHKeyPair();
    {
      const message = "Hello, Peer!";
      const encrypted = await encryptECDH(message, {
        privateKey,
        peerPublicKey,
      });
      const decryptedMessage = await decryptECDH(encrypted, {
        peerPublicKey: publicKey,
        privateKey: peerPrivateKey,
      });
      expect(decryptedMessage).toBe(message);
    }
    {
      const response = "Hello back!";
      const encrypted = await encryptECDH(response, {
        peerPublicKey: publicKey,
        privateKey: peerPrivateKey,
      });
      const decryptedResponse = await decryptECDH(encrypted, {
        privateKey,
        peerPublicKey,
      });
      expect(decryptedResponse).toBe(response);
    }
  });
});
