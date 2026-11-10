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
      <body className="min-h-screen bg-background text-textMain antialiased selection:bg-primary selection:text-primary-foreground">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-3.5 sm:px-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-textMain transition-colors hover:text-primary"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-extrabold text-primary-foreground shadow-sm shadow-primary/25">
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
