/**
 * Build-time version embedded in the installed application.
 * Release packaging supplies this from the exact Git tag (without the leading v).
 */
export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "dev";
