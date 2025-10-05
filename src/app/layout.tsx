export const metadata = { title: 'Anicca', description: 'A conversation that dissolves' };

export default function RootLayout({ children }: { children: React.ReactNode }){
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}


