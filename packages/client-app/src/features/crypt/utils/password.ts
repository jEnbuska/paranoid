import { passwordValidator } from "~/validation/pass-phrase";
import {
  base64ToArrayBuffer,
  arrayBufferToBase64,
} from "~/features/crypt/utils/base64";

export async function encryptWithPassword<T>(
  data: T,
  args: {
    password: string;
  },
) {
  const stringToEncrypt = JSON.stringify(data);

  // Generate a random 16-byte salt for PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Encode password and string as Uint8Array
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(args.password);
  const stringBuffer = encoder.encode(stringToEncrypt);

  // Derive a key using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  // Derive a 256-bit AES key using PBKDF2 with the salt
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt, // Salt used for key derivation
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 }, // AES-256
    false,
    ["encrypt", "decrypt"],
  );

  // Generate a random 12-byte IV (Initialization Vector) for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the string using AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    stringBuffer,
  );

  // Concatenate IV + Encrypted Data + Salt before converting to Base64
  const combinedBuffer = new Uint8Array(
    iv.length + salt.length + encryptedBuffer.byteLength,
  );
  combinedBuffer.set(iv, 0);
  combinedBuffer.set(salt, iv.length);
  combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length + salt.length);

  // Convert the combined data to Base64
  return arrayBufferToBase64(combinedBuffer);
}

export async function decryptWithPassword<T>(
  encrypted: string,
  args: {
    password: string;
  },
): Promise<T> {
  try {
    // Decode the encrypted data from Base64
    const combinedBuffer = base64ToArrayBuffer(encrypted);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(args.password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    // Derive the AES key using PBKDF2 with the extracted salt
    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: combinedBuffer.slice(12, 28), // Using extracted salt
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    // Decrypt the data using AES-GCM
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combinedBuffer.slice(0, 12) },
      encryptionKey,
      combinedBuffer.slice(28),
    );

    return JSON.parse(new TextDecoder().decode(decryptedBuffer)) as T;
  } catch (error) {
    throw new Error("Failed to decryptWithPassword", { cause: error });
  }
}

export async function generateStrongPassword(
  length: number = 16,
): Promise<string> {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?";
  const passwordArray = new Uint8Array(length);

  // Generate cryptographically secure random values
  crypto.getRandomValues(passwordArray);

  // Convert random values to characters from charset
  const password = Array.from(
    passwordArray,
    (byte) => charset[byte % charset.length],
  ).join("");
  const error = await passwordValidator(password);
  if (!error) return password;
  return generateStrongPassword(length);
}
