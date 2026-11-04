# Testes

- `npm test`: regras que não dependem do banco (CPF, idade, campos, senha, sessão, valores).
- As regras de vaga, lote, fila de espera, duplicidade, pagamento idempotente e cancelamento ficam em funções SQL
  no Supabase (`register_attendee`, `confirm_payment`, `cancel_self`, `promote_waitlist`...). Elas foram testadas
  no próprio banco, dentro de uma transação que é desfeita no final. Repita esse roteiro ao mudar as funções.
