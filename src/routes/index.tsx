import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { KrishnaEngine } from "@/lib/drawing-engine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Krishna — Neon Particle Artwork" },
      {
        name: "description",
        content:
          "A cinematic particle animation where Lord Krishna forms from thousands of glowing gold, white and violet neon particles.",
      },
      { property: "og:title", content: "Krishna — Neon Particle Artwork" },
      {
        property: "og:description",
        content:
          "Watch Lord Krishna draw himself from thousands of glowing neon particles in a dark, cinematic canvas animation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<KrishnaEngine | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new KrishnaEngine(canvasRef.current);
    engineRef.current = engine;
    engine.init("/images/krishna.png").then(() => setReady(true));
    return () => engine.destroy();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <h1 className="sr-only">Krishna neon particle artwork</h1>
      <canvas ref={canvasRef} className="block h-full w-full" />
      <button
        type="button"
        onClick={() => engineRef.current?.replay()}
        disabled={!ready}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/25 bg-amber-200/5 px-5 py-1.5 text-[11px] uppercase tracking-[0.3em] text-amber-200/70 backdrop-blur-sm transition hover:border-amber-200/50 hover:text-amber-100 disabled:opacity-30"
      >
        Replay
      </button>
    </main>
  );
}
