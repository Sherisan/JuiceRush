/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute origin of the game API in production builds. Empty in dev: relative URLs go through the Vite proxy. */
  readonly VITE_API_BASE?: string;
  /** '1' plays offline against the in-browser demo engine (like ?demo). Unset: the game API (api/fruit). */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
