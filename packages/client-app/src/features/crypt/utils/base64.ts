// Helper function to convert ArrayBuffer to Base64 string
export function arrayBufferToBase64(
  buffer: ArrayBuffer | ArrayLike<number>,
): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// Helper function to convert Base64 string to ArrayBuffer
export function base64ToArrayBuffer(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
