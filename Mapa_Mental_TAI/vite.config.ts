import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    // GitHub Pages: repo + carpeta real
    base: "/Test-de-Oposicion-TAI/Mapa_Mental_TAI/",

    plugins: [react(), tailwindcss()],

    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY || "demo"),
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
