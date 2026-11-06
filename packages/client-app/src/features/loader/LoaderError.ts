export class LoaderError extends Error {
  name: string;
  constructor(
    message: string,
    { name, ...rest }: { cause: unknown; name: string },
  ) {
    super(message, rest);
    this.name = name;
  }
}
