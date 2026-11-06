import Button from "~/components/Button/Button";
import { CachedIcon, CopyAllIcon } from "~/components/Icon/icons";
import Example from "../Example";

export default function ButtonPage() {
  return (
    <>
      <h2>Button</h2>
      <Example title={"Default"}>
        <Button>Cancel</Button>
        <Button type={"submit"}>Submit</Button>
      </Example>
      <Example title={"Text glyphs as icons"}>
        <Button startIcon={<span aria-hidden="true">+</span>}>Create</Button>
        <Button endIcon={<span aria-hidden="true">→</span>}>Join</Button>
      </Example>
      <Example title={"SVG icons"}>
        <Button endIcon={<CachedIcon size={"small"} />}>
          Generate password
        </Button>
        <Button startIcon={<CopyAllIcon size={"small"} />}>Copy</Button>
      </Example>
      <Example title={"Loading"}>
        <Button loading>Submit</Button>
      </Example>
      <Example title={"Disabled"}>
        <Button disabled>Submit</Button>
      </Example>
    </>
  );
}
