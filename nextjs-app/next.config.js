const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so the repository-level lockfile does not confuse
  // Next.js/Turbopack.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
