import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const PyreGame3D = lazy(() => import("@/components/PyreGame3D"));

export const Route = createFileRoute("/oyna")({
  head: () => ({
    meta: [
      { title: "Era of Pyre — Yeryüzü Yıkımı Prototipi" },
      {
        name: "description",
        content:
          "Era of Pyre oynanabilir prototipi: ejderhanı uçur, alev püskürt, steampunk köyleri ve zeplin filosunu küle çevir.",
      },
      { property: "og:title", content: "Era of Pyre — Oynanabilir Prototip" },
      {
        property: "og:description",
        content: "Kül vadisinde 360° uçuş, alev püskürtme ve yıkım kombosu odaklı mini oyun.",
      },
    ],
  }),
  component: Play,
});

function Play() {
  const fallback = (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background text-sm uppercase tracking-widest text-muted-foreground">
      Kül vadisi yükleniyor…
    </div>
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <PyreGame3D onStats={() => {}} />
        </Suspense>
      </ClientOnly>
      <Link
        to="/"
        className="absolute left-1/2 bottom-4 -translate-x-1/2 rounded-md border border-foreground/20 bg-background/40 px-3 py-1.5 text-[10px] uppercase tracking-widest text-foreground/70 backdrop-blur transition-colors hover:border-primary hover:text-primary"
      >
        GDD
      </Link>
    </div>
  );
}