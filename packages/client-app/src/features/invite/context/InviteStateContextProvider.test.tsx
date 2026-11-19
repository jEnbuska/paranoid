// @vitest-environment jsdom
import { StrictMode, use, useEffect } from "react";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import InviteStateContext from "./InviteStateContext";
import InviteStateContextProvider from "./InviteStateContextProvider";

test("closes the connection and the channel when it unmounts, as the error page replaces it", async () => {
  const connection = { close: vi.fn() } as unknown as RTCPeerConnection;
  const channel = { close: vi.fn() } as unknown as RTCDataChannel;
  function Connect() {
    const { updateState } = use(InviteStateContext);
    useEffect(() => void updateState({ connection, channel }), []);
    return null;
  }
  const { unmount } = render(
    <StrictMode>
      <MemoryRouter>
        <InviteStateContextProvider>
          <Connect />
        </InviteStateContextProvider>
      </MemoryRouter>
    </StrictMode>,
  );
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  expect(connection.close).not.toHaveBeenCalled();

  unmount();
  expect(connection.close).toHaveBeenCalled();
  expect(channel.close).toHaveBeenCalled();
});
