import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '우리 둘의 약 챙기기',
  description: '하루 2회 커플 복약 인증 & 콕 찌르기',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-rose-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  );
}
