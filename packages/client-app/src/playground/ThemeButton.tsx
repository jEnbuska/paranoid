import { useEffect, useState } from "react";
import Button from "~/components/Button/Button";

const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];

/**
 * Cycles the page between the OS setting, light and dark by overriding
 * `color-scheme` on <html>. Every color is a system color, so this switches
 * the whole UI, dialogs and popovers included.
 */
export default function ThemeButton() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = theme === "system" ? "" : theme;
    return () => {
      root.style.colorScheme = "";
    };
  }, [theme]);
  return (
    <Button
      onClick={() =>
        setTheme(themes[(themes.indexOf(theme) + 1) % themes.length])
      }
    >
      Theme: {theme}
    </Button>
  );
}
