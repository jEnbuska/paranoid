import Spinner from "~/components/Spinner/Spinner.tsx";
import { useOnEvent } from "~/features/socket/hooks.ts";
import { useState } from "react";
import ShareInvite from "~/pages/@components/ShareInvite.tsx";
import Conditional from "~/components/Conditional.tsx";
import InviteExpiresIn from "~/features/invite/_components/InviteExpiresIn.tsx";
import styles from "./styles.module.css";

export default function ExchangeOfferInvite() {
  const [status, setStatus] = useState<"initial" | "shared" | "entered">(
    "initial",
  );
  useOnEvent("ENTER", () => setStatus("entered"));
  return (
    <>
      <p className={styles.exchangeText}>1. Next ask your contact to join</p>
      <ShareInvite />
      <p className={styles.exchangeText}>
        2. Then wait for someone to join the invite...
      </p>
      <Conditional
        shown={status === "entered"}
        element={"p"}
        className={styles.exchangeText}
      >
        3. Invited has been opened...
        <Conditional Component={Spinner} shown={status === "entered"} />
      </Conditional>
      <InviteExpiresIn />
    </>
  );
}
