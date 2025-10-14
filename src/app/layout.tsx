import Script from 'next/script';
import './globals.css';

export const metadata = { title: 'Anicca', description: 'A conversation that dissolves' };

export default function RootLayout({ children }: { children: React.ReactNode }){
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0 }}>
        {/* 取消预加载 ShaderPark：当前页面未使用，避免 preload 警告。后续需要时再按页面级别加载 */}
        {children}
      </body>
    </html>
  );
}


