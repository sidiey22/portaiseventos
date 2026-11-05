import Link from "next/link";
import { Icon, Logo } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { managedEventIds, requireStaff } from "@/lib/staff";
import { signOutAction } from "../(acesso)/actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff();
  const managed = await managedEventIds(s);
  const manages = managed === "all" || managed.length > 0;
  return (
    <>
      <header className="top"><div className="w">
        <Link className="brand" href="/equipe" style={{ textDecoration: "none" }}><Logo /><span><span className="b1">Portais Eternos</span><span className="b2">Equipe · {s.name}</span></span></Link>
        <nav className="topnav" aria-label="Equipe">
          {manages && <Link className="navlink" href="/equipe"><Icon name="chart" />{s.isAdmin ? "Visão geral" : "Meus eventos"}</Link>}
          {s.isAdmin && <Link className="navlink" href="/equipe/cupons"><Icon name="tag" />Cupons</Link>}
          {s.isAdmin && <Link className="navlink" href="/equipe/administradores"><Icon name="shield" />Administradores</Link>}
          <Link className="navlink" href="/equipe/checkin"><Icon name="scan" />Check-in</Link>
          <form action={signOutAction} className="inline-form"><button type="submit" className="navlink" style={{ background: "none", border: 0, cursor: "pointer" }}>Sair</button></form>
          <ThemeToggle />
        </nav>
      </div></header>
      <main><div className="w">{children}</div></main>
    </>
  );
}
