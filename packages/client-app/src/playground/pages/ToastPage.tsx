import SnackBarButton from "~/components/SnackBarButton";
import { CopyAllIcon } from "~/components/Icon/icons";
import Example from "../Example";

export default function ToastPage() {
  return (
    <>
      <h2>Toast</h2>
      <p>
        A popover <code>&lt;output&gt;</code> that fades out on its own, shown
        by <code>SnackBarButton</code>.
      </p>
      <Example title={"Success message"}>
        <SnackBarButton
          endIcon={<CopyAllIcon size={"small"} />}
          onClick={() => "Invite secret copied to clipboard"}
        >
          Copy invite secret
        </SnackBarButton>
      </Example>
      <Example title={"Async message"}>
        <SnackBarButton
          onClick={() =>
            new Promise<string>((resolve) =>
              setTimeout(() => resolve("Done after a second"), 1000),
            )
          }
        >
          Run for a second
        </SnackBarButton>
      </Example>
    </>
  );
}
