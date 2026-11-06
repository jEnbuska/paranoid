import { NavLink, Route, Routes } from "react-router";
import { pages } from "./pages";
import ThemeButton from "./ThemeButton";
import styles from "./styles.module.css";

/**
 * Playground of the generic components, one page each at
 * /playground/<page>. Loaded lazily and only in development (see app.tsx).
 */
export function Component() {
  return (
    <div className={styles.playground}>
      <nav aria-label={"Playground"}>
        <h1 className={styles.title}>Playground</h1>
        <ThemeButton />
        <ul className={styles.nav}>
          {pages.map(({ path, title }) => (
            <li key={path}>
              <NavLink to={`/playground/${path}`}>{title}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className={styles.main}>
        <Routes>
          <Route index element={<p>Pick a component.</p>} />
          {pages.map(({ path, Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
        </Routes>
      </main>
    </div>
  );
}
