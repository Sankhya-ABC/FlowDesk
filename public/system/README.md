# FlowDesk — Sistema de Gestão de Projetos e Demandas

Sistema completo em **HTML5, CSS3 e JavaScript puro (Vanilla JS)**, sem frameworks. Inspirado em Monday, ClickUp, Linear, Notion, Jira e Asana. Substitui o Monday.com para gestão de clientes, projetos e demandas.

## Estrutura

```
system/
├── index.html      # Marcação principal e layout do app
├── style.css       # Design system + componentes + responsividade + tema escuro
├── utils.js        # Funções utilitárias (datas, CSV, PDF, storage, constantes)
├── data.js         # Dados de exemplo (20 clientes, 50 projetos, 250 demandas) + Store
├── components.js   # Componentes reutilizáveis (modal, toast, drawer, forms, pills)
├── script.js       # Controlador do app: rotas, views, kanban, calendário, gráficos
└── README.md       # Este arquivo
```

## Como usar

Abra `index.html` no navegador. Nenhuma build é necessária. Os dados são
persistidos em `localStorage` sob a chave `flowdesk_db_v1`.

## Funcionalidades

- **Dashboard** com 8 KPIs, 4 gráficos Chart.js (pizza, barras, linha) + timeline.
- **Clientes / Projetos / Demandas**: CRUD completo com pesquisa, filtros e ordenação.
- **Kanban** com drag-and-drop atualizando status automaticamente.
- **Calendário mensal** com prazos e entregas.
- **Timeline (Gantt)** dos projetos.
- **Equipe** com carga de trabalho.
- **Relatórios** exportáveis em CSV e PDF.
- **Configurações**: tema claro/escuro, reset e backup JSON.
- **Modais** para criar/editar, **confirmação** para excluir.
- **Toasts**, **skeletons**, **loading** e **notificações**.
- **Exportar CSV / PDF** e **Importar CSV**.
- Design premium responsivo (desktop, notebook, tablet, celular).

## Preparado para banco de dados

O objeto `Store` em `data.js` isola a camada de dados. Para plugar Firebase,
Supabase ou MySQL basta substituir `load`, `save`, `upsert` e `remove` por
chamadas assíncronas ao backend — o restante do app já consome via `Store.*()`.

```js
// Exemplo (Supabase):
Store.upsert = async (col, row) => {
  await supabase.from(col).upsert(row);
  Store.state[col] = (await supabase.from(col).select('*')).data;
};
```

## Tecnologias

- HTML5, CSS3 (custom properties, grid, flex), Vanilla JS (ES2020+).
- [Chart.js](https://www.chartjs.org/) via CDN.
- [Font Awesome 6](https://fontawesome.com/) via CDN.
- Google Fonts — Inter.

## Atalhos

- Botão **Nova Demanda** no topbar cria demandas de qualquer tela.
- Campo de pesquisa global filtra demandas ao digitar.
- `Esc` fecha modais.

---

© FlowDesk — construído para você substituir o Monday sem custo por usuário.