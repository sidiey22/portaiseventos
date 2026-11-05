"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

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

/** Busca o endereço e ajusta o PIN no mapa do Google. Sem chave, mostra campos de latitude e longitude. */
export function PlacePicker({ mapsKey, initial }: { mapsKey?: string; initial: { name: string; address: string; lat: number | null; lng: number | null } }) {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [lat, setLat] = useState<number | null>(initial.lat);
  const [lng, setLng] = useState<number | null>(initial.lng);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ address: string; lat: number; lng: number }[]>([]);
  const [msg, setMsg] = useState("");
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null), marker = useRef<any>(null);

  useEffect(() => {
    if (!mapsKey || !mapEl.current) return;
    loadMaps(mapsKey).then(() => {
      const g = window.google;
      const center = { lat: initial.lat ?? -19.9321, lng: initial.lng ?? -44.0539 };
      map.current = new g.maps.Map(mapEl.current, { center, zoom: initial.lat != null ? 16 : 12, streetViewControl: false, mapTypeControl: false });
      marker.current = new g.maps.Marker({ position: center, map: map.current, draggable: true });
      const move = (p: any) => { setLat(Number(p.lat().toFixed(6))); setLng(Number(p.lng().toFixed(6))); marker.current.setPosition(p); };
      marker.current.addListener("dragend", (ev: any) => move(ev.latLng));
      map.current.addListener("click", (ev: any) => move(ev.latLng));
    }).catch(() => setMsg("Não foi possível carregar o mapa. Confira a chave do Google."));
  }, [mapsKey, initial.lat, initial.lng]);

  const search = () => {
    if (!window.google?.maps || !query.trim()) return;
    new window.google.maps.Geocoder().geocode({ address: query, region: "br" }, (res: any[], status: string) => {
      if (status !== "OK" || !res?.length) { setResults([]); setMsg("Nenhum endereço encontrado. Tente com rua, número e cidade."); return; }
      setMsg("");
      setResults(res.slice(0, 5).map((r) => ({ address: r.formatted_address, lat: r.geometry.location.lat(), lng: r.geometry.location.lng() })));
    });
  };
  const pick = (r: { address: string; lat: number; lng: number }) => {
    setAddress(r.address); setLat(Number(r.lat.toFixed(6))); setLng(Number(r.lng.toFixed(6))); setResults([]); setQuery("");
    const p = { lat: r.lat, lng: r.lng };
    map.current?.setCenter(p); map.current?.setZoom(17); marker.current?.setPosition(p);
  };

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
      {msg && <p className="small err">{msg}</p>}
      <div className="row">
        <label htmlFor="e-pname">Nome do local<input id="e-pname" name="placeName" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label htmlFor="e-paddr">Endereço completo<input id="e-paddr" name="placeAddress" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      </div>
      {mapsKey ? <div className="map edit" ref={mapEl} style={{ background: "var(--surface-2)" }} /> : null}
      <div className="row">
        <label htmlFor="e-lat">Latitude<input id="e-lat" name="lat" inputMode="decimal" value={lat ?? ""} onChange={(e) => setLat(e.target.value === "" ? null : Number(e.target.value))} readOnly={Boolean(mapsKey)} /></label>
        <label htmlFor="e-lng">Longitude<input id="e-lng" name="lng" inputMode="decimal" value={lng ?? ""} onChange={(e) => setLng(e.target.value === "" ? null : Number(e.target.value))} readOnly={Boolean(mapsKey)} /></label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{mapsKey ? "Clique no mapa ou arraste o PIN para ajustar." : "Sem a chave do Google, informe a latitude e a longitude (no Google Maps, clique com o botão direito no local para copiar)."}</p>
    </div>
  );
}
