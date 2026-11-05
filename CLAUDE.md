# CLAUDE.md: Portais Eventos

Instruções para o Claude ao trabalhar neste projeto. Leia antes de qualquer mudança.

## Sobre o projeto

Portais Eventos é uma aplicação web da igreja Missionária Portais Eternos para inscrição, pagamento e check-in de eventos. O requisito completo está em `PRD.md`. Em caso de dúvida sobre escopo, consulte o PRD antes de implementar.

**Não é** um app de previsão do tempo. Essa ideia inicial foi descartada.

## Idioma

- Todo texto voltado ao usuário final (interface, emails, mensagens de erro, QR code) em **português do Brasil**.
- Documentação e comentários no código em português, salvo convenção técnica em contrário.
- Nomes de variáveis, funções e arquivos em inglês, sem acentos.

## Regras de negócio (resumo do PRD; a versão 2 está na seção 13 do PRD e prevalece)

- **Eventos** podem ser pagos ou gratuitos. Eventos gratuitos ainda podem exigir inscrição para contagem.
- **Sessões:** eventos podem ter sessões. Quando houver, o participante escolhe a sessão na inscrição.
- **Pagamento** somente via Mercado Pago (cartão de crédito ou Pix). Não armazenar dados de cartão.
- **Reserva de vaga:** a vaga fica segurada por até **10 minutos** enquanto o pagamento confirma.
- **Inscrição duplicada:** bloqueada para a mesma pessoa no mesmo evento.
- **Campos obrigatórios:** nome, email, telefone, CPF. Se menor de idade, telefone do responsável.
- **QR code:** enviado por email após confirmação. Serve como ingresso.
- **Vagas:** administrador pode aumentar vagas, criar lotes de preço e liberar fila de espera.
- **Cancelamento:** a própria pessoa pode cancelar em até **7 dias**, conforme a lei. Depois disso, a pessoa é orientada a falar com o líder.
- **Reembolso:** sempre total, feito pelo administrador via botão que chama a API do Mercado Pago. Reembolso após o evento: a pessoa é orientada a falar com o líder.
- **Check-in:** por QR code no celular de um voluntário, ou busca manual por nome num computador.
- **Acampamentos e retiros (ADIADO em 2026-11-04, não implementar por enquanto):** tipo de evento separado (`camp`): vários dias, sessões de manhã e noite, preço pela quantidade de dias (não pela sessão), controle de camas por noite e de alimentação. Check-in próprio por dia e sessão. Ver seção 12 do `PRD.md`.

## Papéis

| Papel | Acesso |
|---|---|
| Participante | Inscrição, pagamento, QR code, cancelamento em até 7 dias. |
| Gerente do evento | Só nos eventos dele: inscritos, dashboards, valores, exportação, editar evento, convidar credenciadores. Sem reembolso, cupons ou combos. |
| Credenciamento | Só o check-in dos eventos para os quais foi convidado. Sem telefone, email ou valores. Login individual. |
| Administrador | Tudo. Único papel que cria eventos. Máximo de 5. |

Nunca exponha dados financeiros ou de contato a voluntários. Trate essa regra como restrição de segurança, não apenas de interface.

## Fora do escopo (versão 1)

Não implemente nem sugira como parte desta versão:

- Controle de doações
- Integrações com outros sistemas (incluindo Juventude Connect)
- Transmissão ao vivo
- Emissão de certificados
- App nativo
- Modo offline no check-in (internet é considerada sempre disponível)

## Como trabalhar

- O Gabriel autorizou começar o código e assumir as decisões pendentes (2026-10-29). As decisões estão em "Decisões assumidas" abaixo e em `plan.md`.
- Mudar stack, banco ou qualquer decisão assumida exige confirmar com o Gabriel antes.
- Mudanças que afetem regras de negócio devem atualizar o `PRD.md` na mesma alteração.
- Priorize simplicidade. A igreja é o público, não uma empresa com equipe técnica grande.
- Trate pagamentos e dados pessoais com cuidado: validar no servidor, nunca só no cliente. CPF e dados de menores exigem cuidado extra.

## Decisões assumidas (autorizadas pelo Gabriel em 2026-10-29)

Revisáveis a qualquer momento. Se o Gabriel mudar uma, atualize aqui, no `PRD.md` e no `plan.md`.

- **D1 Stack (alterada em 2026-11-04 a pedido do Gabriel):** Next.js (App Router) + TypeScript, banco **Supabase Postgres** (projeto `heygfwjzhkcjfranbeef`, região sa-east-1), sem ORM. Todas as tabelas com RLS ligado e sem políticas: só o servidor acessa, com a chave secreta (`SUPABASE_SECRET_KEY`), nunca no navegador. Regras de vaga, fila, pagamento e check-in estão em funções SQL (`register_attendee`, `confirm_payment`, `cancel_self`, `check_in`, `volunteer_list`, `run_maintenance` via pg_cron a cada minuto). Hospedagem: Hostinger (plano Business Web Hosting, app Node.js 22 via GitHub), endereço **portaiseventos.com**; webhook do Mercado Pago em `https://portaiseventos.com/api/webhooks/mercadopago`. O código em SQLite foi removido.
- **D2 Fila de espera:** automática. Quando uma vaga abre, o primeiro da fila recebe email com link e tem 12 horas para iniciar o pagamento (depois disso passa para o próximo). O pagamento em si segue a reserva de 10 minutos.
- **D3 Lotes:** quem já pagou mantém o preço pago. O lote vigente é o primeiro com vagas disponíveis dentro da data; novos inscritos pagam o preço do lote vigente.
- **D4 Líder:** nome e WhatsApp do líder ficam em configuração editável pelo administrador e aparecem na tela de cancelamento fora do prazo.
- **D5 (substituída em 2026-11-04):** login individual por convite (Supabase Auth). "Voluntário" agora se chama Credenciamento. Ver PRD seção 13.7.
- **D6 Mercado Pago:** credenciais por variável de ambiente. Sem credenciais, o sistema roda em modo simulado para desenvolvimento.
- **On Fire Camp:** fica fora do sistema (processo atual). O sistema vale a partir do próximo evento.
- **D7 Acampamentos (proposta de 2026-10-29, aguardando confirmação):** hospedagem incluída no preço; qualquer combinação de dias vale; camas contadas por noite; estimativa de refeições com regra de exemplo (café = dormiu na noite anterior, almoço = sessão da manhã, jantar = sessão da noite ou dorme).
