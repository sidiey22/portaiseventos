# PRD: Portais Eventos

**Versão:** 0.3 (inclui o módulo de acampamentos e retiros, proposto em 2026-10-29)
**Data:** 2026-10-28
**Cliente/Dono:** Gabriel (Igreja Missionária Portais Eternos)

---

## 1. Visão geral

Aplicação web para a igreja Portais Eternos gerenciar inscrições, pagamentos e check-in de eventos. Pessoas se inscrevem pelo site, pagam (quando o evento for pago) pelo Mercado Pago e recebem um QR code por email para entrar no evento. A equipe usa o sistema para contar participantes e fazer o check-in na porta.

**Não é** um app de previsão do tempo. A ideia inicial foi descartada.

## 2. Problema

Hoje a igreja precisa saber quantas pessoas vêm aos eventos, cobrar quem é pago e controlar a entrada. Isso precisa ser organizado sem depender de planilhas e cobrança manual.

## 3. Objetivos

- Permitir inscrição e pagamento online em eventos pagos.
- Permitir inscrição gratuita em eventos que precisam de contagem de pessoas.
- Entregar um QR code por email que serve como ingresso.
- Dar à equipe um check-in rápido na porta, por celular ou computador.
- Dar ao administrador visão financeira por evento (valores recebidos, reembolsos, dashboards).

## 4. Exemplos de eventos

- **Pagos:** On Fire Camp (acampamento, 30/10 a 02/11/2026).
- **Gratuitos com inscrição obrigatória:** culto da virada (contagem de pessoas, sem cobrança).

## 5. Escopo

### Dentro do escopo (versão 1)

- Cadastro e inscrição de participantes em eventos.
- Eventos pagos e gratuitos, ambos com ou sem inscrição.
- Eventos com sessões (escolha de sessão na inscrição).
- Pagamento via Mercado Pago (cartão de crédito ou Pix).
- Envio de QR code por email após a confirmação.
- Controle de vagas: aumentar vagas, criar lotes de preço, fila de espera.
- Reserva temporária da vaga durante o pagamento.
- Bloqueio de inscrição duplicada da mesma pessoa no mesmo evento.
- Check-in por QR code (celular de voluntário) ou busca manual por nome (computador).
- Cancelamento pela própria pessoa em até 7 dias.
- Reembolso total feito pelo administrador.
- Painel do administrador com dados, valores por evento, reembolsos e dashboards.

### Fora do escopo (versão 1)

- Controle de doações.
- Integrações com outros sistemas (incluindo o Juventude Connect).
- Transmissão ao vivo.
- Emissão de certificados.
- App nativo (iOS/Android). A versão 1 é só web.
- Previsão do tempo.

## 6. Papéis e permissões

| Papel | Pode fazer |
|---|---|
| **Participante** (público) | Se inscrever, pagar, receber QR code, cancelar a própria inscrição em até 7 dias. |
| **Voluntário** | Ver apenas a lista de participantes do dia do evento, para fazer check-in. Não vê telefone, email nem valores. Acessa por login compartilhado. |
| **Administrador** | Tudo: criar eventos, ver todos os dados, valores arrecadados por evento, reembolsos, dashboards. Máximo de 5 administradores. |

- Somente administradores criam eventos.
- Voluntário não acessa dados financeiros.

## 7. Requisitos funcionais

### 7.1 Eventos

- Administrador cria evento com nome, data, local e tipo (pago ou gratuito).
- Evento pode exigir inscrição mesmo sendo gratuito.
- Administrador define número de vagas e, se houver, lotes de preço.
- Evento pode ter **sessões** (ex.: horários ou dias diferentes). Quando houver, o participante escolhe a sessão na inscrição.

### 7.2 Inscrição e pagamento

- Participante escolhe o evento e preenche os dados obrigatórios (ver 7.8).
- Para evento pago: o sistema reserva a vaga por até **10 minutos** enquanto o pagamento é confirmado pelo Mercado Pago.
- Se o pagamento não confirmar em 10 minutos, a vaga é liberada.
- Formas de pagamento: cartão de crédito ou Pix, via Mercado Pago.
- Após confirmação, o participante recebe um **email com QR code**.
- Para evento gratuito com inscrição: o participante se inscreve e recebe o QR code, sem passar pelo pagamento.

### 7.3 Vagas, lotes e fila de espera

- Administrador pode **aumentar o número de vagas** a qualquer momento.
- Administrador pode **criar lotes** de preço (ex.: 1º lote mais barato, depois lote mais caro).
- Quando as vagas acabam, o sistema oferece **fila de espera**.
- Regra de liberação da fila: **em aberto** (automática ou manual, e prazo para pagamento).

### 7.4 Duplicatas

- O sistema **bloqueia** inscrição duplicada: a mesma pessoa não pode se inscrever duas vezes no mesmo evento.

### 7.5 Check-in

- Voluntário escaneia o QR code com o celular.
- Alternativa: check-in manual num computador, buscando o nome da pessoa e confirmando.
- O voluntário vê apenas a lista do dia.
- Internet é considerada sempre disponível no local. **Não há modo offline.**

### 7.6 Cancelamento e reembolso

- Participante pode cancelar a própria inscrição em até **7 dias**, conforme a lei.
- Reembolso é sempre **total**.
- Administrador faz o reembolso por um botão no sistema, que chama a API do Mercado Pago.
- Cancelamento fora do prazo de 7 dias: o participante entra em contato com o **líder** da igreja.
- Reembolso após o evento: o participante entra em contato com o **líder** da igreja.

### 7.7 Painel do administrador

- Visualizar todos os dados do sistema.
- Ver valor arrecadado por evento.
- Ver reembolsos realizados.
- Dashboards gerais.

### 7.8 Campos da inscrição

Campos obrigatórios:

- Nome
- Email
- Telefone
- CPF
- Data de nascimento (necessária para identificar menores de 18 anos; acrescentada na implementação)
- **Se for menor de idade:** telefone do responsável (diferente do telefone do participante)
- **Sessão:** obrigatória apenas se o evento tiver sessões

## 8. Requisitos não funcionais

- Web responsiva, funcionando bem no celular (voluntários usam celular para check-in).
- Pagamentos processados pelo Mercado Pago. O sistema não armazena dados de cartão.
- Dados de participantes (nome, email, telefone, CPF) visíveis apenas para administradores, exceto a lista do dia do voluntário, que mostra só o necessário para o check-in.

## 9. Casos de borda

| Caso | Comportamento |
|---|---|
| Pix ou cartão demora ou não confirma | Vaga reservada por até 10 min; depois é liberada. |
| Cartão recusado após preencher dados | Vaga liberada após o prazo; participante pode tentar de novo. |
| Mesma pessoa tenta se inscrever duas vezes | Bloqueado. |
| Evento lota | Oferece fila de espera. |
| Administrador aumenta vagas | Fila de espera pode ser liberada (regra em aberto, ver 10). |
| Cancelamento após 7 dias | Participante é orientado a entrar em contato com o líder. |
| Reembolso após o evento | Participante é orientado a entrar em contato com o líder. |
| Participante menor de idade | Exige telefone do responsável. |
| Evento com sessões | Participante escolhe a sessão antes de pagar. |
| Voluntário usa login compartilhado | Não há registro individual de quem fez cada check-in (ver 10). |

## 10. Decisões assumidas (2026-10-29)

Assumidas pelo Claude com autorização do Gabriel; revisáveis.

- **Fila de espera:** automática. Quando uma vaga abre, o primeiro da fila recebe um email com link e tem 12 horas para iniciar o pagamento; depois passa para o próximo.
- **Lotes:** quem já pagou mantém o preço pago. Novos inscritos pagam o preço do lote vigente.
- **Líder:** nome e WhatsApp configuráveis pelo administrador, exibidos na tela de cancelamento fora do prazo e de reembolso após o evento.
- **Voluntários:** um login compartilhado, com senha trocada pelo administrador. Não há registro individual de quem fez o check-in.
- **On Fire Camp:** fora do sistema. O sistema vale a partir do próximo evento.

## 11. Premissas

- Eventos têm data e local definidos antes da abertura de inscrições.
- Internet estável no local de check-in.
- Igreja tem conta no Mercado Pago que receberá os pagamentos (o dinheiro vai direto para a conta da igreja).
- No máximo 5 administradores.

## 12. Acampamentos e retiros (proposta de 2026-10-29)

> **ADIADO (2026-11-04):** o Gabriel pediu para tirar o acampamento por enquanto. Fora da versão 1; esta seção fica como referência para uma versão futura.

### Por que um tipo de evento separado

Acampamentos e retiros têm vários dias, duas sessões por dia (manhã e noite) e precisam de controle de alimentação e de quem dorme no local. Eventos rápidos (culto, conferência) continuam com inscrição simples e QR code na porta. Os dois tipos convivem no sistema, cada um com a sua área de gestão e de check-in.

### Requisitos

**Cadastro do acampamento (administrador)**

- Informar nome, local, data de início, número de dias (o padrão é 4), vagas totais e **camas**.
- Cada dia tem duas sessões: manhã e noite.
- Definir o **preço por quantidade de dias**: uma tabela com 1 dia, 2 dias, 3 dias e assim por diante. As promoções são ajustes nessa tabela.
- O preço **não** muda conforme a sessão escolhida, só conforme a quantidade de dias.

**Inscrição (participante)**

- Além dos dados de sempre, a pessoa escolhe, dia a dia, em quais sessões vai (manhã, noite) e em quais noites vai **dormir** no local.
- Um dia conta como "dia de presença" se a pessoa marcar qualquer sessão ou a noite desse dia.
- O valor aparece na tela e se atualiza conforme ela marca os dias.
- Se as camas de uma noite acabaram, essa noite não pode ser escolhida para dormir.
- Pagamento, reserva de 10 minutos, fila de espera, QR code por email e cancelamento seguem as mesmas regras dos outros eventos.

**Planejamento de alimentação (administrador)**

- Por dia: quantas pessoas vão à sessão da manhã, à sessão da noite e quantas dormem.
- Estimativa de refeições por dia (café, almoço, jantar) com uma regra de exemplo, a ser ajustada às refeições que a igreja realmente serve.
- Só inscrições confirmadas entram na conta. As que aguardam pagamento aparecem à parte.

**Check-in do acampamento (voluntário)**

- O voluntário escolhe o **dia** e a **sessão**. O sistema mostra quem era esperado e quem já chegou.
- Presença por QR code ou por busca de nome.
- **Dormitório**: lista de quem dorme na noite escolhida, com confirmação de quem de fato ficou.
- Previsto × real por sessão, para ajustar a comida nos dias seguintes.

### Suposições (a confirmar com o Gabriel)

- O valor inclui hospedagem. Dormir não tem custo extra.
- Qualquer combinação de dias é permitida. O preço depende só de quantos dias foram marcados.
- As camas são contadas por noite.
- Refeições da estimativa de exemplo: café = quem dormiu na noite anterior; almoço = sessão da manhã; jantar = sessão da noite ou quem dorme.

### Fora do escopo deste módulo

- Divisão de quartos ou beliches por pessoa.
- Cardápio, lista de compras e custo da comida.
- Cobrança separada por refeição.
