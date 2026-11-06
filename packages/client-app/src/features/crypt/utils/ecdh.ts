// Generate ECDH key pair
import memoize from "shared-lib/utils/memoize";
import {
  base64ToArrayBuffer,
  arrayBufferToBase64,
} from "~/features/crypt/utils/base64";

export async function generateECDHKeyPair() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveKey"],
  );
  return {
    privateKey: await crypto.subtle
      .exportKey("pkcs8", privateKey)
      .then(arrayBufferToBase64),
    publicKey: await crypto.subtle
      .exportKey("raw", publicKey)
      .then(arrayBufferToBase64),
  };
}

const importECDHPublicKey = memoize((publicKey: string) => {
  return crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(publicKey),
    { name: "ECDH", namedCurve: "P-521" },
    true,
    [],
  );
});
const importECDHPrivateKey = memoize((privateKey: string) => {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(privateKey),
    { name: "ECDH", namedCurve: "P-521" }, // Must match the exported key
    true,
    ["deriveKey"],
  );
});
// Derive shared key using peer's public key
const deriveSharedECDHKey = memoize(
  async (privateKey: string, peerPublicKey: string) => {
    return await crypto.subtle.deriveKey(
      { name: "ECDH", public: await importECDHPublicKey(peerPublicKey) },
      await importECDHPrivateKey(privateKey),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  },
);

export async function encryptECDH<T>(
  data: T,
  args: { peerPublicKey: string; privateKey: string },
) {
  const { peerPublicKey, privateKey } = args;
  const key = await deriveSharedECDHKey(privateKey, peerPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Generate a random IV
  const encodedData = new TextEncoder().encode(JSON.stringify(data));
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedData,
  );
  return `${arrayBufferToBase64(iv)}${arrayBufferToBase64(encryptedData)}`;
}

export async function decryptECDH<T>(
  encrypted: string,
  args: { peerPublicKey: string; privateKey: string },
) {
  const iv = base64ToArrayBuffer(encrypted.slice(0, 16));
  const data = base64ToArrayBuffer(encrypted.slice(16));
  const { peerPublicKey, privateKey } = args;
  const key = await deriveSharedECDHKey(privateKey, peerPublicKey);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  return JSON.parse(new TextDecoder().decode(decryptedBuffer)) as T;
}
