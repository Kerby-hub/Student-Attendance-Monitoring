import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Leaflet must only run in the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let L: any = null;

async function loadLeaflet() {
  if (L) return L;
  const mod = await import("leaflet");
  await import("leaflet/dist/leaflet.css");
  L = mod.default ?? mod;
  // Fix default marker icon paths under bundlers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
  return L;
}

export type MapPickerProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialLat?: number;
  initialLng?: number;
  radiusMeters?: number;
  onApply: (lat: number, lng: number) => void;
};

export function MapPicker({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  radiusMeters = 100,
  onApply,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null);

  const startLat = useMemo(
    () =>
      typeof initialLat === "number" && !Number.isNaN(initialLat) && initialLat !== 0
        ? initialLat
        : 14.5995, // Manila fallback
    [initialLat],
  );
  const startLng = useMemo(
    () =>
      typeof initialLng === "number" && !Number.isNaN(initialLng) && initialLng !== 0
        ? initialLng
        : 120.9842,
    [initialLng],
  );
  const hasInitial =
    typeof initialLat === "number" &&
    typeof initialLng === "number" &&
    !(initialLat === 0 && initialLng === 0);

  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(
    hasInitial ? { lat: startLat, lng: startLng } : null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Init / teardown map when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const Leaflet = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        // Wait a tick so the dialog has measured the container.
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled || !containerRef.current) return;

        const map = Leaflet.map(containerRef.current).setView(
          [startLat, startLng],
          hasInitial ? 16 : 5,
        );
        Leaflet.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          },
        ).addTo(map);

        mapRef.current = map;

        if (hasInitial) {
          placeMarker(startLat, startLng);
        }

        map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
          placeMarker(e.latlng.lat, e.latlng.lng);
        });

        // Make sure tiles render once dialog is visible.
        setTimeout(() => map.invalidateSize(), 100);
        setLoading(false);
      } catch (e) {
        setError((e as Error).message || "Failed to load map");
        setLoading(false);
      }
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
  }, [open]);

  // Update circle when radius changes
  useEffect(() => {
    if (circleRef.current && typeof radiusMeters === "number") {
      circleRef.current.setRadius(Math.max(1, radiusMeters));
    }
  }, [radiusMeters]);

  function placeMarker(lat: number, lng: number) {
    if (!mapRef.current || !L) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(
        mapRef.current,
      );
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLatLng();
        setSelected({ lat: p.lat, lng: p.lng });
        if (circleRef.current) circleRef.current.setLatLng(p);
      });
    }
    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng]);
    } else {
      circleRef.current = L.circle([lat, lng], {
        radius: Math.max(1, radiusMeters || 100),
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
      }).addTo(mapRef.current);
    }
    setSelected({ lat, lng });
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        placeMarker(latitude, longitude);
        if (mapRef.current) mapRef.current.setView([latitude, longitude], 17);
      },
      () => {
        toast.error("Location access is blocked", {
          description:
            "Please allow location permission or choose a location manually on the map.",
        });
      },
    );
  };

  const apply = () => {
    if (!selected) {
      toast.error("Pick a location on the map first");
      return;
    }
    onApply(selected.lat, selected.lng);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose location on map</DialogTitle>
          <DialogDescription>
            Click on the map to choose the geofence center. The blue circle
            previews the current radius.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[60vh] w-full overflow-hidden rounded-md border">
          <div ref={containerRef} className="absolute inset-0" />
          {loading ? (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
              Loading map…
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/80 p-4 text-center text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
            <Crosshair className="mr-1.5 h-4 w-4" /> Use my current location
          </Button>
          <div className="text-xs text-muted-foreground">
            {selected ? (
              <span className="font-mono">
                {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
              </span>
            ) : (
              <span>No location selected yet</span>
            )}
            {" · "}
            <span>Radius: {Math.max(1, radiusMeters || 0)} m</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!selected}>
            Use selected location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
