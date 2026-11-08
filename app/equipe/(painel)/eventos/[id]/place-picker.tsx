"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { parseCoordinateText, parseSingleCoordinate } from "@/lib/coords";
import { resolveMapsLinkAction } from "../actions";

declare global { interface Window { google?: any; __peMapsLoading?: Promise<void> } }

function loadMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (!window.__peMapsLoading) {
    window.__peMapsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=pt-BR&region=BR`;
      s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error("maps"));
      document.head.appendChild(s);
    });
  }
  return window.__peMapsLoading;
}

const fmt = (n: number) => String(Number(n.toFixed(6)));

/**
 * Local do evento: busca por endereço com PIN, ou coordenadas coladas do Google Maps.
 * Os campos de latitude e longitude são texto livre (aceitam colar, digitar e editar). Colar "lat, lng", graus ou um link
 * do Google Maps em qualquer um dos dois preenche os DOIS. O servidor confere tudo de novo ao salvar.
 */
export function PlacePicker({ mapsKey, initial }: { mapsKey?: string; initial: { name: string; address: string; lat: number | null; lng: number | null } }) {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [latText, setLatText] = useState(initial.lat != null ? fmt(initial.lat) : "");
  const [lngText, setLngText] = useState(initial.lng != null ? fmt(initial.lng) : "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ address: string; lat: number; lng: number }[]>([]);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState("");
  const [, setBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null), marker = useRef<any>(null);

  const la = latText.trim() ? parseSingleCoordinate(latText, "lat") : null;
  const ln = lngText.trim() ? parseSingleCoordinate(lngText, "lng") : null;
  const pos = la?.ok && ln?.ok ? { lat: la.value, lng: ln.value } : null;
  const incomplete = (Boolean(latText.trim()) !== Boolean(lngText.trim()));

  useEffect(() => {
    if (!mapsKey || !mapEl.current) return;
    loadMaps(mapsKey).then(() => {
      const g = window.google;
      const center = { lat: initial.lat ?? -19.9321, lng: initial.lng ?? -44.0539 };
      map.current = new g.maps.Map(mapEl.current, { center, zoom: initial.lat != null ? 16 : 12, streetViewControl: false, mapTypeControl: false });
      marker.current = new g.maps.Marker({ position: center, map: initial.lat != null ? map.current : null, draggable: true });
      const move = (p: any) => { setLatText(fmt(p.lat())); setLngText(fmt(p.lng())); setInfo(""); };
      marker.current.addListener("dragend", (ev: any) => move(ev.latLng));
      map.current.addListener("click", (ev: any) => move(ev.latLng));
    }).catch(() => setMsg("Não foi possível carregar o mapa. Confira a chave do Google."));
  }, [mapsKey, initial.lat, initial.lng]);

  // O PIN acompanha o que está nos campos (digitado, colado ou arrastado).
  useEffect(() => {
    if (!marker.current || !map.current) return;
    if (pos) { marker.current.setMap(map.current); marker.current.setPosition(pos); map.current.setCenter(pos); if ((map.current.getZoom?.() ?? 0) < 15) map.current.setZoom(16); }
    else marker.current.setMap(null);
  }, [pos?.lat, pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (lat: number, lng: number, note: string) => { setLatText(fmt(lat)); setLngText(fmt(lng)); setInfo(note); setMsg(""); };

  /** Trata o que foi colado (ou solto) num dos dois campos. Devolve true se já resolveu. */
  const handleText = (text: string): boolean => {
    const r = parseCoordinateText(text);
    if (r.ok) { apply(r.lat, r.lng, "Coordenadas preenchidas. Confira o PIN no mapa."); return true; }
    if (r.short) {
      setBusy(true); setMsg(""); setInfo("Buscando as coordenadas do link…");
      resolveMapsLinkAction(r.short).then((x) => {
        if (x.ok) apply(x.lat, x.lng, "Coordenadas do link preenchidas. Confira o PIN no mapa."); else { setInfo(""); setMsg(x.error); }
      }).catch(() => { setInfo(""); setMsg("Não foi possível abrir o link agora. Cole o endereço completo ou as coordenadas."); }).finally(() => setBusy(false));
      return true;
    }
    // Texto com dois números ou link que não deu certo: mostra o motivo, mas deixa colar como está para a pessoa corrigir.
    if ((text.match(/\d+(?:[.,]\d+)?/g) ?? []).length >= 2 || /https?:|google\.|°/.test(text)) { setMsg(r.error); setInfo(""); }
    return false;
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text && handleText(text)) e.preventDefault();
  };
  // Reserva para quando o texto entra sem evento de colar (arrastar e soltar, menu do celular).
  const onChange = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value, t = (e.nativeEvent as InputEvent).inputType ?? "";
    if (t !== "insertFromPaste") { setMsg(""); setInfo(""); } // o aviso do colar (onPaste) fica até a próxima digitação
    if (/^insert(FromPaste|FromDrop|ReplacementText)$/.test(t) && handleText(v)) return;
    set(v);
  };

  const search = () => {
    if (!window.google?.maps || !query.trim()) return;
    new window.google.maps.Geocoder().geocode({ address: query, region: "br" }, (res: any[], status: string) => {
      if (status !== "OK" || !res?.length) { setResults([]); setMsg("Nenhum endereço encontrado. Tente com rua, número e cidade."); return; }
      setMsg("");
      setResults(res.slice(0, 5).map((r) => ({ address: r.formatted_address, lat: r.geometry.location.lat(), lng: r.geometry.location.lng() })));
    });
  };
  const pick = (r: { address: string; lat: number; lng: number }) => {
    setAddress(r.address); apply(r.lat, r.lng, "Endereço encontrado. Confira o PIN no mapa."); setResults([]); setQuery("");
    map.current?.setZoom(17);
  };

  const latErr = la && !la.ok ? la.error : "", lngErr = ln && !ln.ok ? ln.error : "";
  return (
    <div className="stack">
      {mapsKey && (
        <div className="coupon-row">
          <label htmlFor="place-q" style={{ flex: 1 }}>Buscar endereço
            <input id="place-q" value={query} placeholder="Rua, número e cidade" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
          </label>
          <button type="button" className="btn sec" onClick={search}>Buscar</button>
        </div>
      )}
      {results.length > 0 && <ul className="sugg">{results.map((r) => <li key={r.address}><button type="button" onClick={() => pick(r)}><span>{r.address}</span></button></li>)}</ul>}
      <div className="row">
        <label htmlFor="e-pname">Nome do local<input id="e-pname" name="placeName" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label htmlFor="e-paddr">Endereço completo<input id="e-paddr" name="placeAddress" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <p className="small" style={{ margin: 0 }}><strong>Coordenadas do local</strong> <span className="muted">(opcional)</span></p>
        <p className="small muted" style={{ margin: 0 }}>No Google Maps, clique com o botão direito no local e depois nos números do topo do menu para copiar. Cole em qualquer um dos dois campos: os dois são preenchidos. Também aceita graus (19°55&apos;00&quot;S 43°56&apos;04&quot;W) e o link do Google Maps.</p>
        <div className="row">
          <label htmlFor="e-lat">Latitude<input id="e-lat" name="lat" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="-19.916681" value={latText} onPaste={onPaste} onChange={onChange(setLatText)} aria-invalid={Boolean(latErr)} aria-describedby="coord-msg" /></label>
          <label htmlFor="e-lng">Longitude<input id="e-lng" name="lng" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="-43.934493" value={lngText} onPaste={onPaste} onChange={onChange(setLngText)} aria-invalid={Boolean(lngErr)} aria-describedby="coord-msg" /></label>
        </div>
        <div id="coord-msg" aria-live="polite">
          {latErr && <p className="small err" role="alert" style={{ margin: 0 }}>Latitude: {latErr}</p>}
          {lngErr && <p className="small err" role="alert" style={{ margin: 0 }}>Longitude: {lngErr}</p>}
          {incomplete && !latErr && !lngErr && <p className="small err" style={{ margin: 0 }}>Falta {latText.trim() ? "a longitude" : "a latitude"}. Preencha as duas ou deixe as duas vazias.</p>}
          {msg && <p className="small err" role="alert" style={{ margin: 0 }}>{msg}</p>}
          {info && <p className="small" style={{ margin: 0, color: "var(--ok)" }}>{info}</p>}
        </div>
      </div>
      {mapsKey
        ? <div className="map edit" ref={mapEl} style={{ background: "var(--surface-2)" }} />
        : pos && (
          <div className="map edit">
            <iframe title="Prévia do local no mapa" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src={`https://www.google.com/maps?q=${pos.lat},${pos.lng}&z=16&output=embed`} />
          </div>
        )}
      {pos && <p className="small" style={{ margin: 0 }}><a href={`https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`} target="_blank" rel="noopener">Abrir este ponto no Google Maps</a> <span className="muted">para conferir se é o local certo.</span></p>}
      {mapsKey && <p className="small muted" style={{ margin: 0 }}>Também dá para clicar no mapa ou arrastar o PIN para ajustar.</p>}
    </div>
  );
}
