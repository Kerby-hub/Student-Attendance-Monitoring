import { useEffect, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let L: any = null;

async function loadLeaflet() {
  if (L) return L;
  const mod = await import("leaflet");
  await import("leaflet/dist/leaflet.css");
  L = mod.default ?? mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
  return L;
}

/**
 * Read-only mini map preview centered on a pinned coordinate with an
 * optional radius circle. Auto-recenters and re-zooms when props change.
 */
export function MapPreview({
  lat,
  lng,
  radiusMeters = 100,
  className,
}: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Leaflet = await loadLeaflet();
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = Leaflet.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([lat, lng], 17);
      Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      markerRef.current = Leaflet.marker([lat, lng]).addTo(map);
      circleRef.current = Leaflet.circle([lat, lng], {
        radius: Math.max(1, radiusMeters),
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
      }).addTo(map);
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker/circle/center when coords/radius change
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    circleRef.current.setLatLng([lat, lng]);
    circleRef.current.setRadius(Math.max(1, radiusMeters));
    mapRef.current.setView([lat, lng], 17, { animate: true });
    setTimeout(() => mapRef.current?.invalidateSize(), 30);
  }, [lat, lng, radiusMeters]);

  return <div ref={containerRef} className={className ?? "h-40 w-full rounded-md border"} />;
}
