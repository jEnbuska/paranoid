import { encrypt, decrypt } from "~/features/crypt/utils";
import type { Decrypt, Encrypt } from "./types.ts";

/**
 * Encrypt and decrypt with the peer's keys, for `createMetaChannel`. The
 * channel reads and sends from its creation, before the keys are in the invite
 * state for `useEncrypt` and `useDecrypt`
 */
export function createChannelCrypt(keys: {
  password: string;
  peerPublicKey: string;
  privateKey: string;
}): { encrypt: Encrypt; decrypt: Decrypt } {
  return {
    encrypt: (data) => encrypt(data, keys),
    decrypt: (encrypted) => decrypt(encrypted, keys),
  };
}
