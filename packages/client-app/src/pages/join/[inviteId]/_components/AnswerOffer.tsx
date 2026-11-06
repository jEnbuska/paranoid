import Button from "~/components/Button/Button.tsx";
import FormTextField from "~/components/FormTextField/FormTextField.tsx";
import InviteExpiresIn from "~/features/invite/_components/InviteExpiresIn.tsx";
import { useRandomNames } from "~/features/random-name/hooks.ts";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { RandomNameData } from "~/features/random-name/types.ts";
import { validateDisplayName } from "~/validation/display-name.ts";
import maxLengthValidator from "~/validation/max-length.ts";
import { useAnswerOffer } from "~/pages/hooks.ts";
import styles from "../styles.module.css";
import FormPasswordField from "~/components/FormPasswordField.tsx";

type JoinInviteFormData = RandomNameData<{
  userName: string;
  password: string;
}>;
export default function AnswerOffer() {
  const names = useRandomNames("userName", "password");
  const form = useForm<JoinInviteFormData>({
    defaultValues: {
      [names.userName]: "",
      [names.password]: "",
    },
  });
  const answerOffer = useAnswerOffer();
  const { mutate } = useMutation({
    mutationFn: answerOffer,
    throwOnError: true,
  });
  return (
    <form
      className={styles.answerForm}
      onReset={() => form.reset()}
      onSubmit={form.handleSubmit(
        ({ [names.userName]: userName, [names.password]: password }) =>
          mutate({ userName, password }),
      )}
    >
      <FormTextField
        label={"Your display name"}
        helperText={"Name that will be shared on your chats"}
        required
        error={form.formState.errors[names.userName]?.message}
        {...form.register(names.userName, {
          required: true,
          validate: validateDisplayName,
        })}
      />
      <FormPasswordField
        label={"Pass phrase"}
        required
        {...form.register(names.password, {
          validate: maxLengthValidator(100),
          required: true,
        })}
      />
      <InviteExpiresIn />
      <div className={styles.actions}>
        <Button type="reset">Clear</Button>
        <Button type="submit" endIcon={<span aria-hidden="true">→</span>}>
          Join
        </Button>
      </div>
    </form>
  );
}
