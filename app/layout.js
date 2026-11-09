import "./globals.css";
import Link from "next/link";
import SourceSettings from "@/components/SourceSettings";
import { siteConfig } from "@/config/site";

export const metadata = { title: siteConfig.name, description: "Trang xem video" };

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-rose-500">{siteConfig.name}</Link>
            <SourceSettings />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
