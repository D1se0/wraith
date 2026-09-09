import type { WraithApi } from "../electron/preload";

declare global {
  interface Window {
    wraith: WraithApi;
  }
}

export {};
