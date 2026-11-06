import { useEffect } from "react";
import useDerivedState from "~/hooks/use-derived-state";
import classNames from "classnames";
import { getExpiresInSeconds, formatExpiresIn } from "~/features/invite/utils";
import { useInviteState } from "~/features/invite/hooks";
import Conditional from "~/components/Conditional";
import styles from "./styles.module.css";

type OwnProps = {
  className?: string;
};

export default function InviteExpiresIn({ className }: OwnProps) {
  const { expiresAt } = useInviteState();
  const [expiresIn, setExpiresIn] = useDerivedState(() => {
    if (!expiresAt) return "";
    return formatExpiresIn(getExpiresInSeconds(expiresAt));
  }, [expiresAt]);
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const next = formatExpiresIn(getExpiresInSeconds(expiresAt));
      setExpiresIn(next);
      if (!next) clearInterval(interval);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [expiresAt]);

  return (
    <Conditional
      element={"small"}
      className={classNames(styles.expiresIn, className)}
      shown={Boolean(expiresIn)}
    >
      {expiresIn}
    </Conditional>
  );
}
