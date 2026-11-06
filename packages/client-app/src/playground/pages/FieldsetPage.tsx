import Button from "~/components/Button/Button";
import Fieldset from "~/components/Fieldset/Fieldset";
import FormTextField from "~/components/FormTextField/FormTextField";
import Example from "../Example";

export default function FieldsetPage() {
  return (
    <>
      <h2>Fieldset</h2>
      <Example title={"With a field and a submit button"} layout={"column"}>
        <form onSubmit={(e) => e.preventDefault()}>
          <Fieldset legend={"Create a private invite"}>
            <FormTextField label={"Your display name"} required />
            <Button
              type={"submit"}
              startIcon={<span aria-hidden="true">+</span>}
            >
              Create
            </Button>
          </Fieldset>
        </form>
      </Example>
      <Example title={"Disabled"} layout={"column"}>
        <Fieldset legend={"Join an existing invite"} disabled>
          <FormTextField label={"Invite secret"} />
          <Button>Join</Button>
        </Fieldset>
      </Example>
    </>
  );
}
