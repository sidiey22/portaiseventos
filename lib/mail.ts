import QRCode from "qrcode";
import nodemailer, { type Transporter } from "nodemailer";
import { paletteFor } from "./palette.ts";
import { dayKey, formatDate, formatRange } from "./time.ts";

/** O QR code carrega só o código do ingresso, com prefixo para o leitor reconhecer. */
export const QR_PREFIX = "PE-";
export const qrPayload = (code: string) => `${QR_PREFIX}${code}`;

export async function qrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(qrPayload(code), { margin: 2, width: 320, errorCorrectionLevel: "M" });
}

export function publicUrl(path: string): string {
  return `${(process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let transport: Transporter | null = null;
function smtp(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null;
  if (!transport) {
    const port = Number(SMTP_PORT || 465);
    transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD } });
  }
  return transport;
}

const FROM = () => process.env.MAIL_FROM ?? "Portais Eventos <inscricao@portaiseventos.com>";

type Attach = { filename: string; content: Buffer; cid: string; contentType?: string };
async function send(to: string, subject: string, text: string, html: string, attachments: Attach[] = []) {
  const t = smtp();
  if (!t) { console.log(`[email simulado, sem SMTP] para ${to} | ${subject}\n${text}`); return; }
  await t.sendMail({ from: FROM(), to, subject, text, html, attachments });
}

function layout(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#17171a">
<p style="font-weight:800;letter-spacing:.08em;margin:0 0 16px">PORTAIS ETERNOS · EVENTOS</p>${body}
<p style="color:#5e5e66;font-size:12px;margin-top:28px">Igreja Missionária Portais Eternos · Este email foi enviado por inscricao@portaiseventos.com</p></div>`;
}

export type TicketMail = {
  buyerName: string; buyerEmail: string; orderCode: string; eventId: number; eventName: string; kind: "paid" | "free";
  startsAt: string; endsAt: string | null; place: string; tickets: { code: string; name: string }[];
  /** Banner enviado pelo administrador (já baixado). Sem ele, o email usa a arte automática do evento, nas cores do portal. */
  banner?: { content: Buffer; contentType: string } | null;
};

const dayMonth = (iso: string) => formatDate(iso).slice(0, 5);

/** Cabeçalho do email: o banner do evento ou a arte automática (arco do portal, mesmas cores da vitrine). */
function header(m: TicketMail): string {
  if (m.banner) return `<img src="cid:banner" alt="Banner do evento ${esc(m.eventName)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`;
  const [bg, mid, accent] = paletteFor(m.eventId);
  const multi = m.endsAt && dayKey(m.endsAt) !== dayKey(m.startsAt);
  const date = dayMonth(m.startsAt) + (multi ? ` a ${dayMonth(m.endsAt!)}` : "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="background:${bg};background-image:linear-gradient(135deg,${bg},${mid})"><tr><td style="padding:34px 28px 30px;font-family:Arial,Helvetica,sans-serif">
<p style="margin:0 0 10px;color:${accent};font-size:12px;font-weight:700;letter-spacing:.2em">${esc(date)} · ${m.kind === "free" ? "ENTRADA GRATUITA" : "INGRESSO CONFIRMADO"}</p>
<p style="margin:0;color:#fbfaf4;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:.02em">${esc(m.eventName.toUpperCase())}</p>
<p style="margin:18px 0 0;color:#fbfaf4;opacity:.8;font-size:11px;font-weight:700;letter-spacing:.28em">PORTAIS ETERNOS</p></td></tr></table>`;
}

/** HTML do email dos ingressos (puro, sem rede; testável). Cores do portal: fundo claro, destaque amarelo. */
export function ticketsHtml(m: TicketMail, link: string): string {
  const when = formatRange(m.startsAt, m.endsAt), frame = paletteFor(m.eventId)[1];
  const card = (t: { code: string; name: string }, i: number) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #dcdcd6;border-radius:16px;background:#ffffff"><tr><td align="center" style="padding:20px 16px;font-family:Arial,Helvetica,sans-serif">
<p style="margin:0 0 2px;color:#5e5e66;font-size:11px;font-weight:700;letter-spacing:.16em">INGRESSO ${i + 1} DE ${m.tickets.length}</p>
<p style="margin:0 0 14px;color:#17171a;font-size:18px;font-weight:800">${esc(t.name)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:10px;background:#ffffff;border:3px solid ${frame};border-radius:16px"><img src="cid:qr${i}" alt="QR code de ${esc(t.name)}" width="220" height="220" style="display:block;border:0"></td></tr></table>
<p style="margin:12px 0 0;color:#17171a;font-family:Consolas,Menlo,monospace;font-size:13px;letter-spacing:.08em">${esc(qrPayload(t.code))}</p>
<p style="margin:6px 0 0;color:#5e5e66;font-size:12px">Apresente este QR code na entrada</p></td></tr></table>`;
  return `<div style="background:#f5f5f3;padding:20px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dcdcd6">
<tr><td>${header(m)}</td></tr>
<tr><td style="padding:26px 24px 8px;font-family:Arial,Helvetica,sans-serif;color:#17171a">
<p style="margin:0 0 6px;font-size:20px;font-weight:800">Olá, ${esc(m.buyerName)}! Sua compra está confirmada.</p>
<p style="margin:0 0 18px;color:#5e5e66;font-size:15px;line-height:1.5">Cada pessoa apresenta o próprio QR code na entrada. Se preferir, guarde este email ou abra seus ingressos pelo botão abaixo.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;line-height:1.5"><tr><td style="padding:0 10px 6px 0;color:#5e5e66;font-weight:700">Quando</td><td style="padding:0 0 6px">${esc(when)}</td></tr><tr><td style="padding:0 10px 0 0;color:#5e5e66;font-weight:700">Onde</td><td>${esc(m.place)}</td></tr></table></td></tr>
<tr><td style="padding:0 24px">${m.tickets.map(card).join("")}</td></tr>
<tr><td align="center" style="padding:4px 24px 28px"><a href="${esc(link)}" style="display:inline-block;background:#ffe970;color:#1a1700;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:12px">Abrir meus ingressos</a></td></tr>
<tr><td style="padding:16px 24px;background:#f5f5f3;border-top:1px solid #dcdcd6;font-family:Arial,Helvetica,sans-serif;color:#5e5e66;font-size:12px;line-height:1.5"><strong style="letter-spacing:.14em;color:#17171a">PORTAIS ETERNOS · EVENTOS</strong><br>Igreja Missionária Portais Eternos · Este email foi enviado por inscricao@portaiseventos.com</td></tr>
</table></div>`;
}

/** Envia todos os QR codes da compra para o email do comprador (um por participante). */
export async function sendTicketsEmail(m: TicketMail): Promise<void> {
  const link = publicUrl(`/compra/${m.orderCode}`);
  const when = formatRange(m.startsAt, m.endsAt);
  const subject = `Seus ingressos: ${m.eventName}`;
  const text = `Olá, ${m.buyerName}!\n\nSua compra para ${m.eventName} está confirmada.\nQuando: ${when}\nOnde: ${m.place}\n\nParticipantes:\n${m.tickets.map((t) => `- ${t.name}`).join("\n")}\n\nCada pessoa apresenta o próprio QR code na entrada. Veja todos em: ${link}\n`;
  const dark = paletteFor(m.eventId)[0];
  const attachments: Attach[] = await Promise.all(m.tickets.map(async (t, i) => ({
    filename: `ingresso-${i + 1}.png`, cid: `qr${i}`, content: await QRCode.toBuffer(qrPayload(t.code), { margin: 1, width: 440, errorCorrectionLevel: "M", color: { dark, light: "#ffffff" } }),
  })));
  if (m.banner) attachments.push({ filename: "banner", cid: "banner", content: m.banner.content, contentType: m.banner.contentType });
  await send(m.buyerEmail, subject, text, ticketsHtml(m, link), attachments);
}

export async function sendOfferEmail(m: { buyerName: string; buyerEmail: string; orderCode: string; eventName: string; until: string; count: number }): Promise<void> {
  const link = publicUrl(`/compra/${m.orderCode}`);
  const until = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(m.until));
  const text = `Olá, ${m.buyerName}!\n\nAbriram vagas para os seus ${m.count} ingressos em ${m.eventName}.\nConclua o pagamento até ${until}: ${link}\n`;
  await send(m.buyerEmail, `Abriu vaga: ${m.eventName}`, text, layout(`<p>Olá, ${esc(m.buyerName)}!</p><p>Abriram vagas para os seus ${m.count} ingressos em <strong>${esc(m.eventName)}</strong>.</p><p>Conclua o pagamento até <strong>${esc(until)}</strong>.</p><p><a href="${link}">Garantir minhas vagas</a></p>`));
}

export async function sendStaffAddedEmail(m: { email: string; eventName: string; role: "manager" | "credential" }): Promise<void> {
  const what = m.role === "manager" ? "gerente" : "credenciamento (check-in)";
  const link = publicUrl("/equipe");
  await send(m.email, `Acesso ao evento ${m.eventName}`, `Você agora faz parte da equipe de ${m.eventName}, como ${what}. Entre em ${link}.`,
    layout(`<p>Você agora faz parte da equipe de <strong>${esc(m.eventName)}</strong>, como ${what}.</p><p><a href="${link}">Entrar na área da equipe</a></p>`));
}
