import Script from 'next/script';
import './globals.css';

export const metadata = { title: 'Anicca', description: 'A conversation that dissolves' };

export default function RootLayout({ children }: { children: React.ReactNode }){
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}


