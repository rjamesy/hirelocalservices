import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const BASE_URL = 'https://hirelocalservices.com.au'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
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
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'HireLocalServices - Find Local Services Across Australia',
    description:
      'Find and hire trusted local service professionals across Australia.',
    type: 'website',
    locale: 'en_AU',
    siteName: 'HireLocalServices',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers()
  const maintenanceActive = headerList.get('x-maintenance-active') === 'true'
  const softLaunch = headerList.get('x-soft-launch') === 'true'

  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} flex min-h-screen flex-col`}>
        {maintenanceActive && (
          <div className="bg-yellow-500 text-yellow-950 text-center text-sm font-medium py-2 px-4">
            Maintenance mode is active — only you can see this page. Public users see the maintenance page.
          </div>
        )}
        {softLaunch && !maintenanceActive && (
          <div className="bg-blue-500 text-white text-center text-sm font-medium py-2 px-4">
            We&apos;re rolling out access gradually. New listings are reviewed before going live.
          </div>
        )}
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
