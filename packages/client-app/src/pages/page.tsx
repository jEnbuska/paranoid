import { useInviteCallbacks, useInviteState } from "~/features/invite/hooks";
import useComponentDidMount from "~/hooks/use-component-did-mount";
import { RandomNameData } from "~/features/random-name/types.ts";
import { useRandomNames } from "~/features/random-name/hooks.ts";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import Fieldset from "~/components/Fieldset/Fieldset.tsx";
import FormTextField from "~/components/FormTextField/FormTextField.tsx";
import { validateDisplayName } from "~/validation/display-name.ts";
import Button from "~/components/Button/Button.tsx";
import InviteDialog from "~/features/invite/_components/InviteDialog.tsx";
import CreateInviteDialogContent from "~/pages/@components/CreateInviteDialogContent.tsx";

type CreateOfferFormData = RandomNameData<{
  userName: string;
}>;
export default function LandingPage() {
  const { resetInviteContext } = useInviteCallbacks();
  useComponentDidMount(resetInviteContext);
  const names = useRandomNames("userName");
  const form = useForm<CreateOfferFormData>({
    defaultValues: {
      [names.userName]: "",
    },
  });
  const { initOffer } = useInviteCallbacks();
  const { mutateAsync } = useMutation({
    mutationFn: ({ [names.userName]: userName }: CreateOfferFormData) =>
      initOffer(userName),
  });
  const { stage } = useInviteState();
  useEffect(() => form.reset(), [stage]);
  return (
    <>
      <form onSubmit={form.handleSubmit((data) => mutateAsync(data))}>
        <Fieldset legend={"Create a private invite"}>
          <FormTextField
            label={"Your display name"}
            required
            error={form.formState.errors[names.userName]?.message}
            {...form.register(names.userName, {
              required: true,
              validate: validateDisplayName,
            })}
          />
          <Button type="submit" startIcon={<span aria-hidden="true">+</span>}>
            Create
          </Button>
        </Fieldset>
      </form>
      <InviteDialog
        title={"Create Invite"}
        openStage={"offer"}
        Component={CreateInviteDialogContent}
      />
    </>
  );
}
