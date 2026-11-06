import { InviteContextCallbacks } from "~/features/invite/types";
import { defaultInviteContextState } from "~/features/invite/constants";
import { generateECDHKeyPair } from "~/features/crypt/utils/ecdh";
import { createPeerConnection } from "~/features/peer-connection/utils";
import { useMemoOnce } from "~/hooks/use-memo-once";
import { v4 as uuid } from "uuid";
import useComponentDidMount from "~/hooks/use-component-did-mount";
import InviteStateContext from "./InviteStateContext";
import { decryptWithPassword } from "~/features/crypt/utils/password";
import InviteCallbacksContext from "./InviteCallbacksContext";
import { Outlet } from "react-router";
import CommonPageLayout from "~/components/CommonPageLayout.tsx";
import Main from "~/components/Main.tsx";
import { use } from "react";

export default function InviteCallbacksContextProvider() {
  const { updateState, getState } = use(InviteStateContext);
  const callbacks = useMemoOnce((): InviteContextCallbacks => ({
    onClosed: () => updateState({ active: false }),
    async initOffer(userName) {
      const { privateKey, publicKey } = await generateECDHKeyPair();
      return updateState({
        privateKey,
        publicKey,
        userName,
        userId: uuid(),
        stage: "offer",
        active: true,
      });
    },
    offerCreated: ({ password, expiresAt, inviteId }) =>
      updateState({ password, expiresAt, inviteId }),
    async initAnswer({ inviteId, expiresAt, peerPublicKeyEncrypted }) {
      const { privateKey, publicKey } = await generateECDHKeyPair();
      return updateState({
        privateKey,
        publicKey,
        userId: uuid(),
        stage: "answer",
        // Public key will be encrypted when use input's their username and answers the offer
        peerPublicKeyEncrypted,
        expiresAt: expiresAt,
        inviteId,
        active: true,
      });
    },
    async answerOffer({ password, userName }) {
      const { peerPublicKeyEncrypted } = getState();
      const connection = createPeerConnection();
      const peerPublicKey = await decryptWithPassword<string>(
        peerPublicKeyEncrypted,
        { password },
      );
      void updateState({
        peerPublicKey,
        connection,
        password,
        userName,
      });
    },
    resetInviteContext() {
      getState().channel?.close();
      if (getState() === defaultInviteContextState) return Promise.resolve();
      return updateState(defaultInviteContextState);
    },
    setAnswerChannel: (channel: RTCDataChannel) => updateState({ channel }),
    async createOfferPeerConnection(peerPublicKeyEncrypted) {
      const peerPublicKey = await decryptWithPassword<string>(
        peerPublicKeyEncrypted,
        { password: getState().password },
      );
      const connection = createPeerConnection();
      const channel = connection.createDataChannel("meta", {
        id: 1,
        ordered: true, // Ensure data is received in the order it's sent
        protocol: "meta-data",
      });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      return updateState({
        peerPublicKey,
        connection,
        channel,
      });
    },
    handshake: (peerName) => updateState({ peerName, stage: "connected" }),
  }));
  useComponentDidMount(() =>
    window.addEventListener("beforeunload", () => getState().channel?.close()),
  );
  return (
    <InviteCallbacksContext.Provider value={callbacks}>
      <CommonPageLayout>
        <Main>
          <Outlet />
        </Main>
      </CommonPageLayout>
    </InviteCallbacksContext.Provider>
  );
}
