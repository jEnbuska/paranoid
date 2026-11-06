import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import { parseIceServers } from "./src/features/peer-connection/ice-servers.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // Stops `vite build` and `vite dev` on an invalid value
      name: "validate-ice-servers",
      configResolved({ env }) {
        parseIceServers(env.VITE_ICE_SERVERS);
      },
    },
  ],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "src"), // ✅ Make "~/" point to "src/"
    },
  },
});
