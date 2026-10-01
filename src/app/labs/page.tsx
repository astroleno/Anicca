import Link from "next/link";

export const metadata = { title: "视觉实验 · Anicca", robots: { index: false, follow: false } };

const experiments = [
  ["/labs/mochi", "柔软质感", "最初的麻薯与光影实验"],
  ["/labs/raymarching", "液滴融合", "拖动、裂变与不同质感"],
  ["/labs/newframe", "WebGPU 画布", "需要支持 WebGPU 的浏览器"],
  ["/labs/liquid", "流动星云", "全屏色彩与光场"]
];

export default function LabsPage() {
  return <main style={{ minHeight: "100dvh", background: "#f6f1f8", color: "#342d46", padding: "48px max(24px, calc((100vw - 720px) / 2))" }}>
    <Link href="/dialogue" style={{ color: "inherit" }}>← 返回对话</Link>
    <h1 style={{ marginTop: 36 }}>视觉实验</h1>
    <p>这些画布用于探索视觉和交互，不会写入你的对话工作区。</p>
    <nav aria-label="视觉实验" style={{ display: "grid", gap: 16, marginTop: 28 }}>
      {experiments.map(([href, title, description]) => <Link key={href} href={href} style={{ color: "inherit", textDecoration: "none", padding: 24, borderRadius: 20, background: "#fff" }}>
        <strong>{title}</strong><p style={{ marginBottom: 0, lineHeight: 1.6 }}>{description}</p>
      </Link>)}
    </nav>
  </main>;
}
