/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  webpack: (config) => {
    // 允许以字符串方式导入 .wgsl 着色器文件
    config.module.rules.push({
      test: /\.wgsl$/i,
      type: 'asset/source'
    })
    return config
  }
};
module.exports = nextConfig;

