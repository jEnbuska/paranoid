import FormTextField from "~/components/FormTextField/FormTextField.tsx";
import Button from "~/components/Button/Button.tsx";
import Alert from "~/components/Alert/Alert.tsx";
import { CachedIcon } from "~/components/Icon/icons.tsx";
import { RandomNameData } from "~/features/random-name/types.ts";
import { useRandomNames } from "~/features/random-name/hooks.ts";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import Conditional from "~/components/Conditional.tsx";
import { passwordValidator } from "~/validation/pass-phrase.ts";
import FormPasswordField from "~/components/FormPasswordField.tsx";
import TTLSlider from "./TTLSlider.tsx";
import { generateStrongPassword } from "~/features/crypt/utils/password.ts";
import { useInviteState } from "~/features/invite/hooks.ts";
import InviteCloseButton from "~/features/invite/_components/InviteCloseButton.tsx";
import { useCreateOffer } from "~/pages/hooks.ts";
import styles from "./styles.module.css";

type InviteFormData = RandomNameData<{
  password: string;
  ttl: number;
}>;

export default function CreateOffer() {
  const names = useRandomNames("ttl", "password");
  const { watch, register, handleSubmit, setValue, formState, setFocus } =
    useForm<InviteFormData>({
      defaultValues: {
        [names.ttl]: 10 * 60,
        [names.password]: "",
      },
    });
  const { userName } = useInviteState();
  const createOffer = useCreateOffer();
  const { isError, isPending, mutate } = useMutation({
    async mutationFn(data: InviteFormData) {
      const { [names.ttl]: ttl, [names.password]: password } = data;
      return createOffer({ ttl, password });
    },
  });
  return (
    <form
      onSubmit={handleSubmit((data) => mutate(data))}
      className={styles.createForm}
    >
      <FormTextField
        label={"Your display name"}
        required
        disabled
        value={userName}
      />
      <TTLSlider
        watch={() => watch(names.ttl)}
        setValue={(value) => setValue(names.ttl, value)}
      />
      <hr />
      <div className={styles.passwordGroup}>
        <FormPasswordField
          label={"Password"}
          required
          {...register(names.password, {
            required: true,
            validate: passwordValidator,
          })}
          error={formState.errors[names.password]?.message}
        />
        <Button
          className={styles.generatePassword}
          onClick={() => {
            generateStrongPassword().then((password) => {
              setFocus(names.password);
              setValue(names.password, password, {
                shouldValidate: true,
              });
            });
          }}
          endIcon={<CachedIcon size={"small"} />}
        >
          Generate password
        </Button>
      </div>
      <Conditional shown={isError} Component={Alert} severity={"error"}>
        Failed to create invite
      </Conditional>
      <div className={styles.actions}>
        <InviteCloseButton />
        <Button type="submit" loading={isPending}>
          Submit
        </Button>
      </div>
    </form>
  );
}
