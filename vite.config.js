import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import fs from "node:fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["VITE_", "NEXT_PUBLIC_", "SUPABASE_"]);

  let fileUrl = "";
  let fileKey = "";
  try {
    if (fs.existsSync("/vercel/share/.env.project")) {
      const fileContent = fs.readFileSync("/vercel/share/.env.project", "utf8");
      for (const line of fileContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("SUPABASE_URL=") || trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
          fileUrl = trimmed.split("=")[1]?.replace(/['"]/g, "") || "";
        }
        if (trimmed.startsWith("SUPABASE_ANON_KEY=") || trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
          fileKey = trimmed.split("=")[1]?.replace(/['"]/g, "") || "";
        }
      }
    }
  } catch {
    // fallback
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || fileUrl || "";
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || fileKey || "";

  return {
    plugins: [react()],
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(supabaseUrl),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
