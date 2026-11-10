import "./globals.css";
import Link from "next/link";
import SourceSettings from "@/components/SourceSettings";

export const metadata = {
  title: "VideoSite",
  description: "Trình xem video giao diện tối giản, mượt mà"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-[#0f172a] text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <header className="border-b border-slate-800/80 bg-[#0f172a]/90 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-3.5 sm:px-4 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-100 hover:text-indigo-400 transition-colors"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 text-white text-xs font-extrabold shadow-sm shadow-indigo-500/30">
                ▶
              </span>
              <span>VideoSite</span>
            </Link>

            <SourceSettings />
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
