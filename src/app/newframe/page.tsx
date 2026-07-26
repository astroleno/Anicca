"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

const MetaballCanvas = dynamic(() => import("@/components/MetaballCanvas"), { ssr: false });

export default function Page() {
  const [showLabUi, setShowLabUi] = useState(false);

  useEffect(() => {
    setShowLabUi(new URLSearchParams(window.location.search).get("lab") === "1");
  }, []);

  return (
    <main
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#05090c"
      }}
    >
      {showLabUi ? (
        <section
          aria-label="实验提示"
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            zIndex: 2,
            width: "min(380px, calc(100vw - 40px))",
            padding: "18px 20px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 20,
            background: "rgba(7, 19, 25, 0.72)",
            color: "#f2f7fa",
            backdropFilter: "blur(16px)",
            boxShadow: "0 18px 52px rgba(0, 0, 0, 0.28)"
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(220, 235, 242, 0.54)"
            }}
          >
            Visual Lab
          </p>
          <h1 style={{ margin: "10px 0 0", fontSize: 24, lineHeight: 1.25 }}>/newframe metaball</h1>
          <p style={{ margin: "10px 0 0", color: "rgba(226, 239, 244, 0.78)", lineHeight: 1.6 }}>
            WebGPU / metaball 实验入口，默认成品视图会隐藏标签和说明。
          </p>
          <Link
            href="/dialogue"
            style={{
              display: "inline-flex",
              marginTop: 14,
              minHeight: 42,
              alignItems: "center",
              padding: "0 16px",
              borderRadius: 999,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#f2f7fa",
              textDecoration: "none",
              fontWeight: 700
            }}
          >
            前往 /dialogue
          </Link>
        </section>
      ) : null}

      <Suspense fallback={<div style={{ padding: 20, color: "#f2f7fa" }}>加载实验画布…</div>}>
        <MetaballCanvas showLabUi={showLabUi} />
      </Suspense>
    </main>
  );
}
