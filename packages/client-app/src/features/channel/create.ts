export function createMetaChannel(connection: RTCPeerConnection) {
  return connection.createDataChannel("meta", {
    negotiated: true,
    id: 1,
    ordered: true, // Ensure data is received in the order it's sent
    protocol: "meta-data",
  });
}
