"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkInAction, type CheckinResult } from "./actions";

/** Leitor de QR code pela câmera do celular. */
export function Scanner({ eventId }: { eventId: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [camError, setCamError] = useState("");
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const router = useRouter();

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, raf = 0, stop = false;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = async () => {
          if (stop || !video.current || !ctx) return;
          const v = video.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (qr?.data && (qr.data !== last.current.code || now - last.current.at > 4000)) {
              last.current = { code: qr.data, at: now };
              const r = await checkInAction(eventId, qr.data);
              setResult(r);
              if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [60, 60, 60]);
              router.refresh();
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
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, eventId, router]);

  return (
    <div className="stack">
      {on ? <div className="scanner"><video ref={video} playsInline muted /><span className="frame" aria-hidden="true" /></div> : null}
      <div className="actions">
        <button type="button" className="btn" onClick={() => { setCamError(""); setOn(!on); }}>{on ? "Fechar câmera" : "Abrir câmera e ler QR code"}</button>
      </div>
      {camError && <p className="err">{camError}</p>}
      {result && <div className={result.ok ? "scan-ok" : "scan-bad"} role="status">{result.message}</div>}
    </div>
  );
}
