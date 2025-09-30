import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

declare global {
  interface Window {
    __vite_plugin_react_preamble_installed__?: boolean;
  }
}

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  window.__vite_plugin_react_preamble_installed__ = true;
}
