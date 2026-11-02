import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tracelyt - Observability & Monitoring',
  description: 'Next-gen SaaS observability platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
