import { JSXElementConstructor, ComponentProps } from "react";
import InviteCloseButton from "~/features/invite/_components/InviteCloseButton";
import styles from "./styles.module.css";

type OwnProps<T extends JSXElementConstructor<any>> = {
  Component: T;
} & ComponentProps<T>;
export default function InviteView<T extends JSXElementConstructor<any>>({
  Component,
  ...rest
}: OwnProps<T>) {
  return (
    <div className={styles.inviteView}>
      <Component {...rest} />
      <InviteCloseButton className={styles.close} />
    </div>
  );
}
