import { useForm } from "react-hook-form";
import Alert from "~/components/Alert/Alert";
import Conditional from "~/components/Conditional";
import IconButton from "~/components/IconButton/IconButton";
import { ForwardToInboxIcon } from "~/components/Icon/icons";
import { useRandomNames } from "~/features/random-name/hooks";
import { useMessageCallbacks } from "~/features/message/hooks";
import { RandomNameData } from "~/features/random-name/types";
import { KeyboardEventHandler } from "react";
import styles from "./styles.module.css";

type ChatFormData = RandomNameData<{
  text: string;
}>;
export default function ChatForm() {
  const names = useRandomNames("text");
  const { sendTextMessage } = useMessageCallbacks();
  const form = useForm<ChatFormData>({
    defaultValues: { [names.text]: "" },
  });
  const { isSubmitting, errors } = form.formState;
  // Not a TanStack Query mutation: those pause while the browser reports being
  // offline, and the peers may still be connected over the data channel
  const send = form.handleSubmit(async (data) => {
    if (data[names.text].trim() === "") return;
    try {
      await sendTextMessage(data[names.text]);
      form.resetField(names.text);
    } catch {
      form.setError("root", { message: "Message not sent" });
    }
    form.setFocus(names.text);
  });
  const onKeyDown: KeyboardEventHandler = (e) => {
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) return; // Is touch device
    if (e.shiftKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isSubmitting) void send();
    }
  };
  return (
    <form className={styles.composer} onSubmit={send}>
      <Conditional
        shown={Boolean(errors.root)}
        Component={Alert}
        severity={"error"}
        className={styles.composerError}
      >
        {errors.root?.message}
      </Conditional>
      <textarea
        aria-label={"Message"}
        autoComplete={"new-password"}
        placeholder={"..."}
        rows={1}
        {...form.register(names.text)}
        onKeyDown={onKeyDown}
        readOnly={isSubmitting}
        className={styles.composerInput}
      />
      <IconButton
        aria-label={"Send"}
        disabled={!form.watch(names.text) || isSubmitting}
        type={"submit"}
      >
        <ForwardToInboxIcon />
      </IconButton>
    </form>
  );
}
