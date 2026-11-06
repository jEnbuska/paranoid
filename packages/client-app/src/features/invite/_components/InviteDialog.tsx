import Conditional from "~/components/Conditional";
import Dialog from "~/components/Dialog/Dialog";
import { InviteStageType } from "~/features/invite/types";
import { useInviteState, useInviteCallbacks } from "~/features/invite/hooks";
import { ComponentType } from "react";

type OwnProps = {
  title: string;
  openStage: InviteStageType;
  Component: ComponentType;
};
export default function InviteDialog({
  openStage,
  title,
  Component,
}: OwnProps) {
  const { stage, active } = useInviteState();
  const { onClosed } = useInviteCallbacks();
  return (
    <Conditional
      Component={Dialog}
      shown={active && stage === openStage}
      onClose={onClosed}
      title={title}
    >
      <Component />
    </Conditional>
  );
}
