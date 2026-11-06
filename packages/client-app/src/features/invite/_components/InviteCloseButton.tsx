import Button from "~/components/Button/Button";
import { useInviteCallbacks } from "~/features/invite/hooks";

export default function InviteCloseButton({
  className,
}: {
  className?: string;
}) {
  const { onClosed } = useInviteCallbacks();
  return (
    <Button className={className} onClick={onClosed}>
      Cancel
    </Button>
  );
}
