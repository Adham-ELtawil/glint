/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 43123,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 43124,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2022",
    minify: "oxc",
    sourcemap: false,
    cssCodeSplit: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
