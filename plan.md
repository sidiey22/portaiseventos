# Plano de Implementação: Portais Eventos

**Versão:** 0.1 (rascunho)
**Data:** 2026-10-29
**Referências:** `PRD.md` (v0.2) e `CLAUDE.md`

---

## 0. Alerta de prazo

O **On Fire Camp** é de 30/10 a 02/11/2026, e a versão 1 não ficará pronta a tempo. Para o acampamento, a inscrição e o pagamento continuam pelo processo atual. O sistema começa a valer para o próximo evento.

Antes de qualquer código, confirmar com o Gabriel: **o On Fire Camp fica fora do sistema?**

## 1. Decisões (assumidas em 2026-10-29, revisáveis)

O Gabriel autorizou assumir as decisões e começar o código.

| # | Decisão | Escolha |
|---|---|---|
| D1 | Stack | Next.js (App Router) + TypeScript, **Supabase Postgres** (trocado em 2026-11-04), sem ORM. Hospedagem a definir. |
| D2 | Fila de espera | Automática; o primeiro da fila tem 12 horas para iniciar o pagamento. |
| D3 | Lotes | Quem já pagou mantém o preço; novos inscritos pagam o lote vigente. |
| D4 | Contato do líder | Nome e WhatsApp configuráveis pelo admin, exibidos na tela de cancelamento tardio. |
| D5 | Voluntários | Login compartilhado, senha trocada pelo admin. |
| D6 | Mercado Pago | Credenciais por variável de ambiente; modo simulado sem credenciais. |

## Estado da implementação

- **Versão 2 (2026-11-04): banco aplicado no Supabase** (migração `portais_eventos_v2`, aprovada pelo Gabriel). 18 tabelas com RLS e fechadas para as chaves públicas; funções só para o servidor; rotina de manutenção a cada minuto. Código da versão 2 escrito (compra com vários ingressos, idade, combos, cupons, perguntas, painel com filtros e exportação, gerente e credenciamento com Supabase Auth, check-in com câmera, emails com QR pelo SMTP da Hostinger, Mercado Pago Checkout Pro com webhook e reembolso). **Falta testar de ponta a ponta no site** com as credenciais reais (Mercado Pago em modo de teste).

- **Migração para o Supabase (2026-11-04): banco pronto.** Esquema, RLS, funções de regras e rotina de manutenção (pg_cron) criados e testados no projeto. Código do app trocado para o Supabase (build e tipos passam). **Falta:** testar de ponta a ponta com a chave real, ligar o Mercado Pago (checkout e webhook), email, check-in, cancelamento e reembolso.

- **Fase 1 (fundação): feita.** Next.js + SQLite, login com papéis (admin e voluntário), limite de 5 admins, sessão em cookie assinado, limite de tentativas de login.
- **Fase 2 (eventos): feita.** Criar evento, publicar/encerrar, aumentar vagas, lotes de preço, sessões, lista de inscritos e totais no painel.
- **Fase 3 (inscrição): feita.** Formulário com validação (CPF, menor de idade, sessão), bloqueio de duplicidade, ingresso com QR code, email (simulado no log sem SMTP).
- **Fase 4 (pagamento): parcial.** Pronto: reserva de 10 minutos, liberação da vaga, confirmação idempotente, pagamento tardio só confirma com vaga livre, lote vigente. **Falta:** integração real com o Mercado Pago (checkout cartão/Pix e webhook). Hoje só existe o botão de pagamento simulado, que fica desligado em produção.
- **Fase 5 (fila de espera): parcial.** Pronto: entrada na fila. **Falta:** avisar o primeiro da fila quando abre vaga (12 horas para pagar).
- **Fase 6 (check-in): pendente.** Existe o login do voluntário; falta a leitura de QR, a busca manual e a lista do dia.
- **Fase 7 (cancelamento e reembolso): pendente.** A regra de 7 dias já existe em `canSelfCancel`; falta tela, reembolso pelo Mercado Pago e contato do líder.
- **Fase 8 (dashboards): parcial.** Painel mostra inscritos, fila e arrecadado por evento; faltam reembolsos e gráficos.
- **Fase 9 (homologação): pendente.** Há 23 testes das regras de negócio (`npm test`) e um roteiro de teste em navegador executado manualmente (25 verificações).

### Pendências conhecidas

- Trocar a senha do login dos voluntários e cadastrar mais administradores pela interface (hoje só pelo ambiente).
- Configuração do líder (nome e WhatsApp) pelo painel.
- Limite de requisições no formulário público de inscrição (anti-abuso).
- Expiração das reservas só acontece quando alguém acessa o sistema; para a fila (Fase 5) será preciso uma rotina periódica.

## 2. Fases

### Fase 1: Fundação

- Criar o projeto com a stack escolhida em D1.
- Configurar ambientes: desenvolvimento, homologação e produção.
- Autenticação com três papéis: participante, voluntário e administrador.
- Limite de 5 administradores.
- Modelo de dados inicial: eventos, sessões, lotes, inscrições, pagamentos, reembolsos.
- Interface responsiva, testada em celular.

**Critério de aceite:** um administrador consegue entrar, um voluntário consegue entrar e ver só o que o PRD permite, e nenhum dos dois vê o que não deveria.

### Fase 2: Gestão de eventos (administrador)

- Criar evento com nome, data, local e tipo (pago ou gratuito).
- Definir número de vagas e aumentar vagas depois.
- Criar lotes de preço.
- Criar sessões quando o evento tiver mais de um horário ou dia.
- Só administradores criam eventos.

**Critério de aceite:** um evento com sessões e dois lotes pode ser criado e editado sem afetar inscrições já feitas.

### Fase 3: Inscrição gratuita

- Formulário com nome, email, telefone e CPF.
- Validação de CPF.
- Se menor de idade, pedir telefone do responsável.
- Escolha de sessão quando o evento tiver sessões.
- Bloqueio de inscrição duplicada (mesma pessoa, mesmo evento).
- Envio do QR code por email após a inscrição.

**Critério de aceite:** inscrição gratuita completa gera QR code válido e impede segunda inscrição da mesma pessoa.

### Fase 4: Pagamento pelo Mercado Pago

- Integrar com o Mercado Pago (cartão e Pix).
- Reservar a vaga por até **10 minutos** durante o pagamento e liberar depois.
- Receber a confirmação do Mercado Pago pelo webhook.
- Tratar webhook repetido sem duplicar inscrição ou pagamento (idempotência).
- Enviar QR code após pagamento aprovado.
- Não armazenar dados de cartão.

**Critério de aceite:** cada caso do PRD (pagamento pendente, recusado, aprovado, webhook repetido) termina com estado correto e vaga consistente.

### Fase 5: Fila de espera

- Depende de D2.
- Quando as vagas acabam, oferecer entrada na fila.
- Liberar vaga conforme a regra decidida em D2.

**Critério de aceite:** a regra de D2 funciona do começo ao fim, incluindo o prazo de pagamento se houver.

### Fase 6: Check-in

- Leitura do QR code pelo celular do voluntário.
- Busca manual por nome num computador, com confirmação.
- Lista do dia para o voluntário, sem telefone, email ou valores.
- Login compartilhado, conforme D5.

**Critério de aceite:** voluntário faz check-in pelo celular e pelo computador, e não vê nenhum dado financeiro ou de contato.

### Fase 7: Cancelamento e reembolso

- Participante cancela sozinho em até 7 dias.
- Depois de 7 dias, mensagem orientando a falar com o líder (texto conforme D4).
- Administrador faz reembolso total por botão que chama a API do Mercado Pago.
- Registrar cada reembolso.

**Critério de aceite:** cancelamento dentro do prazo gera reembolso total; fora do prazo, a mensagem aparece e nenhum reembolso é feito sem o administrador.

### Fase 8: Painel do administrador

- Ver todos os dados do sistema.
- Valor arrecadado por evento.
- Reembolsos realizados.
- Dashboards gerais.

**Critério de aceite:** os totais do painel batem com os pagamentos e reembolsos registrados no Mercado Pago.

### Fase 9: Testes e homologação

- Testes de borda do PRD (seção 9): pagamento atrasado, recusado, duplicado, webhook repetido, lote esgotado, evento com sessões.
- Testes em celulares reais para check-in.
- Testes com credenciais de sandbox do Mercado Pago antes de qualquer cobrança real.
- Ensaio com um evento gratuito pequeno antes do primeiro evento pago.
- Revisão de segurança: dados de voluntários, CPF e dados de menores.

**Critério de aceite:** todos os casos de borda passam em homologação, e o ensaio com evento gratuito roda sem falhas.

## 3. Ordem e dependências

```
D1 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 8
                         ↓
              D2 → Fase 5
              D5 → Fase 6
              D4 → Fase 7
                         ↓
                    Fase 9 (homologação)
```

- Fase 1 só começa com D1.
- Fases 5, 6 e 7 só começam depois da decisão correspondente.
- Fase 9 vem depois de tudo.

## 4. Fora deste plano

Itens do PRD fora da versão 1 não entram aqui: doações, integrações, transmissão ao vivo, certificados, app nativo e modo offline.

## 5. Riscos

- **Prazo:** o On Fire Camp acontece antes de qualquer entrega (ver seção 0).
- **Pagamento:** falhas no webhook podem gerar inscrição sem pagamento ou pagamento sem inscrição. Idempotência e conciliação com o Mercado Pago são obrigatórias.
- **Dados sensíveis:** CPF e telefones de menores. Acesso restrito e nada em URL ou log.
- **Login compartilhado (D5):** sem registro individual de check-in.
- **Carga no dia do evento:** check-in precisa aguentar fila na porta sem travar.

## 6. Fase 10 (ADIADA em 2026-11-04): acampamentos e retiros

O Gabriel pediu para tirar o acampamento por enquanto. Não implementar até nova ordem.

Origem: pedido do Gabriel em 2026-10-29. Detalhes e suposições na seção 12 do `PRD.md`. Recomendo fazer **antes da Fase 6** (check-in), porque o acampamento tem um check-in próprio por dia e sessão.

- Novo tipo de evento `camp` com dias, sessões manhã/noite, camas e tabela de preço por quantidade de dias.
- Inscrição com escolha de sessões por dia e noites de alojamento; preço calculado pela quantidade de dias; bloqueio de noite sem cama.
- Painel do administrador: tabela de preços, camas por noite e planejamento de alimentação (manhã, noite, dormem, refeições estimadas).
- Check-in do voluntário por dia e sessão, mais lista do dormitório.
- Testes: preço por quantidade de dias, camas por noite, contagem por sessão e por noite, fila de espera com camas.

**Critério de aceite:** um acampamento de 4 dias criado pelo administrador mostra, para cada dia, quantos vão à manhã, à noite e dormem; o voluntário registra presença por sessão e o painel mostra previsto × real.
