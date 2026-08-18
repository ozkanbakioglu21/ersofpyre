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

  // GDD bağlantısı ana menüde duruyor: sabit alt-orta konumdayken telefonda
  // hem uçuş göstergesinin hem de başparmağın üstüne biniyordu.
  const gdd = (
    <Link
      to="/"
      className="inline-flex items-center justify-center rounded-md border border-foreground/25 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.2em] text-foreground/85 transition-colors hover:border-primary hover:text-primary"
    >
      GDD
    </Link>
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <PyreGame3D onStats={() => {}} menuExtra={gdd} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
