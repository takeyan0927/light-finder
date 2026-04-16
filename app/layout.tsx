import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "絶景ファインダー",
  description: "今この場所で、どんな写真が撮れるか。シャッターを押す前に確認できる撮影サポートアプリ",
  openGraph: {
    title: "絶景ファインダー",
    description: "今この場所で、どんな写真が撮れるか。シャッターを押す前に確認できる撮影サポートアプリ",
    url: "https://www.zekkei-finder.com",
    siteName: "絶景ファインダー",
    images: [
      {
        url: "https://www.zekkei-finder.com/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "絶景ファインダー",
    description: "今この場所で、どんな写真が撮れるか。シャッターを押す前に確認できる撮影サポートアプリ",
    images: ["https://www.zekkei-finder.com/og-image.png"],
  },
  manifest: "/manifest.json",
  icons: {
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
