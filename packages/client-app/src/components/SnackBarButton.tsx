import { useState, ComponentProps } from "react";
import Button from "~/components/Button/Button";
import Toast from "~/components/Toast/Toast";

type OwnProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  onClick(): string | Promise<string>;
};
export default function SnackBarButton({ onClick, ...rest }: OwnProps) {
  const [toast, setToast] = useState<{ text: string; key: number }>();
  return (
    <>
      <Button
        {...rest}
        onClick={() => {
          Promise.resolve(onClick()).then((text) => {
            setToast({ text, key: Date.now() });
          });
        }}
      />
      {toast && (
        <Toast
          key={toast.key}
          text={toast.text}
          onHidden={() => setToast(undefined)}
        />
      )}
    </>
  );
}
