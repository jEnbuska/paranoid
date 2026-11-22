# Client app

Rules for `packages/client-app`, on top of the root [CLAUDE.md](../../CLAUDE.md). Paths below are relative to this package.

## Client UI

No component library and no theme. The UI keeps the browser's default look, with a short list of deliberate exceptions, all in `src/index.css`: the neutral `accent-color`, the body's line height, button styling, the disabled look, the invalid-field bar and control sizes.

- Use native HTML elements wherever one fits, and only then write JavaScript: `<dialog>`, `popover`, `@starting-style`, `<fieldset>`/`<legend>`, `<progress>`, `<output>`, `<hr>`. Keep their native styling, apart from those exceptions. The small components in `src/components` wrap these elements.
- `src/index.css` loads [`modern-normalize`](https://github.com/sindresorhus/modern-normalize) first. It evens out browser differences without removing default styles. Don't add a reset. It and the app's base element styles sit in the cascade layers `normalize` and `base`, so a component's CSS module always overrides them whatever the specificity. Put new element-level defaults inside `@layer base`.
- Colors follow the OS light or dark setting through `color-scheme: light dark`. Use system colors (`Canvas`, `CanvasText`, `GrayText`) only where a native element doesn't already provide the color. Don't define a palette. The UI is neutral, with no hue: `accent-color` is `CanvasText`, so don't use `AccentColor`.
- Button styling: Chrome's native dark buttons look disabled, so `index.css` outlines every `<button>` in `CanvasText` and fills submit buttons with `CanvasText` (text in `Canvas`). No accent color. Disabled controls (buttons, inputs, textareas) share one look: transparent, `GrayText` and a dashed border. Invalid fields (`aria-invalid="true"`) get a striped bar along their bottom edge.
- CSS modules (`styles.module.css` next to the component) only hold CSS that does a job: layout and spacing, positioning (toast) and the dialog transitions. No shadows, uppercase or custom button variants, and keep focus outlines visible.
- Font sizes are relative (`rem`/`em`), never `px`. Text is at least `1rem` (16px at the browser default, and it follows the user's font-size setting). Only `<small>` is smaller.
- Sizes are the same on every device: no media queries that change font sizes, control sizes, padding or spacing for mobile or desktop. Buttons, inputs and textareas are at least `2.75rem` tall (44px at the default font size), so they work as touch targets everywhere.
- Icons are inline SVG components in `src/components/Icon/icons.tsx`.
- Every generic component in `src/components` has a page in the playground at `/playground/<page>` showing its variants (`src/playground/pages`, listed in `pages/index.ts`). The playground route exists only in development (`import.meta.env.DEV` in `app.tsx`) and is loaded lazily, so it's not in the production build. Add a page when you add a component.

## Routing

Import routing from `react-router`, not `react-router-dom`.
