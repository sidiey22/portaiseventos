import { bannerUrl } from "@/lib/events";
import { bannerSvg } from "@/lib/banner-art";
import type { EventRow } from "@/lib/types";

export function Art({ event }: { event: EventRow }) {
  const url = bannerUrl(event.banner_path);
  if (url) return <div className="art">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={`Banner do evento ${event.name}`} /></div>;
  return <div className="art" dangerouslySetInnerHTML={{ __html: bannerSvg(event) }} />;
}
