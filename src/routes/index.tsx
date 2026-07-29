import { createFileRoute } from "@tanstack/react-router";

import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowDesk — Gestão de Projetos e Demandas" },
      { name: "description", content: "Sistema completo de gerenciamento de clientes, projetos e demandas. Substitua o Monday.com." },
      { property: "og:title", content: "FlowDesk — Gestão de Projetos e Demandas" },
      { property: "og:description", content: "Dashboard, Kanban, Calendário, Timeline, Relatórios e mais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/system/index.html");
  }, []);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#f5f7fb", color: "#1a2036" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>FlowDesk</h1>
        <p style={{ color: "#5b6480" }}>Carregando o sistema...</p>
        <a href="/system/index.html" style={{ color: "#6366f1", fontWeight: 600 }}>Abrir manualmente</a>
      </div>
    </div>
  );
}
