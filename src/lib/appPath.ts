/** Prefix browser requests and plain anchors with the build's Next.js base path. */
export function appPath(path: string): string {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
  if (!basePath || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === basePath || ["/", "?", "#"].some(separator => path.startsWith(`${basePath}${separator}`))) return path;
  return `${basePath}${path}`;
}
