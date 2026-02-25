import type { NextConfig } from "next";

// Full URL so CSS/JS load correctly on GitHub Pages (repo "blogs" → .../blogs/)
const isProd = process.env.NODE_ENV === "production";
const base = isProd ? "https://ayushmd.github.io/blogs" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/blogs" : "",
  assetPrefix: base ? `${base}/` : "",
};

export default nextConfig;
