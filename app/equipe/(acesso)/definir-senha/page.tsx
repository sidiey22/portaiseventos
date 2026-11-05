import { SetPasswordForm } from "../forms";

export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
  return <><h1>Crie sua senha</h1><p className="muted">Use uma senha só sua, com pelo menos 10 caracteres.</p><SetPasswordForm /></>;
}
