import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Camera, Eraser, Loader2, MapPin, MapPinOff, RotateCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

/** Resize to 1600px and re-encode as JPEG before upload, so rooftop uploads stay small. */
async function compress(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}

type Upload = { id: string; kind: string; status: "uploading" | "done" | "error"; error?: string; gps: boolean; preview: string; file?: File };

/** Photo capture: GPS + timestamp attached to every photo, per-file progress and retry. */
export function PhotoCapture({ endpoint, kinds, onUploaded, existing }: {
  endpoint: string; kinds: { value: string; label: string }[]; onUploaded: () => void; existing: { id: number; kind: string; url: string; has_gps: boolean }[];
}) {
  const [kind, setKind] = useState(kinds[0].value);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = async (u: Upload) => {
    setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "uploading", error: undefined } : x)));
    try {
      const [blob, pos] = await Promise.all([compress(u.file!), getPosition()]);
      const fd = new FormData();
      fd.append("kind", u.kind);
      fd.append("file", blob, "photo.jpg");
      fd.append("taken_at", new Date().toISOString());
      if (pos) { fd.append("lat", String(pos.lat)); fd.append("lng", String(pos.lng)); }
      await api(endpoint, { form: fd, method: "POST" });
      setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "done", gps: !!pos } : x)));
      onUploaded();
    } catch (e) {
      setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "error", error: (e as ApiError).message } : x)));
    }
  };

  const onFiles = (files: FileList | null) => {
    Array.from(files ?? []).forEach((file) => {
      const u: Upload = { id: Math.random().toString(36).slice(2), kind, status: "uploading", gps: false, preview: URL.createObjectURL(file), file };
      setUploads((list) => [...list, u]);
      send(u);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const pending = uploads.filter((u) => u.status !== "done");
  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1.5 block text-sm font-medium">Photo of</span>
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        </label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <Button size="lg" variant="primary" onClick={() => fileRef.current?.click()}><Camera className="h-5 w-5" /> Take photo</Button>
      </div>
      <p className="mt-2 text-sm text-muted">Location and time are attached automatically. DISCOM rejects photos without them, so allow location access.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {existing.map((p) => (
          <figure key={p.id} className="overflow-hidden rounded-md border border-line">
            <img src={p.url} alt={p.kind} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            <figcaption className="flex items-center justify-between px-2 py-1.5 text-sm">
              <span>{kinds.find((k) => k.value === p.kind)?.label ?? p.kind}</span>
              {p.has_gps ? <span className="flex items-center gap-1 text-ok"><MapPin className="h-3.5 w-3.5" />GPS</span> : <span className="flex items-center gap-1 text-bad"><MapPinOff className="h-3.5 w-3.5" />No GPS</span>}
            </figcaption>
          </figure>
        ))}
        {pending.map((u) => (
          <figure key={u.id} className={cn("overflow-hidden rounded-md border", u.status === "error" ? "border-bad" : "border-line")}>
            <div className="relative">
              <img src={u.preview} alt="" className="aspect-[4/3] w-full object-cover opacity-60" />
              {u.status === "uploading" && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-ink" />}
            </div>
            <figcaption className="px-2 py-1.5 text-sm">
              {u.status === "error" ? <span className="flex items-center justify-between gap-2 text-bad"><span className="truncate">{u.error}</span>
                <button className="flex shrink-0 items-center gap-1 font-medium" onClick={() => send(u)}><RotateCw className="h-3.5 w-3.5" />Retry</button></span>
                : "Uploading"}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = canvas.current!;
    let lastWidth = 0;
    // Phones fire resize when the keyboard opens/closes or the screen rotates.
    // Keep the strokes and redraw them instead of wiping the customer's signature.
    const resize = () => {
      if (c.offsetWidth === lastWidth) return;
      lastWidth = c.offsetWidth;
      const strokes = pad.current?.toData() ?? [];
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      c.width = c.offsetWidth * ratio;
      c.height = c.offsetHeight * ratio;
      c.getContext("2d")!.scale(ratio, ratio);
      pad.current?.clear();
      if (strokes.length) {
        pad.current?.fromData(strokes);
        onChange(pad.current!.toDataURL("image/png"));
      }
    };
    pad.current = new SignaturePadLib(c, { penColor: "#151A25", backgroundColor: "rgba(255,255,255,0)" });
    pad.current.addEventListener("endStroke", () => { setEmpty(pad.current!.isEmpty()); onChange(pad.current!.toDataURL("image/png")); });
    resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); pad.current?.off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="relative overflow-hidden rounded-md border border-line-strong bg-white">
        <canvas ref={canvas} className="h-44 w-full touch-none" aria-label="Signature area" />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-base text-slate-400">Customer signs here</span>}
        <span className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-dashed border-slate-300" />
      </div>
      <Button className="mt-2" size="sm" variant="ghost" onClick={() => { pad.current?.clear(); setEmpty(true); onChange(null); }}><Eraser className="h-4 w-4" /> Clear</Button>
    </div>
  );
}
