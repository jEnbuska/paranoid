import { useNavigate } from "react-router";
import IconButton from "~/components/IconButton/IconButton";
import { LogoutIcon } from "~/components/Icon/icons";
import { useInviteState } from "~/features/invite/hooks";
import styles from "./styles.module.css";

export default function ChatNav() {
  const navigate = useNavigate();
  const { peerName } = useInviteState();
  return (
    <header className={styles.header}>
      <h1 className={styles.peerName}>{peerName}</h1>
      <IconButton aria-label="Exit room" onClick={() => navigate("/")}>
        <LogoutIcon />
      </IconButton>
    </header>
  );
}
