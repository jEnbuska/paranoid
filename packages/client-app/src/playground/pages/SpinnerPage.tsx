import Spinner from "~/components/Spinner/Spinner";
import Example from "../Example";

export default function SpinnerPage() {
  return (
    <>
      <h2>Spinner</h2>
      <p>
        A native indeterminate <code>&lt;progress&gt;</code>, drawn as fading
        spokes that turn. It takes its size from the font and its color from the
        text.
      </p>
      <Example title={"Default"}>
        <Spinner />
      </Example>
      <Example title={"Next to text, with its own label"}>
        <span>
          Waiting for someone to join… <Spinner label={"Waiting"} />
        </span>
      </Example>
    </>
  );
}
