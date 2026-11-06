import { useId, useState } from "react";
import { AbstractFormField } from "~/components/AbstractFormField/AbstractFormField";
import { Input } from "~/components/Input";
import Example from "../Example";

export default function FormFieldPage() {
  const rangeId = useId();
  const [value, setValue] = useState(50);
  return (
    <>
      <h2>AbstractFormField</h2>
      <p>
        Label, control and description. The control reads its id, required,
        disabled and ARIA state from the field, as <code>Input</code> does.
      </p>
      <Example title={"Text input"} layout={"column"}>
        <AbstractFormField label={"Label"} description={"Description"}>
          <Input />
        </AbstractFormField>
      </Example>
      <Example title={"Required"} layout={"column"}>
        <AbstractFormField label={"Label"} required>
          <Input />
        </AbstractFormField>
      </Example>
      <Example title={"Error"} layout={"column"}>
        <AbstractFormField label={"Label"} error={"Error message"}>
          <Input defaultValue={"Invalid value"} />
        </AbstractFormField>
      </Example>
      <Example title={"Disabled"} layout={"column"}>
        <AbstractFormField label={"Label"} disabled>
          <Input defaultValue={"Value"} />
        </AbstractFormField>
      </Example>
      <Example
        title={"Range with its value on the label's line"}
        layout={"column"}
      >
        <AbstractFormField
          id={rangeId}
          label={"Volume"}
          labelEnd={<output htmlFor={rangeId}>{value}</output>}
          description={"Any control works as the child"}
        >
          <Input
            type={"range"}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </AbstractFormField>
      </Example>
    </>
  );
}
