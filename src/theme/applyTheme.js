// Runtime theme selection; token catalogs remain in the resolver and lab.
import { THEME_IDS, PRODUCTION_THEME_ID } from "./themeTypes.js";
export { PRODUCTION_THEME_ID } from "./themeTypes.js";

export const isThemeId = (id) => THEME_IDS.includes(String(id));

/**
 * Apply a theme to the document. Phase 9A.2: the product applies the PRODUCTION
 * theme at startup (src/main.jsx); the lab applies a candidate for comparison
 * and restores the production theme on unmount. `null` restores the default
 * product theme; `false` removes the attribute (the pre-9A.2 render).
 */
export const applyTheme = (id, root = typeof document !== "undefined" ? document.documentElement : null) => {
  if (!root) return false;
  if (id === false) { delete root.dataset.theme; return true; }
  if (id == null) { root.dataset.theme = PRODUCTION_THEME_ID; return true; }
  if (!isThemeId(id)) return false;
  root.dataset.theme = id;
  return true;
};
