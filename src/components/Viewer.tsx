"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ViewerProps {
  documentId: string;
  versionId: string;
  pageCount: number;
  /** recipient: /api/view/page ; preview: /api/admin/preview/page?r=... */
  pageUrl: string;
  preview: boolean;
  heartbeatSeconds: number;
  idleSeconds: number;
  trackingEnabled: boolean;
  downloads: { watermarked?: string; original?: string };
  labels: Record<string, string>;
}

/**
 * Active-time signals (client side, can be lost/manipulated; documented as estimates):
 * - a beat every `heartbeatSeconds` while the tab is visible;
 * - `active` = user interaction (pointer/scroll/key/touch timestamps only — keys are NOT recorded)
 *   within `idleSeconds` AND the tab stayed visible since the previous beat;
 * - leaving/returning visibility sends non-crediting beats so hidden time is never counted;
 * - beats carry a sequence number; unsent beats are retried and de-duplicated server-side.
 */
export function Viewer(p: ViewerProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [vs, setVs] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const lastInteraction = useRef(0);
  const hiddenSinceBeat = useRef(false);
  const pending = useRef<object[]>([]);
  const pageRef = useRef(1);
  useEffect(() => { pageRef.current = page; }, [page]);

  // one "open" per viewer instance (effects can run twice in development; the promise is memoised)
  const opening = useRef<Promise<string> | null>(null);
  useEffect(() => {
    if (p.preview) return;
    if (!opening.current) {
      opening.current = fetch("/api/view/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: p.documentId, versionId: p.versionId }) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("open failed")))).then((j) => j.viewSessionId as string);
    }
    let cancelled = false;
    opening.current.then((id) => { if (!cancelled) setVs(id); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [p.documentId, p.versionId, p.preview]);

  const send = useCallback((visible: boolean, active: boolean, keepalive = false) => {
    if (!vs || !p.trackingEnabled) return;
    pending.current.push({ viewSessionId: vs, seq: seq.current++, visible, active, page: pageRef.current });
    const batch = pending.current.slice(-5);
    pending.current = [];
    for (const b of batch) {
      fetch("/api/view/heartbeat", { method: "POST", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
        .then((r) => { if (!r.ok && r.status >= 500) pending.current.push(b); })
        .catch(() => pending.current.push(b)); // retried with the same seq → idempotent
    }
  }, [vs, p.trackingEnabled]);

  useEffect(() => {
    if (p.preview || !vs || !p.trackingEnabled) return;
    lastInteraction.current = Date.now();
    const mark = () => { lastInteraction.current = Date.now(); };
    const evs = ["pointermove", "pointerdown", "wheel", "scroll", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const onVis = () => {
      if (document.visibilityState === "hidden") { hiddenSinceBeat.current = true; send(false, false, true); }
      else { lastInteraction.current = Date.now(); send(true, false); hiddenSinceBeat.current = false; }
    };
    document.addEventListener("visibilitychange", onVis);
    const onHide = () => send(document.visibilityState === "visible", false, true);
    window.addEventListener("pagehide", onHide);
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const active = !hiddenSinceBeat.current && Date.now() - lastInteraction.current < p.idleSeconds * 1000;
      hiddenSinceBeat.current = false;
      send(true, active);
    }, p.heartbeatSeconds * 1000);
    send(true, false); // baseline
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      clearInterval(iv);
    };
  }, [vs, p.preview, p.trackingEnabled, p.heartbeatSeconds, p.idleSeconds, send]);

  const go = (n: number) => setPage(Math.min(Math.max(1, n), p.pageCount));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(pageRef.current + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(pageRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ready = p.preview || vs;
  const src = ready ? `${p.pageUrl}${p.pageUrl.includes("?") ? "&" : "?"}d=${p.documentId}&v=${p.versionId}&p=${page}${vs ? `&vs=${vs}` : ""}` : null;
  const L = p.labels;
  return (
    <div ref={box} className="bg-white rounded-lg border border-line" data-testid="viewer">
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-line sticky top-0 bg-white z-10">
        <button className="btn btn-secondary btn-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label={L.prev}>‹ {L.prev}</button>
        <span className="text-sm" aria-live="polite">{L.page} <input aria-label={L.page} className="input inline w-14 py-0.5" type="number" min={1} max={p.pageCount} value={page} onChange={(e) => go(Number(e.target.value))} /> {L.of} {p.pageCount}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => go(page + 1)} disabled={page >= p.pageCount} aria-label={L.next}>{L.next} ›</button>
        <span className="mx-1 h-6 border-l border-line" />
        <button className="btn btn-secondary btn-sm" onClick={() => setZoom("fit")}>{L.fit}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => Math.max(50, (z === "fit" ? 100 : z) - 25))} aria-label={L.zoomOut}>−</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => Math.min(300, (z === "fit" ? 100 : z) + 25))} aria-label={L.zoomIn}>+</button>
        <button className="btn btn-secondary btn-sm" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())}>{L.fullscreen}</button>
        <span className="flex-1" />
        {p.downloads.watermarked && <a className="btn btn-sm" href={p.downloads.watermarked}>{L.downloadWm}</a>}
        {p.downloads.original && <a className="btn btn-secondary btn-sm" href={p.downloads.original}>{L.downloadOriginal}</a>}
      </div>
      <div className="overflow-auto bg-[#e9edf0] p-2 sm:p-4" style={{ maxHeight: "calc(100vh - 140px)" }}>
        {error && <p className="notice notice-danger">Not available</p>}
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={`${L.page} ${page}`} draggable={false} onContextMenu={(e) => e.preventDefault()}
            className="mx-auto shadow bg-white select-none" style={zoom === "fit" ? { width: "100%", maxWidth: 1100 } : { width: `${zoom * 8.5}px`, maxWidth: "none" }} />
        )}
      </div>
    </div>
  );
}
