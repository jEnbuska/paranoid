import Fieldset from "~/components/Fieldset/Fieldset.tsx";
import JoinInviteContent from "~/pages/join/[inviteId]/_components/JoinInviteContent.tsx";
import { useInitAnswer } from "~/pages/hooks.ts";
import Spinner from "~/components/Spinner/Spinner.tsx";

export default function JoinInvitePage() {
  const { isLoading } = useInitAnswer();
  return (
    <>
      <Fieldset legend={"Join an existing invite"}>
        {isLoading ? <Spinner /> : <JoinInviteContent />}
      </Fieldset>
    </>
  );
}
