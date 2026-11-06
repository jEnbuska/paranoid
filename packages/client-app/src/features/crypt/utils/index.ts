import { encryptECDH, decryptECDH } from "~/features/crypt/utils/ecdh";
import {
  encryptWithPassword,
  decryptWithPassword,
} from "~/features/crypt/utils/password";

export async function encrypt<T>(
  data: T,
  args: {
    password: string;
    peerPublicKey: string;
    privateKey: string;
  },
): Promise<string> {
  const { password, peerPublicKey, privateKey } = args;
  if (!password) throw new Error("Password is required");
  if (!peerPublicKey) throw new Error("Peer public key is required");
  if (!privateKey) throw new Error("Private key is required");
  const encryptedMessage = await encryptECDH(data, {
    peerPublicKey,
    privateKey,
  });
  return encryptWithPassword(encryptedMessage, {
    password,
  });
}

export async function decrypt<T>(
  encryptedData: string,
  args: {
    password: string;
    peerPublicKey: string;
    privateKey: string;
  },
) {
  const { password, peerPublicKey, privateKey } = args;
  if (!password) throw new Error("Password is required");
  if (!peerPublicKey) throw new Error("Peer public key is required");
  if (!privateKey) throw new Error("Private key is required");
  try {
    const decryptedText = await decryptWithPassword<string>(encryptedData, {
      password,
    });
    return await decryptECDH<T>(decryptedText, { peerPublicKey, privateKey });
  } catch (e) {
    throw new Error("Failed to decryptData", { cause: e });
  }
}
