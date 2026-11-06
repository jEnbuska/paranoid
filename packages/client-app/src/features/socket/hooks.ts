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

export function useOnEvent<T extends keyof ServerToClientEvents>(
  type: T,
  handler: (...args: Parameters<ServerToClientEvents[T]>) => any,
) {
  const socket = useSocket();
  const cb: any = useStable(handler);
  useEffect(() => {
    socket.on(type, cb);
    return () => {
      socket.off(type, cb);
    };
  }, [socket]);
}

export function useSocket() {
  return useSuspenseQuery({
    queryKey: socketQueryKey,
    queryFn: createSocket,
  }).data;
}

export function useEmitEventEncrypted() {
  const socket = useSocket();
  const encrypt = useEncrypt();
  return useStable(async function emitEncrypted<
    E extends "CANDIDATE" | "DESCRIPTION" | "JOIN" | "DONE" | "CLOSE",
  >(type: E, ...args: Parameters<ClientToServerEvents[E]>): Promise<void> {
    const params = await Promise.all(args.map(encrypt));
    (socket.emit as any)(type, ...params);
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
  const socket = useSocket();
  const controller = useAbortController();
  const decrypt = useDecrypt();
  const callback = useStable(() => {
    const { type, once, callback, onError } = options;
    function handleEvent(...args: any) {
      return Promise.all(args.map(decrypt))
        .then((params) => (callback as any)(...params))
        .catch(onError);
    }
    const method = once ? "once" : "on";
    socket[method](type, handleEvent as any);
    controller.signal.addEventListener("abort", () =>
      socket.off(type, handleEvent as any),
    );
  });
  useComponentDidMount(callback);
}
