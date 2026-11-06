import createResolvable from "../create-resolvable.ts";

describe("createResolvable", () => {
  it("resolves with the provided value", async () => {
    const { resolve, promise } = await createResolvable<number>();
    resolve(123);
    await expect(promise).resolves.toBe(123);
  });
  it("rejects with the provided error", async () => {
    const { reject, promise } = await createResolvable();
    reject("fail");
    await expect(promise).rejects.toBe("fail");
  });
});
