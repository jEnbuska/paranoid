import { useState } from "react";
import Button from "~/components/Button/Button";
import Stepper from "~/components/Stepper/Stepper";
import Example from "../Example";

const steps = ["Invite Chat Information", "Exchange Invite Secret", "Connect"];

export default function StepperPage() {
  const [activeStep, setActiveStep] = useState(0);
  return (
    <>
      <h2>Stepper</h2>
      <Example title={"Interactive"} layout={"column"}>
        <Stepper
          activeStep={activeStep}
          steps={steps.map((label, index) => ({
            label,
            content: <p>Content of step {index + 1}</p>,
          }))}
        />
        <div>
          <Button
            disabled={activeStep === 0}
            onClick={() => setActiveStep(activeStep - 1)}
          >
            Back
          </Button>{" "}
          <Button
            disabled={activeStep === steps.length}
            onClick={() => setActiveStep(activeStep + 1)}
          >
            Next
          </Button>
        </div>
      </Example>
    </>
  );
}
