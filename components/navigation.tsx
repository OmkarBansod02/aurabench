"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, History } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navigation() {
  const path = usePathname();
  const regression =
    path.startsWith("/regressions") || path.startsWith("/compare");
  return <NavigationFrame regression={regression} />;
}
export function NavigationFrame({
  regression = false,
}: {
  regression?: boolean;
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="AuraBench home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="20" height="20">
              <path
                d="M3 14.5 7 9l3 3 3.5-6L17 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="17" cy="11" r="1.6" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">AuraBench</span>
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          <Link
            href="/"
            aria-current={!regression ? "page" : undefined}
            className={cn("nav-link", !regression && "active")}
          >
            <FlaskConical size={15} aria-hidden="true" />
            Run lab
          </Link>
          <Link
            href="/regressions"
            aria-current={regression ? "page" : undefined}
            className={cn("nav-link", regression && "active")}
          >
            <History size={15} aria-hidden="true" />
            Regressions
          </Link>
        </nav>
        <span className="header-note">
          <span className="header-note-dot" aria-hidden="true" />
          Unofficial PingAura MCP Eval Lab
        </span>
      </div>
    </header>
  );
}
