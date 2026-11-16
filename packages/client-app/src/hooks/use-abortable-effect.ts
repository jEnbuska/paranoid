import {DependencyList, useEffect} from "react";
import {useAbortController} from "~/hooks/use-abort-controller.ts";

export function useAbortableEffect(cb: (signal: AbortSignal) => any, deps?: DependencyList) {
    useEffect(() => {
        const controller = useAbortController();
        queueMicrotask(() => {
            if(controller.signal.aborted) return;
            cb(controller.signal);
        });
        return () => {
            controller.abort()
        }
    }, deps);
}