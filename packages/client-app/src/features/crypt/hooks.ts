import { useInviteState } from "~/features/invite/hooks";
import useStable from "~/hooks/use-stable.ts";
import { encrypt, decrypt } from "~/features/crypt/utils";

export function useEncrypt() {
  const { password, peerPublicKey, privateKey } = useInviteState();
  return useStable(<T>(data: T) =>
    encrypt(data, { password, peerPublicKey, privateKey }),
  );
}
export function useDecrypt() {
  const { password, peerPublicKey, privateKey } = useInviteState();
  return useStable(<T>(encryptedData: string) =>
    decrypt<T>(encryptedData, { password, peerPublicKey, privateKey }),
  );
}
