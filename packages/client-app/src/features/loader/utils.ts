import { LoaderError } from "~/features/loader/LoaderError";
import { LoaderFunction, LoaderFunctionArgs } from "react-router";

export function createLoader<T = any>(
  name: string,
  cb: (args: LoaderFunctionArgs) => T,
): LoaderFunction {
  return async function loader(args: LoaderFunctionArgs) {
    try {
      const res = await cb(args);
      return res || null;
    } catch (error) {
      throw new LoaderError(`Failed to load ${name} data`, {
        cause: error,
        name,
      });
    }
  };
}
