import { useSuspenseQuery } from "@tanstack/react-query";
import { socketQueryKey } from "~/features/socket/constants";
import { createSocket } from "~/features/socket/loader";
import useStable from "~/hooks/use-stable.ts";
import useUpdatedRef from "~/hooks/use-updated-ref.ts";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "shared-lib/types";
import { useDecrypt, useEncrypt } from "~/features/crypt/hooks";
import { useInbox } from "~/features/socket/inbox.ts";
import useAsyncEffect from "~/hooks/use-async-effect.ts";
import useComponentDidMount from "~/hooks/use-component-did-mount.ts";

export function useOnEvent<T extends keyof ServerToClientEvents>(
  type: T,
  handler: (...args: Parameters<ServerToClientEvents[T]>) => any,
) {
  const inbox = useInbox();
  const cb: any = useStable(handler);
  useAsyncEffect(async (signal) => {
    while (!signal.aborted) {
      const args = await inbox.take(type, signal);
      await cb(...args);
    }
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
  const decrypt = useDecrypt();
  const latest = useUpdatedRef(options);
  useComponentDidMount(async (signal) => {
    const { type, once } = latest.current;
    do {
      const args = await inbox.take(type, signal);
      const { callback, onError } = latest.current;
      try {
        await (callback as any)(
          ...(await Promise.all(args.map((arg) => decrypt(arg as string)))),
        );
      } catch (error) {
        if (signal.aborted) return;
        if (!onError) {
          // Stops listening and only reports the error. The error page would
          // replace a connection that can still succeed, for example without
          // a candidate that failed
          reportError(error);
          return;
        }
        onError(error);
      }
    } while (!once && !signal.aborted);
  });
}
