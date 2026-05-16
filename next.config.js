const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    const ignoredWatchPaths = config.watchOptions?.ignored;
    const existingIgnoredWatchPaths = (
      Array.isArray(ignoredWatchPaths) ? ignoredWatchPaths : ignoredWatchPaths ? [ignoredWatchPaths] : []
    ).filter((item) => typeof item === "string" && item.length > 0);
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...existingIgnoredWatchPaths,
        "**/artifacts/**",
        "**/graphify-out/**"
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
