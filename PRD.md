# PRD: Portais Eventos

**Versão:** 0.5 (versão 2 do sistema, pedida em 2026-11-04: ver seção 13; ajustes de 2026-11-05 na seção 14; o que mudou está marcado com **NOVO** ou **SUBSTITUI**)
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

> **SUBSTITUÍDO** pela seção 13.7 (Administrador, Gerente do evento e Credenciamento, com login individual). A tabela abaixo é a da versão 1.

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

> **SUBSTITUÍDO** pela seção 13.5: a trava passa a olhar o CPF do comprador.

- O sistema **bloqueia** inscrição duplicada: a mesma pessoa não pode se inscrever duas vezes no mesmo evento.

### 7.5 Check-in

> **ATUALIZADO** pela seção 13.7: o check-in é feito pelo Credenciamento, por participante e uma vez por dia.

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

> **SUBSTITUÍDO** pelas seções 13.5 e 13.8 (dados do comprador, dados por participante e perguntas personalizadas).

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

## 13. Versão 2 (pedido de 2026-11-04) — NOVO

Mantém tudo que já foi decidido, exceto onde está marcado **SUBSTITUI**. Respostas do Gabriel às dúvidas estão marcadas com (decidido).

### 13.1 Tema claro e escuro — NOVO
- Claro e escuro em todo o app (público e painéis), incluindo a página do QR code.
- **SUBSTITUÍDO em 2026-11-05:** o tema oficial é o **claro**, para todo mundo, e não segue mais o aparelho. O escuro continua existindo só por escolha da pessoa, no botão do topo; a escolha fica salva naquele navegador.

### 13.2 Datas do evento — NOVO
- Data e hora de início e de término. O término é opcional (evento de um dia).
- Fuso America/Sao_Paulo em tudo.

### 13.3 Local com Google Maps — NOVO
- O admin ou o gerente busca o endereço (autocompletar do Google) e ajusta o PIN no mapa.
- Guardamos nome do local, endereço completo, latitude e longitude.
- A página pública mostra o mapa e o botão "Como chegar".
- A chave do Google fica restrita ao domínio portaiseventos.com e só às APIs Maps JavaScript e Places.

### 13.4 Lotes com virada automática por data — NOVO
- Cada lote tem preço, quantidade, início e fim.
- O lote vigente é calculado no servidor pela data atual: o primeiro lote (em ordem) que já começou, ainda não terminou e tem ingressos.
- Lote esgotado antes do fim passa para o próximo. Sem vagas no evento, vale a fila de espera.
- Entre dois lotes (um terminou e o próximo não começou), as vendas ficam fechadas e a página mostra quando o próximo lote abre.
- A página pública mostra o lote atual e quando ele termina.
- Todos os ingressos de uma compra pagam o preço do lote vigente no momento da compra, mesmo que passem da quantidade que restava nesse lote (decidido). O próximo lote começa depois.

### 13.5 Compra com vários ingressos — SUBSTITUI a regra de uma inscrição por pessoa
- Um comprador compra um ou mais ingressos de uma vez.
- Dados do comprador: nome, email, telefone e CPF. O comprador declara ter 18 anos ou mais e é o responsável pelos menores da compra; isso substitui o telefone do responsável (decidido).
- Dados de cada participante: nome, gênero (Feminino ou Masculino), data de nascimento e as perguntas do evento (13.8).
- Um único pagamento no Mercado Pago cobre a compra toda. Compra com total zero (por exemplo, só crianças grátis) é confirmada sem pagamento.
- Um QR code por participante, todos enviados ao email do comprador. Cada QR faz o check-in só daquele participante.
- Cada participante ocupa uma vaga. A reserva de 10 minutos vale para a compra inteira.
- Cancelamento em até 7 dias e reembolso continuam totais e valem para a compra inteira.
- Duplicidade: o mesmo CPF de comprador não pode ter duas compras ativas no mesmo evento.
- Vagas insuficientes (decidido): se a compra pede mais ingressos do que as vagas restantes, ela é bloqueada e a pessoa vê quantas vagas restam. A fila de espera só abre quando o evento esgota. Na fila, cada compra espera com a sua quantidade; quando abrem vagas, é chamada a primeira compra da fila que cabe nas vagas abertas.

### 13.6 Preços, descontos, cupons e combos — NOVO (só o administrador cria cupons e combos)
Ordem de cálculo: (1) preço do lote vigente por ingresso; (2) desconto por idade por ingresso; (3) combo; (4) cupom sobre o total.
- **Desconto por idade:** faixas por evento (idade mínima e máxima) com desconto percentual, em valor ou grátis. Uma data de referência por evento define a idade de cada participante. Validação no servidor.
- **Combo:** nome, quantidade de ingressos e preço fechado, por evento. A pessoa escolhe combos e ingressos avulsos. Os ingressos dentro do combo pagam só o preço do combo, sem desconto por idade (decidido). O sistema coloca no combo os participantes que sairiam mais caros avulsos, para o total ficar o menor possível.
- **Cupom:** código, percentual ou valor fixo, validade, limite de usos, um evento ou todos, ativo ou inativo. O cupom é aplicado por último, sobre o total, e o total nunca fica negativo. O admin vê quantas vezes cada cupom foi usado.

### 13.7 Papéis e permissões — SUBSTITUI o login compartilhado
"Voluntário" passa a se chamar **Credenciamento** em todo o app.

| Papel | Pode |
|---|---|
| Administrador (máximo 5) | Tudo: eventos, cupons, combos, reembolsos, visão geral. Define os gerentes de cada evento por email. |
| Gerente do evento | Só nos eventos dele: inscritos, dashboards, valores, exportação, editar evento (descrição, lotes, formulário, local, datas), convidar e remover credenciadores. Não faz reembolso, não cria cupom nem combo, não vê outros eventos. |
| Credenciador | Só o check-in dos eventos para os quais foi convidado: QR code pelo celular e busca por nome. Vê nome do participante e situação do check-in, sem contatos nem valores. |

- Login individual com convite por email, pelo Supabase Auth (decidido). O convite leva a um link para criar a senha.
- As permissões são conferidas no servidor e de novo nas funções do banco.
- Check-in uma vez por dia em eventos de vários dias (decidido). Em evento de um dia, uma vez só.

### 13.8 Formulário personalizável por evento — NOVO
- Campos fixos: dados do comprador; nome, gênero e data de nascimento de cada participante.
- Perguntas extras por evento, criadas pelo admin ou gerente: texto curto, texto longo, sim/não, escolha única, múltipla escolha, número e data. Cada uma obrigatória ou opcional, respondida por participante.
- As respostas aparecem na lista e na exportação.

### 13.9 Dashboards por evento — NOVO
- Cards: arrecadado, inscritos, check-ins, vagas restantes, fila de espera.
- Filtros: gênero, lote, status do pagamento, faixa de idade, com ou sem check-in, respostas das perguntas.
- Gráficos: inscrições ao longo do tempo e check-ins por dia.
- Exportação CSV e Excel respeitando os filtros (admin e gerente).
- Visão geral de todos os eventos para o admin.

### 13.10 Segurança — NOVO
- RLS ligado em todas as tabelas, sem acesso para as chaves públicas; tabelas novas já nascem fechadas.
- Chave secreta do Supabase só no servidor. O navegador não recebe nenhuma chave do Supabase.
- Banners num bucket público de imagens, com tipo e tamanho limitados; o envio passa pelo servidor.
- Chave do Google Maps restrita por domínio e por API.

### 13.11 Pendências desta versão
- Email de envio do sistema: **inscricao@portaiseventos.com** (conta da Hostinger). Usado para os QR codes, avisos da fila e convites do Supabase Auth (SMTP da Hostinger).
- Chave do Google Maps (precisa de conta Google Cloud com faturamento ativo; conferir a cota gratuita e os preços atuais do Google antes de ligar).
- Sessões (seção 7.1) continuam existindo: a sessão é escolhida uma vez por compra (decidido).

## 14. Ajustes de 2026-11-05 — NOVO

### 14.1 Tema oficial claro
Ver 13.1.

### 14.2 Editar e apagar evento (administrador)
- **Editar:** botão "Editar" na lista de eventos e "Editar evento" na página do evento. O administrador altera tudo (nome, tipo, vagas, datas, local, banner, textos); o gerente altera só o que a seção 13.7 permite.
- **Apagar:** só o administrador, na aba "Dados do evento", área "Apagar evento". Exige digitar o nome do evento para confirmar.
- O sistema **não apaga** se houver compra **confirmada** (é preciso reembolsar ou cancelar cada uma antes) nem compra **aguardando pagamento** (expira em até 10 minutos). Para só parar de vender, usa-se "Encerrar inscrições".
- Ao apagar, saem junto: lotes, faixas de idade, combos, cupons, perguntas, equipe, fila de espera, compras canceladas ou expiradas (com os pagamentos e reembolsos delas) e o banner. Não dá para desfazer.

### 14.3 Email do QR code com a identidade do evento
- O email mostra o **banner do evento** no topo; sem banner enviado, usa a arte automática do evento (mesmas cores da vitrine, com o nome, a data e "Portais Eternos").
- Cada participante tem um cartão com nome, QR code nas cores do evento, o código e a orientação de apresentar na entrada, mais o botão "Abrir meus ingressos".
- Os QR codes continuam anexados ao email e o conteúdo do QR code não mudou.

### 14.4 "Meus ingressos"
- Continua como está (decidido: sem login de participante, para não complicar a compra). A pessoa encontra os ingressos pelo email recebido e pela aba "Meus ingressos".
