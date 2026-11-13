import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "npx ts-node --compiler-options '{\u0022module\u0022:\u0022CommonJS\u0022,\u0022moduleResolution\u0022:\u0022node\u0022}' prisma/seed.ts",
  },
});
