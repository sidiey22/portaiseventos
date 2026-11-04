# Portais Eventos

Inscrição, pagamento e check-in dos eventos da Igreja Missionária Portais Eternos.
Requisitos em `PRD.md`, plano e estado em `plan.md`, decisões em `CLAUDE.md`.

## Como rodar

Precisa de Node 22 ou mais novo.

```bash
npm install
cp .env.example .env.local   # preencha SUPABASE_SECRET_KEY, as senhas e o SESSION_SECRET
npm run dev                  # http://localhost:3000
```

Na primeira execução são criados o administrador (`ADMIN_LOGIN` / `ADMIN_PASSWORD`) e o login
compartilhado dos voluntários (`VOLUNTEER_LOGIN` / `VOLUNTEER_PASSWORD`).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` e `npm start` | Versão de produção |
| `npm test` | Testes das regras de negócio |
| `npm run typecheck` | Verificação de tipos |

## Como usar (versão atual)

1. Entre em **Equipe** com o login de administrador.
2. **Novo evento**: nome, local, data, vagas e tipo (gratuito ou pago).
3. Eventos pagos: adicione pelo menos um **lote de preço**. Se houver mais de um horário, adicione **sessões**.
4. **Publicar inscrições**. O evento aparece na página inicial.
5. A pessoa se inscreve, e o ingresso com QR code aparece na tela e é enviado por email.

Sem `SMTP_URL`, os emails aparecem no log do servidor. Sem `MERCADOPAGO_ACCESS_TOKEN`, o pagamento é
simulado por um botão que só existe fora de produção.

## Produção (Hostinger + Supabase)

- O banco é o **Supabase** (Postgres). O esquema e as funções de regras já estão aplicados no projeto.
  As tabelas têm RLS ligado e nenhuma política: só o servidor acessa, com a chave secreta.
- Na Hostinger: app Node.js 22, importado deste repositório. Defina as variáveis de ambiente no painel:
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET` (texto longo e aleatório), `PUBLIC_URL`,
  `ADMIN_PASSWORD`, `VOLUNTEER_PASSWORD` e, depois, `SMTP_URL`, `MERCADOPAGO_ACCESS_TOKEN`.
- Nunca coloque a chave secreta no Git nem no navegador. O Supabase guarda CPF e telefones, inclusive de menores.
- O banco libera reservas vencidas e chama a fila de espera sozinho, a cada minuto (pg_cron).
