import "@/styles.css";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vite-plus/test";

// Every test starts from an empty project store and theme choice.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
