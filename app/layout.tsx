import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { logout } from "./entrar/actions";

export const metadata: Metadata = {
  title: "Portais Eventos",
  description: "Inscrições nos eventos da Igreja Missionária Portais Eternos.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="pt-BR">
      <body>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="brand">
              Portais <span>Eventos</span>
            </Link>
            <nav>
              {user?.role === "admin" && <Link href="/admin">Painel</Link>}
              {user?.role === "volunteer" && <Link href="/voluntario">Check-in</Link>}
              {user ? (
                <form action={logout}>
                  <button className="secondary" type="submit">Sair</button>
                </form>
              ) : (
                <Link href="/entrar">Equipe</Link>
              )}
            </nav>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </body>
    </html>
  );
}
