/** localStorage key for the learning guides' reading theme. */
export const GUIDE_THEME_KEY = "loadline:guide-theme";

/**
 * Inline script for the guide route: runs before first paint so a saved light theme never flashes dark.
 * The theme lives on <html data-guide-theme>, and `.guide-theme` in globals.css swaps the tokens.
 */
export const GUIDE_THEME_SCRIPT = `try{document.documentElement.dataset.guideTheme=localStorage.getItem("${GUIDE_THEME_KEY}")==="light"?"light":"dark"}catch(e){}`;
