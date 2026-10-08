import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  register: true,
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
