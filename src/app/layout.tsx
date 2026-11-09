import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Noto_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const playfairDisplayHeading = Playfair_Display({ subsets: ['latin'], variable: '--font-heading' });

const notoSans = Noto_Sans({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitializationScript = `(() => {
  let theme = "system";
  try {
    theme = localStorage.getItem("theme") || "system";
  } catch {}
  const isDark = theme === "dark"
    || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
  root.style.colorScheme = isDark ? "dark" : "light";
})();`;

export const metadata: Metadata = {
  title: "ABC Tours and Travels | Admin Panel",
  description: "ABC Tours and Travels administration",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        notoSans.variable,
        geistSans.variable,
        geistMono.variable,
        playfairDisplayHeading.variable,
      )}
    >
      <body className="antialiased">
        <Script
          id="theme-initialization"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
