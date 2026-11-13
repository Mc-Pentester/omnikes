import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "npx ts-node --project tsconfig.seed.json prisma/seed.ts"module":"CommonJS","moduleResolution":"node"}' prisma/seed.ts",
  },
});
