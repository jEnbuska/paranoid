import FormPasswordField from "~/components/FormPasswordField";
import Example from "../Example";

export default function PasswordFieldPage() {
  return (
    <>
      <h2>FormPasswordField</h2>
      <Example title={"Default"} layout={"column"}>
        <FormPasswordField label={"Password"} required />
      </Example>
      <Example title={"Error"} layout={"column"}>
        <FormPasswordField
          label={"Password"}
          defaultValue={"short"}
          error={"Password must be at least 12 characters"}
        />
      </Example>
      <Example title={"Disabled"} layout={"column"}>
        <FormPasswordField label={"Password"} disabled />
      </Example>
    </>
  );
}
