// Traduz os códigos de erro das funções do banco para mensagens em português.
const MESSAGES: Record<string, string> = {
  event_not_found: "Evento não encontrado.",
  event_closed: "As inscrições para este evento não estão abertas.",
  bad_quantity: "Escolha de 1 a 20 ingressos.",
  session_required: "Escolha uma sessão.",
  session_invalid: "Escolha uma sessão válida.",
  bad_gender: "Escolha o gênero de cada participante.",
  answer_required: "Responda as perguntas obrigatórias de cada participante.",
  answer_invalid: "Há uma resposta que não pertence a este evento. Recarregue a página.",
  duplicate: "Este CPF já tem uma compra ativa neste evento.",
  no_lot: "As vendas estão fechadas no momento.",
  bad_birth_date: "Confira as datas de nascimento.",
  combo_invalid: "Este combo não está disponível.",
  combo_too_big: "O combo tem mais ingressos do que participantes.",
  coupon_invalid: "Cupom inválido ou vencido.",
  coupon_exhausted: "Este cupom já atingiu o limite de usos.",
  offer_invalid: "O prazo para pagar a vaga da fila terminou.",
  not_found: "Compra não encontrada.",
  forbidden: "Você não tem acesso a esta ação.",
  max_admins: "O limite é de 5 administradores.",
};

export function friendlyError(message: string): string {
  const seats = /not_enough_seats:(\d+)/.exec(message);
  if (seats) {
    const n = Number(seats[1]);
    return `Restam só ${n} ${n === 1 ? "vaga" : "vagas"}. Diminua a quantidade de ingressos.`;
  }
  for (const key of Object.keys(MESSAGES)) if (message.includes(key)) return MESSAGES[key]!;
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}
