import { useState } from "react";
import IconButton from "~/components/IconButton/IconButton";
import {
  CloseIcon,
  ShareIcon,
  VisibilityIcon,
  VisibilityOffIcon,
} from "~/components/Icon/icons";
import Example from "../Example";

export default function IconButtonPage() {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <h2>IconButton</h2>
      <Example title={"Default"}>
        <IconButton aria-label={"Close"}>
          <CloseIcon />
        </IconButton>
        <IconButton aria-label={"Share"}>
          <ShareIcon />
        </IconButton>
      </Example>
      <Example title={"Toggle (aria-pressed)"}>
        <IconButton
          aria-label={pressed ? "Hide password" : "Show password"}
          aria-pressed={pressed}
          onClick={() => setPressed(!pressed)}
        >
          {pressed ? <VisibilityOffIcon /> : <VisibilityIcon />}
        </IconButton>
      </Example>
      <Example title={"Disabled"}>
        <IconButton aria-label={"Share"} disabled>
          <ShareIcon />
        </IconButton>
      </Example>
    </>
  );
}
