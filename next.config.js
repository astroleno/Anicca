const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
if (basePath && !/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(basePath)) {
  throw new Error("NEXT_PUBLIC_BASE_PATH must be an absolute path without a query or fragment");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  output: "standalone",
  ...(process.env.ANICCA_BUILD_CPUS ? {
    experimental: {
      cpus: Number(process.env.ANICCA_BUILD_CPUS),
      webpackBuildWorker: true,
      webpackMemoryOptimizations: true
    }
  } : {}),
  // Keep production verification separate from a running development server.
  distDir: process.env.ANICCA_NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/prompts": ["./src/prompt/**/*"]
  },
  outputFileTracingExcludes: {
    "*": [
      "./.worktrees/**/*",
      "./archived/**/*",
      "./artifacts/**/*",
      "./.cache/**/*",
      "./graphify-out/**/*",
      "./ref/**/*"
    ]
  },
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    const ignoredWatchPaths = config.watchOptions?.ignored;
    const existingIgnoredWatchPaths = (
      Array.isArray(ignoredWatchPaths) ? ignoredWatchPaths : ignoredWatchPaths ? [ignoredWatchPaths] : []
    ).filter((item) => typeof item === "string" && item.length > 0);
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...existingIgnoredWatchPaths,
        "**/.worktrees/**",
        "**/archived/**",
        "**/artifacts/**",
        "**/graphify-out/**",
        "**/ref/**"
      ]
    };

    // 允许以字符串方式导入 .wgsl 着色器文件
    config.module.rules.push({
      test: /\.wgsl$/i,
      type: 'asset/source'
    })
    return config
  }
};
module.exports = nextConfig;
