import { useId, useRef } from "react";
import { AbstractFormField } from "~/components/AbstractFormField/AbstractFormField.tsx";
import { Input } from "~/components/Input.tsx";
import { formatExpiresInExact } from "~/features/date/utils.ts";

type OwnProps = {
  watch: () => number;
  setValue: (value: number) => void;
};

export default function TTLSlider({ setValue, watch }: OwnProps) {
  const value = watch();
  const inputId = useId();
  const defaultValue = useRef(value);
  return (
    <AbstractFormField
      id={inputId}
      label={"Invite TTL"}
      labelEnd={
        <output htmlFor={inputId}>{formatExpiresInExact(value)}</output>
      }
      description={
        "Duration for which the invite remains active if there is no activity."
      }
    >
      <Input
        type="range"
        min={120}
        max={20 * 60}
        step={60}
        defaultValue={defaultValue.current}
        aria-valuetext={formatExpiresInExact(value)}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </AbstractFormField>
  );
}
