import QRCode from "qrcode";
import nodemailer from "nodemailer";
import { formatDateTime } from "./time.ts";

/** O QR code carrega só o código da inscrição, com prefixo para o leitor reconhecer. */
export const QR_PREFIX = "PE-";

export function qrPayload(code: string): string {
  return `${QR_PREFIX}${code}`;
}

export async function qrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(qrPayload(code), { margin: 2, width: 320, errorCorrectionLevel: "M" });
}

export function publicUrl(path: string): string {
  const base = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

type Ticket = { name: string; email: string; code: string; eventName: string; startsAt: string; location: string };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Envia o ingresso por email. Sem SMTP_URL configurado, registra no log (modo desenvolvimento). */
export async function sendTicketEmail(ticket: Ticket): Promise<void> {
  const link = publicUrl(`/ingresso/${ticket.code}`);
  const when = formatDateTime(ticket.startsAt);
  const subject = `Seu ingresso: ${ticket.eventName}`;
  const text = `Olá, ${ticket.name}!\n\nSua inscrição em ${ticket.eventName} está confirmada.\nQuando: ${when}\nOnde: ${ticket.location}\n\nApresente o QR code na entrada: ${link}\n`;

  if (!process.env.SMTP_URL) {
    console.log(`[email simulado] para ${ticket.email} | ${subject}\n${text}`);
    return;
  }

  const png = await QRCode.toBuffer(qrPayload(ticket.code), { margin: 2, width: 320 });
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "Portais Eventos <no-reply@localhost>",
    to: ticket.email,
    subject,
    text,
    html: `<p>Olá, ${escapeHtml(ticket.name)}!</p>
<p>Sua inscrição em <strong>${escapeHtml(ticket.eventName)}</strong> está confirmada.</p>
<p>Quando: ${escapeHtml(when)}<br>Onde: ${escapeHtml(ticket.location)}</p>
<p>Apresente este QR code na entrada:</p>
<p><img src="cid:qr" alt="QR code do ingresso" width="240" height="240"></p>
<p><a href="${link}">Abrir meu ingresso</a></p>`,
    attachments: [{ filename: "ingresso.png", content: png, cid: "qr" }],
  });
}
