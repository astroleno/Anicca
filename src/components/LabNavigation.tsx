import Link from "next/link";

export function LabNavigation() {
  return <nav aria-label="实验导航" style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 2000, padding: 6, borderRadius: 18, background: "rgba(250,247,252,.95)", color: "#342d46" }}>
    <Link href="/labs" style={{ color: "inherit", padding: "12px 14px", whiteSpace: "nowrap" }}>全部实验</Link>
    <Link href="/dialogue" style={{ color: "inherit", padding: "12px 14px", whiteSpace: "nowrap" }}>返回对话</Link>
  </nav>;
}
