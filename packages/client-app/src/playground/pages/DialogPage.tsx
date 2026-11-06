import { useState } from "react";
import Conditional from "~/components/Conditional";
import Button from "~/components/Button/Button";
import Dialog from "~/components/Dialog/Dialog";
import FormTextField from "~/components/FormTextField/FormTextField";
import Example from "../Example";

export default function DialogPage() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h2>Dialog</h2>
      <Example title={"Modal"}>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Conditional
          Component={Dialog}
          shown={open}
          onClose={() => setOpen(false)}
          title={"Dialog title"}
        >
          <p>Escape or a click outside closes it.</p>
          <FormTextField label={"A field"} />
          <p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </p>
        </Conditional>
      </Example>
    </>
  );
}
