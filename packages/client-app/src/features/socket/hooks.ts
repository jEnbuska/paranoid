import { useEffect } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { socketQueryKey } from "~/features/socket/constants";
import { createSocket } from "~/features/socket/loader";
import useStable from "~/hooks/use-stable.ts";
import { useAbortController } from "~/hooks/use-abort-controller";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "shared-lib/types";
import useComponentDidMount from "~/hooks/use-component-did-mount";
import { useDecrypt, useEncrypt } from "~/features/crypt/hooks";
import { useInbox } from "~/features/socket/inbox.ts";
import useReject from "~/hooks/use-reject.ts";

export function useOnEvent<T extends keyof ServerToClientEvents>(
  type: T,
  handler: (...args: Parameters<ServerToClientEvents[T]>) => any,
) {
  const inbox = useInbox();
  const cb: any = useStable(handler);
  const reject = useReject();

  useEffect(() => {
    const controller = new AbortController();
    async function handleNext() {
      if (controller.signal.aborted) return;
      try {
        await inbox.take(type, controller.signal).then((args) => cb(...args));
      } catch (e) {
        if (controller.signal.aborted) return;
        return reject(e);
      }
      void handleNext();
    }
    void handleNext();
    return () => {
      controller.abort();
    };
  }, []);
}

export function useSocket() {
  return useSuspenseQuery({
    queryKey: socketQueryKey,
    queryFn: createSocket,
  }).data;
}

export function useEmitIntroduction() {
  const { send } = useInbox();
  const encrypt = useEncrypt();
  return useStable(async function emitEncrypted<
    E extends "CANDIDATE" | "DESCRIPTION" | "DONE",
  >(type: E, ...args: Parameters<ClientToServerEvents[E]>): Promise<void> {
    // Queued, so that events reach the server in the order they were emitted
    // here. Encrypting takes time, and without the queue an event with no
    // payload (DONE) would leave before a payload that is still being encrypted
    await send(async (emit) => {
      const params = await Promise.all(args.map(encrypt));
      (emit as any)(type, ...params);
    });
  });
}

export function useOnEventDecrypted<
  E extends "CANDIDATE" | "DESCRIPTION" | "JOIN" | "DONE",
>(options: {
  type: E;
  once?: boolean;
  /** Called when decrypting the event or its callback fails */
  onError?: (error: unknown) => void;
  callback: (...args: Parameters<ServerToClientEvents[E]>) => any;
}) {
  const inbox = useInbox();
  const controller = useAbortController();
  const decrypt = useDecrypt();
  const callback = useStable(async () => {
    const { type, once, callback, onError } = options;
    function handleEvent(...args: any) {
      return Promise.all(args.map(decrypt))
        .then((params) => (callback as any)(...params))
        .catch(onError);
    }
    do {
      await inbox
        .take(type, controller.signal)
        .then((args) => handleEvent(...args))
        .catch(onError);
    } while (!once && !controller.signal.aborted);
  });
  useComponentDidMount(callback);
}
