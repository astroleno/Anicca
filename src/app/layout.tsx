import Script from 'next/script';

export const metadata = { title: 'Anicca', description: 'A conversation that dissolves' };

export default function RootLayout({ children }: { children: React.ReactNode }){
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0 }}>
        {/* 从 CDN 加载 ShaderPark（就像 ref 的 HTML） */}
        <Script
          src="https://unpkg.com/shader-park-core/dist/shader-park-core.esm.js"
          type="module"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}


