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
          "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.66), rgba(255,255,255,0.16) 22%, transparent 24%), radial-gradient(circle at center, rgba(55, 211, 173, 0.2), rgba(6, 20, 18, 0.92) 58%, rgba(5, 9, 12, 0.98) 100%)"
      }}
    >
      <div
        style={{
          width: "min(38vw, 320px)",
          aspectRatio: "1 / 1",
          borderRadius: "40% 60% 58% 42% / 46% 45% 55% 54%",
          background:
            "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.84), rgba(255,255,255,0.24) 20%, transparent 24%), linear-gradient(160deg, rgba(247, 219, 151, 0.94), rgba(55, 211, 173, 0.9) 42%, rgba(28, 72, 61, 0.96))",
          boxShadow: "0 28px 80px rgba(3, 16, 14, 0.48), inset 0 -24px 40px rgba(35, 84, 71, 0.28)",
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
