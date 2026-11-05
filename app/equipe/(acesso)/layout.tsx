import Link from "next/link";
import { Logo } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { robots: { index: false } };

export default function AccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top"><div className="w">
        <Link className="brand" href="/" style={{ textDecoration: "none" }}><Logo /><span><span className="b1">Portais Eternos</span><span className="b2">Equipe</span></span></Link>
        <nav className="topnav"><ThemeToggle /></nav>
      </div></header>
      <main><div className="w"><div style={{ maxWidth: 420, margin: "24px auto" }}>{children}</div></div></main>
    </>
  );
}
