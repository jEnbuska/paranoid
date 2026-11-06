import FormTextField from "~/components/FormTextField/FormTextField";
import IconButton from "~/components/IconButton/IconButton";
import { CloseIcon } from "~/components/Icon/icons";
import Example from "../Example";

export default function TextFieldPage() {
  return (
    <>
      <h2>FormTextField</h2>
      <Example title={"Default"} layout={"column"}>
        <FormTextField label={"Display name"} />
      </Example>
      <Example title={"Required"} layout={"column"}>
        <FormTextField label={"Display name"} required />
      </Example>
      <Example title={"Helper text"} layout={"column"}>
        <FormTextField
          label={"Display name"}
          helperText={"Name that will be shared on your chats"}
        />
      </Example>
      <Example title={"Error"} layout={"column"}>
        <FormTextField
          label={"Invite secret"}
          defaultValue={"x"}
          error={"Invalid invite secret"}
        />
      </Example>
      <Example title={"Disabled"} layout={"column"}>
        <FormTextField label={"Display name"} defaultValue={"Alice"} disabled />
      </Example>
      <Example title={"End adornment"} layout={"column"}>
        <FormTextField
          label={"Search"}
          endAdornment={
            <IconButton aria-label={"Clear"}>
              <CloseIcon />
            </IconButton>
          }
        />
      </Example>
    </>
  );
}
