import { ComponentProps, useState } from "react";
import FormTextField from "~/components/FormTextField/FormTextField";
import IconButton from "~/components/IconButton/IconButton";
import { VisibilityIcon, VisibilityOffIcon } from "~/components/Icon/icons";

type OwnProps = Omit<ComponentProps<typeof FormTextField>, "type">;
export default function FormPasswordField(props: OwnProps) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <FormTextField
      {...props}
      type={showPassword ? "text" : "password"}
      endAdornment={
        <IconButton
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
        </IconButton>
      }
    />
  );
}
