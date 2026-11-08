"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { checkInAction, type CheckinResult, type CheckinStatus } from "./actions";

/** Cada resultado vira uma de três faixas: verde (entrou), amarelo (atenção) ou vermelho (não liberar). */
type Tone = "ok" | "warn" | "err";
const TONE: Record<CheckinStatus, Tone> = {
  ok: "ok", already: "warn", wrong_day: "warn", busy: "warn",
  wrong_event: "err", forbidden: "err", cancelled: "err", unpaid: "err", invalid: "err", error: "err",
};
/** Tempo na tela antes de voltar sozinho para a câmera. */
const SHOW_MS: Record<Tone, number> = { ok: 3000, warn: 5000, err: 5000 };
/** O mesmo QR lido de novo dentro desse tempo é ignorado (evita leitura dupla). */
const SAME_CODE_MS = 6000;
const HINT_AFTER_MS = 10_000;

/** Sons curtos feitos no próprio aparelho (sem arquivos). Cada tom tem um padrão diferente para dar para distinguir sem olhar. */
function beep(ctx: AudioContext | null, tone: Tone) {
  if (!ctx) return;
  try {
    const plan: [number, number, OscillatorType][] = tone === "ok" ? [[880, 0.12, "sine"], [1320, 0.16, "sine"]] : tone === "warn" ? [[440, 0.16, "triangle"], [440, 0.16, "triangle"]] : [[180, 0.55, "square"]];
    let t = ctx.currentTime + 0.01;
    for (const [freq, dur, type] of plan) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.08;
    }
  } catch { /* sem áudio: a tela e a vibração continuam avisando */ }
}
const VIBRATE: Record<Tone, number | number[]> = { ok: 90, warn: [120, 80, 120], err: [350, 100, 350] };

/** Leitor de QR code pela câmera do celular, com confirmação em tela cheia a cada leitura. */
export function Scanner({ eventId, initialToday }: { eventId: number; initialToday: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [today, setToday] = useState(initialToday);
  const [camError, setCamError] = useState("");
  const [hint, setHint] = useState(false);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const lastSeen = useRef(Date.now());
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => { setToday((n) => Math.max(n, initialToday)); }, [initialToday]);

  const dismiss = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setResult(null); }, []);
  const show = useCallback((r: CheckinResult) => {
    const tone = TONE[r.status];
    setResult(r);
    if (typeof r.today === "number") setToday(r.today);
    beep(audio.current, tone);
    try { navigator.vibrate?.(VIBRATE[tone]); } catch { /* aparelho sem vibração */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), SHOW_MS[tone]);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, raf = 0, stop = false, busy = false;
    lastSeen.current = Date.now(); setHint(false);
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
    const hintTimer = setInterval(() => setHint(Date.now() - lastSeen.current > HINT_AFTER_MS), 1000);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = async () => {
          if (stop || !video.current || !ctx) return;
          const v = video.current;
          if (!busy && v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (qr?.data) {
              lastSeen.current = now; setHint(false);
              if (qr.data !== last.current.code || now - last.current.at > SAME_CODE_MS) {
                last.current = { code: qr.data, at: now };
                busy = true;
                try { show(await checkInAction(eventId, qr.data)); }
                catch { show({ ok: false, status: "error", title: "Sem conexão com o servidor", message: "Confira a internet e leia de novo." }); }
                busy = false;
                router.refresh();
              }
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setCamError("Não foi possível abrir a câmera. Permita o acesso à câmera no navegador, ou use a busca por nome.");
        setOn(false);
      }
    })();
    return () => { stop = true; clearInterval(hintTimer); cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, eventId, router, show]);

  const toggle = () => {
    setCamError("");
    if (!on) { // o áudio só liga depois de um toque da pessoa; este é o toque
      try { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (AC) { audio.current ??= new AC(); void audio.current.resume(); } } catch { /* sem áudio */ }
    } else dismiss();
    setOn(!on);
  };

  const tone = result ? TONE[result.status] : null;
  return (
    <div className="stack">
      {on ? <div className="scanner"><video ref={video} playsInline muted /><span className="frame" aria-hidden="true" /></div> : null}
      <div className="actions">
        <button type="button" className="btn" onClick={toggle}>{on ? "Fechar câmera" : "Abrir câmera e ler QR code"}</button>
        <p className="today" aria-live="polite" style={{ margin: 0 }}><strong>{today}</strong> {today === 1 ? "check-in feito hoje" : "check-ins feitos hoje"}</p>
      </div>
      {on && hint && !result && <div className="notice" role="status">Não está lendo? Aproxime a câmera, peça para aumentar o brilho da tela do celular da pessoa ou use a busca por nome.</div>}
      {camError && <p className="err">{camError}</p>}
      {result && tone && (
        <div className={`scan-overlay ${tone}`} role="alert" aria-live="assertive" onClick={dismiss}>
          <div className="scan-card">
            <Icon name={tone === "ok" ? "check" : tone === "warn" ? "alert" : "xcircle"} />
            <p className="scan-title">{result.title}</p>
            {result.name && <p className="scan-name">{result.name}</p>}
            {result.status === "ok" || result.status === "already" ? null : <p className="scan-msg">{result.message}</p>}
            {result.eventName && <p className="scan-meta">{result.eventName}</p>}
            {result.status === "ok" && <p className="scan-meta">Dia {result.dayText} · {result.time}</p>}
            {result.status === "already" && <p className="scan-meta">{result.firstTime ? `Primeiro check-in hoje às ${result.firstTime}` : "Já registrado hoje"}</p>}
            <p className="scan-foot">{today} {today === 1 ? "check-in feito hoje" : "check-ins feitos hoje"} · toque para fechar</p>
          </div>
        </div>
      )}
    </div>
  );
}
