import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'HireLocalServices - Find Local Services Across Australia',
  description:
    'Find and hire trusted local service professionals across Australia. Browse cleaning, plumbing, electrical, gardening, handyman, and more services in your area.',
  keywords: [
    'local services',
    'Australia',
    'hire',
    'cleaning',
    'plumbing',
    'electrical',
    'gardening',
    'handyman',
    'pest control',
    'trades',
    'service directory',
  ],
  authors: [{ name: 'HireLocalServices' }],
  openGraph: {
    title: 'HireLocalServices - Find Local Services Across Australia',
    description:
      'Find and hire trusted local service professionals across Australia.',
    type: 'website',
    locale: 'en_AU',
    siteName: 'HireLocalServices',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} flex min-h-screen flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
