import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function EntrarPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/voluntario");
  return (
    <div style={{ maxWidth: 380 }}>
      <h1>Acesso da equipe</h1>
      <p className="muted">Administradores e voluntários.</p>
      <LoginForm />
    </div>
  );
}
