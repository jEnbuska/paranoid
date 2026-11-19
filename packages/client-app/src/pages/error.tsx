import { useRouteError } from "react-router";
import { LoaderError } from "~/features/loader/LoaderError";
import { PeerConnectionError } from "~/features/peer-connection/PeerConnectionError";
import CommonPageLayout from "~/components/CommonPageLayout";
import Main from "~/components/Main";
import Alert from "~/components/Alert/Alert";
import invoke from "shared-lib/utils/invoke";
import styles from "./styles.module.css";

export default function AppError() {
  const error = useRouteError();
  return (
    <CommonPageLayout className={styles.errorLayout}>
      <Main>
        <Alert severity={"error"}>
          {invoke(() => {
            if (error instanceof PeerConnectionError) return error.message;
            if (error instanceof LoaderError) {
              return `An unexpected error occurred while loading ${error.name}`;
            }
            return "An unexpected error occurred";
          })}
        </Alert>
        <p aria-hidden="true">(╯°□°)╯︵ ┻━┻</p>
        <p>
          {/* A plain link, not the router's: loading the app again closes the
              socket and peer connection the failed invite left open, so the
              signaling server drops its invite and the start is clean */}
          <a href="/">Back to the start page</a>
        </p>
      </Main>
    </CommonPageLayout>
  );
}
