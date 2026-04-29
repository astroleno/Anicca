"use client";

type MochiCanvasProps = {
  className?: string;
};

export default function MochiCanvas({ className }: MochiCanvasProps) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.85), rgba(255,255,255,0.2) 22%, transparent 24%), radial-gradient(circle at center, rgba(157, 120, 246, 0.4), rgba(44, 13, 74, 0.92) 62%)"
      }}
    >
      <div
        style={{
          width: "min(38vw, 320px)",
          aspectRatio: "1 / 1",
          borderRadius: "40% 60% 58% 42% / 46% 45% 55% 54%",
          background:
            "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.88), rgba(255,255,255,0.28) 20%, transparent 24%), linear-gradient(160deg, rgba(255, 211, 240, 0.92), rgba(176, 124, 255, 0.9) 42%, rgba(89, 42, 176, 0.94))",
          boxShadow: "0 28px 80px rgba(27, 8, 49, 0.45), inset 0 -24px 40px rgba(86, 39, 160, 0.24)",
          animation: "mochi-breathe 5.6s ease-in-out infinite"
        }}
      />
      <style jsx>{`
        @keyframes mochi-breathe {
          0%,
          100% {
            transform: scale(0.96) rotate(-4deg);
            border-radius: 40% 60% 58% 42% / 46% 45% 55% 54%;
          }
          50% {
            transform: scale(1.04) rotate(5deg);
            border-radius: 57% 43% 45% 55% / 42% 56% 44% 58%;
          }
        }
      `}</style>
    </div>
  );
}
