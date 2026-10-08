"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
            a<span>.</span>
          </span>
          AuraBench
        </Link>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            aria-current={!regression ? "page" : undefined}
            className={cn("nav-link", !regression && "active")}
          >
            Run
          </Link>
          <Link
            href="/regressions"
            aria-current={regression ? "page" : undefined}
            className={cn("nav-link", regression && "active")}
          >
            Regressions
          </Link>
        </nav>
        <span className="header-note">Unofficial PingAura MCP Eval Lab</span>
      </div>
    </header>
  );
}
