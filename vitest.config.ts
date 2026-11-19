/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Astro's Vite config lets tests render .astro components with the container API.
export default getViteConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: true,
  },
});
