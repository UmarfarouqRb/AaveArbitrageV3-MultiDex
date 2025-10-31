import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": resolve(__dirname, "src") }
    },
    build: {
      rollupOptions: {
        external: ["ethers"]
      },
      outDir: "dist",
      sourcemap: isDev
    },
    server: {
      open: isDev,
      port: 5173
    }
  };
});