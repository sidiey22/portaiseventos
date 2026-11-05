import { SignInForm } from "../forms";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return <><h1>Área da equipe</h1><p className="muted">Administradores, gerentes de evento e credenciamento.</p><SignInForm initialError={erro} /></>;
}
