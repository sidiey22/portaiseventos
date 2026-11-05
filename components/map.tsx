import { Icon } from "./icons";

/** Mapa do local. Com a chave do Google, mostra o mapa; sem ela, só o botão "Como chegar". */
export function PlaceMap({ lat, lng, name }: { lat: number | null; lng: number | null; name: string }) {
  if (lat == null || lng == null) return null;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const dest = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    <>
      {key && (
        <div className="map">
          <iframe title={`Mapa: ${name}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${dest}&zoom=16`} />
        </div>
      )}
      <p style={{ marginTop: 12 }}>
        <a className="btn sec" href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noopener"><Icon name="nav" /> Como chegar</a>
      </p>
    </>
  );
}
