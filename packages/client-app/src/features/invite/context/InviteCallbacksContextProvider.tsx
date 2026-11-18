import { InviteContextCallbacks } from "~/features/invite/types";
import { defaultInviteContextState } from "~/features/invite/constants";
import { generateECDHKeyPair } from "~/features/crypt/utils/ecdh";
import { createPeerConnection } from "~/features/peer-connection/utils";
import { useMemoOnce } from "~/hooks/use-memo-once";
import { v4 as uuid } from "uuid";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import InviteStateContext from "./InviteStateContext";
import { decryptWithPassword } from "~/features/crypt/utils/password";
import InviteCallbacksContext from "./InviteCallbacksContext";
import { Outlet } from "react-router";
import CommonPageLayout from "~/components/CommonPageLayout.tsx";
import Main from "~/components/Main.tsx";
import { use } from "react";
import { createMetaChannel } from "~/features/channel/create.ts";
import { getChannelInbox } from "~/features/channel/inbox.ts";
import { createChannelCrypt } from "~/features/channel/crypt.ts";

export default function InviteCallbacksContextProvider() {
  const { updateState, getState } = use(InviteStateContext);
  const callbacks = useMemoOnce((): InviteContextCallbacks => ({
    onClosed: () => updateState({ active: false }),
    async initOffer(displayName) {
      const { privateKey, publicKey } = await generateECDHKeyPair();
      return updateState({
        privateKey,
        publicKey,
        displayName,
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
        // Public key will be encrypted when user inputs their display name and answers the offer
        peerPublicKeyEncrypted,
        expiresAt: expiresAt,
        inviteId,
        active: true,
      });
    },
    async answerOffer({ password, displayName }) {
      const { peerPublicKeyEncrypted, privateKey } = getState();
      const peerPublicKey = await decryptWithPassword<string>(
        peerPublicKeyEncrypted,
        { password },
      );
      const connection = createPeerConnection();
      const channel = createMetaChannel(
        connection,
        createChannelCrypt({ password, peerPublicKey, privateKey }),
      );
      void updateState({
        peerPublicKey,
        connection,
        password,
        displayName,
        channel,
      });
    },
    resetInviteContext() {
      const { channel } = getState();
      if (channel) getChannelInbox(channel).clear();
      channel?.close();
      if (getState() === defaultInviteContextState) return Promise.resolve();
      return updateState(defaultInviteContextState);
    },
    async createOfferPeerConnection(peerPublicKeyEncrypted) {
      const { password, privateKey } = getState();
      const peerPublicKey = await decryptWithPassword<string>(
        peerPublicKeyEncrypted,
        { password },
      );
      const connection = createPeerConnection();
      const channel = createMetaChannel(
        connection,
        createChannelCrypt({ password, peerPublicKey, privateKey }),
      );
      // EstablishingOfferPeerConnectionStep creates the offer once it listens
      // for candidates
      return updateState({
        peerPublicKey,
        connection,
        channel,
      });
    },
    handshake: (peerDisplayName) =>
      updateState({ peerDisplayName, stage: "connected" }),
  }));
  useAbortableEffect(
    () =>
      window.addEventListener("beforeunload", () =>
        getState().channel?.close(),
      ),
    [],
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
