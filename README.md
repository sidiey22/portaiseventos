# Portais Eventos

Inscrição, pagamento e check-in dos eventos da Igreja Missionária Portais Eternos.
Requisitos em `PRD.md`, plano e estado em `plan.md`, decisões em `CLAUDE.md`.

## Como rodar

Precisa de Node 22 ou mais novo.

```bash
npm install
cp .env.example .env.local   # preencha as chaves (ver comentários no arquivo)
npm run dev                  # http://localhost:3000
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` e `npm start` | Versão de produção (build com webpack, compatível com a Hostinger) |
| `npm test` | Testes das regras que não dependem do banco |
| `npm run typecheck` | Verificação de tipos |

## Onde fica cada coisa

- `app/(site)`: vitrine, página do evento com a compra, página da compra com os QR codes, "Meus ingressos".
- `app/equipe`: login da equipe (Supabase Auth), visão geral, gestão do evento (painel, dados, lotes e preços, formulário, equipe), cupons, administradores e check-in.
- `app/api/webhooks/mercadopago`: aviso de pagamento do Mercado Pago (assinatura conferida).
- `lib/`: acesso ao banco, permissões, preços, emails, Mercado Pago e relatórios.
- `supabase/migrations`: migrações do banco. As regras de vaga, lote, idade, combo, cupom, fila, pagamento, check-in e permissões ficam em funções SQL.
- `instrumentation.ts`: rotina a cada minuto que envia os QR codes pendentes e avisa quem saiu da fila.

## Produção (Hostinger + Supabase)

1. Variáveis de ambiente na Hostinger: as do `.env.example`.
2. Supabase → Authentication:
   - **Sign In / Providers**: desligue "Allow new users to sign up" (só entra quem for convidado).
   - **URL Configuration**: Site URL `https://portaiseventos.com`; Redirect URLs `https://portaiseventos.com/**`.
   - **Emails → SMTP Settings**: `smtp.hostinger.com`, porta 465, usuário e remetente `inscricao@portaiseventos.com`.
   - **Emails → Templates**: use os modelos abaixo (o link precisa ter `token_hash`).
3. Mercado Pago: webhook em `https://portaiseventos.com/api/webhooks/mercadopago`, evento "Pagamentos".

### Modelos de email do Supabase

**Invite user** — assunto: `Convite para a equipe do Portais Eventos`

```html
<h2>Você foi convidado para a equipe do Portais Eventos</h2>
<p>Clique no link abaixo para criar a sua senha e entrar.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Criar minha senha</a></p>
<p>Se você não esperava este convite, ignore este email.</p>
```

**Reset password** — assunto: `Criar ou trocar sua senha do Portais Eventos`

```html
<h2>Criar ou trocar sua senha</h2>
<p>Clique no link abaixo para definir uma nova senha.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Definir minha senha</a></p>
<p>Se você não pediu, ignore este email. Sua senha continua a mesma.</p>
```

## Segurança

- Todas as tabelas com RLS ligado e sem políticas; tabelas novas já nascem fechadas. Só o servidor acessa, com a chave secreta.
- O navegador não recebe nenhuma chave do Supabase. A única chave pública é a do Google Maps, restrita ao domínio.
- Permissões conferidas no servidor e de novo nas funções do banco (admin, gerente, credenciamento).
- Webhook do Mercado Pago com assinatura conferida; o pagamento é consultado direto na API antes de confirmar.
- Limite de tentativas no login, na compra e no check-in. Cabeçalhos de segurança (HSTS, proteção contra iframe).
- Exportação protegida contra fórmulas maliciosas no Excel. Gerentes não exportam CPF.
