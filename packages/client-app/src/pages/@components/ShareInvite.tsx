import Conditional from "~/components/Conditional.tsx";
import Button from "~/components/Button/Button.tsx";
import {
  CopyAllIcon,
  CopyPasswordIcon,
  ShareIcon,
} from "~/components/Icon/icons.tsx";
import SnackBarButton from "~/components/SnackBarButton.tsx";
import always from "shared-lib/utils/always";
import { useMemo, useReducer } from "react";
import { useInviteState } from "~/features/invite/hooks.ts";
import styles from "./styles.module.css";

export default function ShareInvite() {
  const [includePassword, toggleIncludePassword] = useReducer(
    (included) => !included,
    true,
  );
  const { password, inviteId } = useInviteState();
  const link = `${window.location.href}join/${inviteId}`;
  const shareData = useMemo(() => {
    return {
      url: link,
      title: "Join me on this chat",
      text: includePassword ? `Password: ${password}` : undefined,
    };
  }, [password, includePassword]);
  return (
    <div className={styles.invite}>
      <Conditional shown={Boolean(navigator.canShare?.(shareData))}>
        <div className={styles.share}>
          <Button
            endIcon={<ShareIcon size={"small"} />}
            onClick={() => navigator.share(shareData)}
          >
            Share direct link
          </Button>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={includePassword}
              onChange={toggleIncludePassword}
            />
            Include pass phrase with the invite
          </label>
        </div>
        <b className={styles.or}>or</b>
      </Conditional>
      <div className={styles.copy}>
        <SnackBarButton
          endIcon={<CopyAllIcon size={"small"} />}
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(always("Invite secret copied to clipboard"))
              .catch(always("Failed to copy invite secret to clipboard!"))
          }
        >
          Copy invite link
        </SnackBarButton>
        <SnackBarButton
          endIcon={<CopyPasswordIcon size={"small"} />}
          onClick={() =>
            navigator.clipboard
              .writeText(password)
              .then(always("Invite password copied to clipboard"))
              .catch(always("Failed to copy invite password to clipboard!"))
          }
        >
          Copy invite password
        </SnackBarButton>
      </div>
    </div>
  );
}
