import { isValidCpf, onlyDigits } from "./cpf.ts";
import { ageOn } from "./time.ts";

export type RegistrationInput = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string; // YYYY-MM-DD
  guardianPhone: string;
  sessionId: number | null;
};

export type FieldErrors = Partial<Record<keyof RegistrationInput, string>>;

export type CleanRegistration = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string;
  guardianPhone: string | null;
  sessionId: number | null;
  isMinor: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidBrPhone(digits: string): boolean {
  // DDD + 8 ou 9 dígitos (com ou sem o 55 do país)
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return /^[1-9]\d(9\d{8}|[2-9]\d{7})$/.test(local);
}

export function validateRegistration(
  input: RegistrationInput,
  opts: { eventHasSessions: boolean; validSessionIds: number[]; now: Date },
): { ok: true; value: CleanRegistration } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || !name.includes(" ")) errors.name = "Informe o nome completo.";

  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) errors.email = "Informe um email válido.";

  const phone = onlyDigits(input.phone);
  if (!isValidBrPhone(phone)) errors.phone = "Informe um telefone com DDD.";

  const cpf = onlyDigits(input.cpf);
  if (!isValidCpf(cpf)) errors.cpf = "CPF inválido.";

  const age = ageOn(input.birthDate, opts.now);
  if (age === null) errors.birthDate = "Informe uma data de nascimento válida.";

  const isMinor = age !== null && age < 18;
  let guardianPhone: string | null = null;
  if (isMinor) {
    const g = onlyDigits(input.guardianPhone);
    if (!isValidBrPhone(g)) errors.guardianPhone = "Para menores de 18 anos, informe o telefone do responsável.";
    else if (g === phone) errors.guardianPhone = "O telefone do responsável deve ser diferente do telefone do participante.";
    else guardianPhone = g;
  }

  let sessionId: number | null = null;
  if (opts.eventHasSessions) {
    if (input.sessionId === null || !opts.validSessionIds.includes(input.sessionId)) {
      errors.sessionId = "Escolha uma sessão.";
    } else {
      sessionId = input.sessionId;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, email, phone, cpf, birthDate: input.birthDate, guardianPhone, sessionId, isMinor },
  };
}
