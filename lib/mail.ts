import QRCode from "qrcode";
import nodemailer, { type Transporter } from "nodemailer";
import { formatRange } from "./time.ts";

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

async function send(to: string, subject: string, text: string, html: string, attachments: { filename: string; content: Buffer; cid: string }[] = []) {
  const t = smtp();
  if (!t) { console.log(`[email simulado, sem SMTP] para ${to} | ${subject}\n${text}`); return; }
  await t.sendMail({ from: FROM(), to, subject, text, html, attachments });
}

function layout(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#17171a">
<p style="font-weight:800;letter-spacing:.08em;margin:0 0 16px">PORTAIS ETERNOS · EVENTOS</p>${body}
<p style="color:#5e5e66;font-size:12px;margin-top:28px">Igreja Missionária Portais Eternos · Este email foi enviado por inscricao@portaiseventos.com</p></div>`;
}

type TicketMail = { buyerName: string; buyerEmail: string; orderCode: string; eventName: string; startsAt: string; endsAt: string | null; place: string; tickets: { code: string; name: string }[] };

/** Envia todos os QR codes da compra para o email do comprador (um por participante). */
export async function sendTicketsEmail(m: TicketMail): Promise<void> {
  const link = publicUrl(`/compra/${m.orderCode}`);
  const when = formatRange(m.startsAt, m.endsAt);
  const subject = `Seus ingressos: ${m.eventName}`;
  const text = `Olá, ${m.buyerName}!\n\nSua compra para ${m.eventName} está confirmada.\nQuando: ${when}\nOnde: ${m.place}\n\nParticipantes:\n${m.tickets.map((t) => `- ${t.name}`).join("\n")}\n\nCada pessoa apresenta o próprio QR code na entrada. Veja todos em: ${link}\n`;
  const attachments = await Promise.all(m.tickets.map(async (t, i) => ({
    filename: `ingresso-${i + 1}.png`, cid: `qr${i}`, content: await QRCode.toBuffer(qrPayload(t.code), { margin: 2, width: 320 }),
  })));
  const html = layout(`<p>Olá, ${esc(m.buyerName)}!</p><p>Sua compra para <strong>${esc(m.eventName)}</strong> está confirmada.</p>
<p>Quando: ${esc(when)}<br>Onde: ${esc(m.place)}</p><p>Cada pessoa apresenta o próprio QR code na entrada:</p>
${m.tickets.map((t, i) => `<div style="border:1px solid #dcdcd6;border-radius:12px;padding:12px;margin:0 0 12px;text-align:center"><p style="margin:0 0 8px"><strong>${esc(t.name)}</strong></p><img src="cid:qr${i}" alt="QR code de ${esc(t.name)}" width="200" height="200"></div>`).join("")}
<p><a href="${link}">Abrir meus ingressos</a></p>`);
  await send(m.buyerEmail, subject, text, html, attachments);
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
