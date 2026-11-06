import { ReactNode } from "react";
import { DoneIcon } from "~/components/Icon/icons";
import styles from "./styles.module.css";

type OwnProps = {
  activeStep: number;
  steps: Array<{ label: string; content: ReactNode }>;
};

/** Vertical stepper on a native numbered list. Only the active step's content is rendered */
export default function Stepper({ activeStep, steps }: OwnProps) {
  return (
    <ol className={styles.stepper}>
      {steps.map(({ label, content }, index) => {
        const active = index === activeStep;
        const done = index < activeStep;
        return (
          <li key={label} aria-current={active ? "step" : undefined}>
            <span className={styles.label}>
              {label}
              {done && <DoneIcon size={"small"} />}
            </span>
            {active && <div className={styles.content}>{content}</div>}
          </li>
        );
      })}
    </ol>
  );
}
