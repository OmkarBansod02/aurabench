import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Navigation, NavigationFrame } from "@/components/navigation";
import "./globals.css";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
export const metadata: Metadata = {
  title: {
    default: "AuraBench · MCP Agent Regression Lab",
    template: "%s · AuraBench",
  },
  description:
    "Run, inspect, evaluate, and replay AI agents against PingAura MCP. Unofficial PingAura MCP Eval Lab.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only">
          Skip to content
        </a>
        <Suspense fallback={<NavigationFrame />}>
          <Navigation />
        </Suspense>
        <main id="main" className="main-container">
          {children}
        </main>
        <footer className="site-footer">
          <span>Unofficial PingAura MCP Eval Lab</span>
          <span>AuraBench · Trace. Evaluate. Improve.</span>
        </footer>
      </body>
    </html>
  );
}
