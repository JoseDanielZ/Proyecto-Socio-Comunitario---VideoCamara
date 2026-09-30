import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { Empty, ErrorNote, EventRow, LiveVideo, PageHeader } from "../components/ui";

export function CameraPage() {
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: api.cameras, refetchInterval: 5_000 });
  const events = useQuery({
    queryKey: ["vehicle-events", "latest"],
    queryFn: () => api.vehicleEvents({ limit: 12 }),
    refetchInterval: 5_000,
  });
  const camera = cameras.data?.[0];

  return (
    <div className="stack">
      <PageHeader title={camera?.name ?? "Cámara"} />
      <LiveVideo camera={camera} />
      <ErrorNote error={cameras.error} onRetry={() => void cameras.refetch()} />

      <section aria-labelledby="ultimos">
        <h2 id="ultimos" className="section-title">
          Últimos vehículos que cruzaron
        </h2>
        <ErrorNote error={events.error} onRetry={() => void events.refetch()} />
        {events.data && events.data.items.length === 0 && (
          <Empty title="Todavía no cruzó ningún vehículo" hint="Aparecerán aquí con su foto, tipo y color." />
        )}
        <ul className="list">
          {events.data?.items.map((event) => <EventRow key={event.id} event={event} />)}
        </ul>
      </section>
    </div>
  );
}
