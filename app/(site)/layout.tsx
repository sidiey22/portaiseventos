import Link from "next/link";
import { Icon, Logo } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        <div className="w">
          <Link className="brand" href="/" aria-label="Portais Eventos, início" style={{ textDecoration: "none" }}>
            <Logo /><span><span className="b1">Portais Eternos</span><span className="b2">Eventos</span></span>
          </Link>
          <nav className="topnav" aria-label="Principal">
            <Link href="/" className="navlink"><Icon name="grid" />Eventos</Link>
            <Link href="/meus-ingressos" className="navlink"><Icon name="ticket" />Meus ingressos</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main><div className="w">{children}</div></main>
    </>
  );
}
