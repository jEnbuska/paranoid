import { CloseIcon, DoneIcon } from "~/components/Icon/icons.tsx";
import Spinner from "~/components/Spinner/Spinner.tsx";
import { capitalize, hyphenToSpace } from "shared-lib/utils/strings";
import invoke from "shared-lib/utils/invoke";
import { InviteConnectionProgressState } from "~/features/invite/types.ts";
import styles from "./styles.module.css";

type OwnProps = {
  progress: InviteConnectionProgressState;
};
export default function SignalingStateStatus({ progress }: OwnProps) {
  return (
    <span className={styles.status}>
      {capitalize(hyphenToSpace(progress.value))}
      {invoke(() => {
        switch (progress.type) {
          case "Signaling state": {
            switch (progress.value) {
              case "stable":
                return <DoneIcon size={"small"} />;
              case "closed":
                return <CloseIcon size={"small"} />;
              default:
                return <Spinner />;
            }
          }
          case "ICE Gathering State":
            switch (progress.value) {
              case "complete":
                return <DoneIcon size={"small"} />;
              default:
                return <Spinner />;
            }
          case "ICE Connection State":
            switch (progress.value) {
              case "connected":
                return <DoneIcon size={"small"} />;
              case "closed":
                return <CloseIcon size={"small"} />;
              default:
                return <Spinner />;
            }
          case "Peer Connection":
            switch (progress.value) {
              case "connected":
                return <DoneIcon size={"small"} />;
              case "closed":
                return <CloseIcon size={"small"} />;
              default:
                return <Spinner />;
            }
          case "Data Channel":
            switch (progress.value) {
              case "open":
                return <DoneIcon size={"small"} />;
              case "closed":
                return <CloseIcon size={"small"} />;
              default:
                return <Spinner />;
            }
          default:
            throw new Error(`Unknown state type ${(progress as any).type}`);
        }
      })}
    </span>
  );
}
