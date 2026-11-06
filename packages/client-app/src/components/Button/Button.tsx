import { ComponentProps, ReactNode } from "react";
import Spinner from "~/components/Spinner/Spinner";

type OwnProps = ComponentProps<"button"> & {
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
};

export default function Button({
  startIcon,
  endIcon,
  loading = false,
  disabled,
  type = "button",
  children,
  ...rest
}: OwnProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {startIcon} {children} {endIcon}
      {loading && <Spinner label={"Pending"} />}
    </button>
  );
}
