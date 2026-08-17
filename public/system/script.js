/* ============ FlowDesk — App Controller ============ */

const App = {
  view: 'dashboard',
  filters: {
    demandas: { q:'', cliente:'', projeto:'', responsavel:'', equipe:'', status:'', prioridade:'', data:'' },
    projetos: { q:'', cliente:'', status:'', prioridade:'', responsavel:'' },
    clientes: { q:'' },
    timeline: { cliente:'' },
    kanban: { q:'', cliente:'', projeto:'', responsavel:'', equipe:'', prioridade:'' },
    calendario: { cliente:'', projeto:'', responsavel:'', prioridade:'' },
    cliente360: { cliente:'' }
  },
  cliente360Tab: 'visao',
  cliente360CalDate: new Date(),
  sort: { col:null, dir:1 },
  charts: {},

  // Cores de texto/grade dos gráficos conforme o tema ativo. Usado em todo lugar que
  // cria um Chart.js (Dashboard e Timeline), pra não depender só de Chart.defaults
  // (que é global e só era setado dentro de drawCharts, deixando outros gráficos
  // sem cor certa — ex.: labels ilegíveis no tema claro).
  chartTheme() {
    const dark = document.body.classList.contains('dark');
    const textColor = dark ? '#cbd5e1' : '#334155';
    const gridColor = dark ? '#1f2a4c' : '#c3cadb';
    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;
    return { dark, textColor, gridColor };
  },

  async init() {
    await Store.load();
    this.bindShell();
    this.applySidebarState();
    await this.loadCurrentUser();
    this.applyTheme();
    this.render();
    this.updateNotifBadge();
  },

  currentUser: null,         // objeto cru retornado por /api/auth/me
  currentUserPessoaId: null, // id correspondente em Store.equipe(), se houver match

  async loadCurrentUser() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return window.location.replace('/login.html');
      const user = await res.json();
      this.currentUser = user;
      $('#currentUserAvatar').textContent = initials(user.nome || '');
      $('#currentUserName').textContent = user.nome || '—';
      $('#currentUserRole').textContent = user.cargo || '—';

      // Tenta casar o usuário logado com um registro da equipe (por email, depois por nome)
      // para poder pré-selecionar "Criado por" ao abrir uma nova demanda.
      const equipe = Store.equipe();
      const match = equipe.find(p => p.email && user.email && p.email.toLowerCase() === user.email.toLowerCase())
        || equipe.find(p => p.nome && user.nome && p.nome.toLowerCase() === user.nome.toLowerCase());
      this.currentUserPessoaId = match ? match.id : null;
    } catch {
      // Sem rede: deixa seguir em modo offline (Store já cuida disso) sem forçar logout.
    }
  },

  bindShell() {
    $$('.nav-item').forEach(n => n.onclick = () => this.go(n.dataset.view));
    $('#quickAdd').onclick = () => this.openDemandaModal();
    $('#themeToggle').onclick = () => this.toggleTheme();
    $('#menuToggle').onclick = () => this.toggleSidebar();
    this.addSidebarCloseButton();
    $('#globalSearch').addEventListener('input', debounce(e => this.globalSearch(e.target.value), 200));
    $('#notifBtn').onclick = () => this.toggleNotifs();
    $('#logoutBtn').onclick = async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      window.location.href = '/login.html';
    };
  },

  addSidebarCloseButton() {
    const sidebar = $('#sidebar');
    if (!sidebar || sidebar.querySelector('#sidebarClose')) return;

    const button = document.createElement('button');
    button.id = 'sidebarClose';
    button.type = 'button';
    button.className = 'icon-btn sidebar-close';
    button.setAttribute('aria-label', 'Fechar menu lateral');
    button.setAttribute('title', 'Fechar menu');
    button.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    button.onclick = () => this.closeSidebar();
    sidebar.prepend(button);
  },

  toggleSidebar() {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) {
      $('#sidebar').classList.toggle('open');
    } else {
      const app = $('#app');
      const collapsed = app.classList.toggle('sidebar-collapsed');
      storage.set('flowdesk_sidebar_collapsed', collapsed);
    }
  },

  closeSidebar() {
    $('#sidebar').classList.remove('open');
  },

  applySidebarState() {
    if (window.matchMedia('(max-width: 900px)').matches) return;
    const collapsed = storage.get('flowdesk_sidebar_collapsed') === true;
    $('#app').classList.toggle('sidebar-collapsed', collapsed);
  },

  go(view) {
    this.view = view;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    this.closeSidebar();
    this.render();
  },

  // Abre a Área do Cliente já com a empresa selecionada (usado a partir da lista de Clientes)
  goCliente360(empresa, tab='visao') {
    this.filters.cliente360.cliente = empresa || '';
    this.cliente360Tab = tab;
    this.go('cliente360');
  },

  render() {
    const root = $('#view-root');
    root.innerHTML = '';
    const fn = this['render_' + this.view];
    if (fn) fn.call(this, root);
    else root.innerHTML = UI.emptyState('circle-question','Tela em construção.');
  },

  applyTheme() {
    const dark = storage.get('flowdesk_theme') === 'dark';
    document.body.classList.toggle('dark', dark);
    $('#themeToggle').innerHTML = `<i class="fa-solid fa-${dark?'sun':'moon'}"></i>`;
  },
  toggleTheme() {
    const dark = !document.body.classList.contains('dark');
    storage.set('flowdesk_theme', dark ? 'dark':'light');
    this.applyTheme();
    // Re-render current view to update charts
    this.render();
  },

  updateNotifBadge() {
    const n = Store.notificacoes().filter(x=>!x.lida).length;
    const b = $('#notifCount');
    b.textContent = n; b.style.display = n?'grid':'none';
  },
  toggleNotifs() {
    const panel = $('#notifPanel');
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    const list = Store.notificacoes();
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>Notificações</strong>
        <button class="btn btn-sm" id="markAll">Marcar lidas</button>
      </div>
      ${list.length? list.map(n=>`
        <div class="notif-item" data-id="${n.id}" style="cursor:pointer">
          <span class="dot" style="background:${n.lida?'var(--muted)':'var(--danger)'}"></span>
          <div>
            <div class="notif-title">${escapeHTML(n.titulo)}</div>
            <div class="notif-sub">${escapeHTML(n.sub||'')}</div>
          </div>
        </div>`).join('') : UI.emptyState('bell-slash','Sem notificações.')}`;
    panel.classList.remove('hidden');
    panel.querySelectorAll('.notif-item[data-id]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const n = Store.state.notificacoes.find(x=>x.id===el.dataset.id);
        if (!n || n.lida) return;
        n.lida = true;
        Store.save(); this.updateNotifBadge();
        el.querySelector('.dot').style.background = 'var(--muted)';
      };
    });
    $('#markAll') && ($('#markAll').onclick = () => {
      Store.state.notificacoes.forEach(n=>n.lida=true);
      Store.save(); this.updateNotifBadge(); this.toggleNotifs();
    });
    document.addEventListener('click', function h(e){
      if (!panel.contains(e.target) && e.target.id!=='notifBtn' && !e.target.closest('#notifBtn')) {
        panel.classList.add('hidden'); document.removeEventListener('click', h);
      }
    });
  },

  globalSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) return;
    // Route to demandas with query pre-filled
    this.filters.demandas.q = q;
    this.go('demandas');
  },

  openDashboardKpi(icon) {
    const configs = {
      users: { title:'Clientes cadastrados', type:'clientes', filter: () => true },
      'diagram-project': { title:'Projetos ativos', type:'projetos', filter: p => !['concluido','cancelado'].includes(p.status) },
      spinner: { title:'Demandas em andamento', type:'demandas', filter: d => !['concluido','cancelado'].includes(d.status) },
      check: { title:'Demandas concluidas', type:'demandas', filter: d => d.status === 'concluido' },
      'triangle-exclamation': { title:'Demandas atrasadas', type:'demandas', filter: isLate },
      'hourglass-half': { title:'Demandas com pendencias', type:'demandas', filter: d => ['backlog','analise','cliente'].includes(d.status) },
      clock: { title:'Demandas usadas no SLA medio', type:'demandas', filter: d => d.status === 'concluido' && d.prazo && d.criacao },
      'chart-line': { title:'Demandas concluidas', type:'demandas', filter: d => d.status === 'concluido' }
    };
    const config = configs[icon];
    if (!config) return;
    const sourceRecords = (config.type === 'clientes' ? Store.clientes() : config.type === 'projetos' ? Store.projetos() : Store.demandas()).filter(config.filter);
    const records = config.type === 'clientes'
      ? Object.values(sourceRecords.reduce((groups, client) => {
          const company = (client.empresa || client.nome || 'Cliente sem nome').trim();
          const key = company.toLocaleLowerCase();
          if (!groups[key]) groups[key] = { empresa: company, contatos: [] };
          if (client.nome && !groups[key].contatos.includes(client.nome)) groups[key].contatos.push(client.nome);
          return groups;
        }, {}))
      : sourceRecords;
    const body = records.length ? `<div class="dashboard-modal-list">${records.map(record => {
      if (config.type === 'clientes') {
        const contacts = record.contatos.length ? record.contatos.join(', ') : 'Sem contato cadastrado';
        return `<div class="dashboard-modal-item"><strong>${escapeHTML(record.empresa)}</strong><span>${escapeHTML(contacts)}</span></div>`;
      }
      if (config.type === 'projetos') {
        const cliente = Store.cliente(record.clienteId);
        return `<div class="dashboard-modal-item"><div><strong>${escapeHTML(record.nome)}</strong><span>${escapeHTML(cliente?.empresa || 'Sem cliente')} · Prazo: ${fmtDate(record.prazo)}</span></div>${UI.statusPill(record.status)}</div>`;
      }
      const cliente = Store.cliente(record.clienteId);
      const projeto = Store.projeto(record.projetoId);
      const responsavel = Store.pessoa(record.responsavelId);
      return `<div class="dashboard-modal-item"><div><strong>${escapeHTML(record.titulo)}</strong><span>${escapeHTML(cliente?.empresa || 'Sem cliente')} · ${escapeHTML(projeto?.nome || 'Sem projeto')} · ${escapeHTML(responsavel?.nome || 'Sem executante')} · Prazo: ${fmtDate(record.prazo)}</span></div>${UI.statusPill(isLate(record) ? 'atrasado' : record.status)}</div>`;
    }).join('')}</div>` : UI.emptyState('inbox','Nenhum item encontrado para este indicador.');
    UI.modal({ title: `${config.title} (${records.length})`, size:'lg', body, footer:'<button class="btn" data-close-modal>Fechar</button>', onOpen: (root, close) => {
      root.querySelector('[data-close-modal]').onclick = close;
    }});
  },

  /* ================== DASHBOARD ================== */
  render_dashboard(root) {
    const dems = Store.demandas();
    const clientes = Store.clientes();
    const projetos = Store.projetos();
    const emAndamento = dems.filter(d => !['concluido','cancelado'].includes(d.status)).length;
    const concluidas = dems.filter(d => d.status==='concluido').length;
    const atrasadas = dems.filter(isLate).length;
    const pendentes = dems.filter(d => ['backlog','analise','cliente'].includes(d.status)).length;
    const projAtivos = projetos.filter(p => !['concluido','cancelado'].includes(p.status)).length;
    const slaDias = (() => {
      const concl = dems.filter(d=>d.status==='concluido' && d.prazo && d.criacao);
      if (!concl.length) return 0;
      const total = concl.reduce((s,d)=> s + Math.max(0, daysBetween(d.criacao, d.prazo)), 0);
      return Math.round(total / concl.length);
    })();
    const produtividade = Math.round((concluidas / Math.max(1, dems.length)) * 100);

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <div class="page-subtitle">Visão geral em tempo real do seu portfólio de projetos.</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="btnExportPdf"><i class="fa-solid fa-file-pdf"></i> PDF</button>
          <button class="btn" id="btnExportCsv"><i class="fa-solid fa-file-csv"></i> CSV</button>
        </div>
      </div>

      <div class="kpi-grid">
        ${kpi('Clientes', clientes.length, 'users','#6366f1','Cadastrados')}
        ${kpi('Projetos ativos', projAtivos, 'diagram-project','#8b5cf6','de '+projetos.length)}
        ${kpi('Em andamento', emAndamento, 'spinner','#0ea5e9','Demandas')}
        ${kpi('Concluídas', concluidas, 'check','#10b981','Demandas')}
        ${kpi('Atrasadas', atrasadas, 'triangle-exclamation','#ef4444','Requerem ação')}
        ${kpi('Pendências', pendentes, 'hourglass-half','#f59e0b','Backlog + Análise + Cliente')}
        ${kpi('SLA médio', slaDias+' d', 'clock','#06b6d4','Prazo médio')}
        ${kpi('Produtividade', produtividade+'%','chart-line','#22c55e','Concluídas/Total')}
      </div>

      <div class="charts-grid">
        <div class="chart-card col-4"><h3>Por Status</h3><div class="chart-wrap"><canvas id="chartStatus"></canvas></div></div>
        <div class="chart-card col-4"><h3>Por Executante</h3><div class="chart-wrap"><canvas id="chartResp"></canvas></div></div>
        <div class="chart-card col-4"><h3>Por Cliente</h3><div class="chart-wrap"><canvas id="chartCli"></canvas></div></div>
        <div class="chart-card col-8"><h3>Evolução semanal</h3><div class="chart-wrap"><canvas id="chartLine"></canvas></div></div>
        <div class="chart-card col-4"><h3>Timeline de entregas (próx. 14 dias)</h3><div class="chart-wrap" style="height:260px;overflow:auto;" id="miniTimeline"></div></div>
      </div>
    `;

    $('#btnExportPdf').onclick = () => this.exportDashboardPDF();
    $('#btnExportCsv').onclick = () => this.exportDemandsCSV();
    $$('[data-dashboard-icon]').forEach(card => {
      const open = () => this.openDashboardKpi(card.dataset.dashboardIcon);
      card.onclick = open;
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      };
    });

    this.drawCharts();
    this.drawMiniTimeline();

    function kpi(label, value, icon, color, hint) {
      return `<div class="kpi kpi-clickable" data-dashboard-icon="${icon}" role="button" tabindex="0" title="Ver itens relacionados">
        <div class="kpi-head">
          <div class="kpi-label">${label}</div>
          <div class="kpi-icon" style="background:${color}"><i class="fa-solid fa-${icon}"></i></div>
        </div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-hint">${hint}</div>
      </div>`;
    }
  },

  drawCharts() {
    Object.values(this.charts).forEach(c => c && c.destroy && c.destroy());
    this.charts = {};
    const { textColor } = this.chartTheme();

    const dems = Store.demandas();

    // Pizza por status
    const statusCount = {};
    STATUS_ORDER.forEach(s => statusCount[s] = 0);
    dems.forEach(d => {
      const s = isLate(d) ? 'atrasado' : d.status;
      statusCount[s] = (statusCount[s]||0)+1;
    });
    this.charts.status = new Chart($('#chartStatus'), {
      type:'doughnut',
      data:{
        labels: STATUS_ORDER.map(s => STATUS[s].label),
        datasets:[{ data: STATUS_ORDER.map(s => statusCount[s]), backgroundColor: STATUS_ORDER.map(s => STATUS[s].color), borderWidth:0 }]
      },
      options:{ maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{size:10}}}}}
    });

    // Barras por responsável
    const respCount = {};
    dems.forEach(d => {
      const p = Store.pessoa(d.responsavelId);
      const n = p?.nome || 'Sem executante';
      respCount[n] = (respCount[n]||0)+1;
    });
    const respEntries = Object.entries(respCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const wrappedTickOpts = { ticks:{ autoSkip:false, font:{ size:10 } } };
    const wrappedBarOpts = { maxBarThickness:22, categoryPercentage:0.7, barPercentage:0.8 };
    this.charts.resp = new Chart($('#chartResp'), {
      type:'bar',
      data:{ labels: respEntries.map(e=>wrapLabel(e[0])), datasets:[{ label:'Demandas', data: respEntries.map(e=>e[1]), backgroundColor:'#6366f1', borderRadius:6, ...wrappedBarOpts }] },
      options:{ maintainAspectRatio:false, indexAxis:'y', scales:{ y: wrappedTickOpts }, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ title: items => (items[0]?.label instanceof Array ? items[0].label.join(' ') : items[0]?.label) } } } }
    });

    // Barras por cliente
    const cliCount = {};
    dems.forEach(d => {
      const c = Store.cliente(d.clienteId);
      const n = c?.empresa || 'Sem cliente';
      cliCount[n] = (cliCount[n]||0)+1;
    });
    const cliEntries = Object.entries(cliCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
    this.charts.cli = new Chart($('#chartCli'), {
      type:'bar',
      data:{ labels: cliEntries.map(e=>wrapLabel(e[0])), datasets:[{ label:'Demandas', data: cliEntries.map(e=>e[1]), backgroundColor:'#8b5cf6', borderRadius:6, ...wrappedBarOpts }] },
      options:{ maintainAspectRatio:false, indexAxis:'y', scales:{ y: wrappedTickOpts }, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ title: items => (items[0]?.label instanceof Array ? items[0].label.join(' ') : items[0]?.label) } } } }
    });

    // Linha "Evolução semanal" — mostra os ÚLTIMOS 7 DIAS (um ponto por dia, não por semana)
    const days = [];
    for (let i = 6; i >= 0; i--) {
      days.push(addDays(today(), -i));
    }
    const created = days.map(d => dems.filter(x => {
      if (!x.criacao) return false;
      return isoDay(x.criacao) === isoDay(d);
    }).length);
    const done = days.map(d => dems.filter(x => {
      if (x.status !== 'concluido' || !x.prazo) return false;
      return isoDay(x.prazo) === isoDay(d);
    }).length);
    this.charts.line = new Chart($('#chartLine'), {
      type:'line',
      data:{
        labels: days.map(d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})),
        datasets:[
          { label:'Criadas', data:created, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,.15)', fill:true, tension:.35 },
          { label:'Concluídas', data:done, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.15)', fill:true, tension:.35 },
        ]
      },
      options:{
        maintainAspectRatio:false,
        scales:{ y:{ ticks:{ precision:0 } } },
        plugins:{ legend:{ position:'bottom' }}
      }
    });
  },

  drawMiniTimeline() {
    const el = $('#miniTimeline');
    const limit = addDays(today(), 14);
    const items = Store.demandas()
      .filter(d => d.prazo && new Date(d.prazo) >= today() && new Date(d.prazo) <= limit)
      .sort((a,b)=> new Date(a.prazo)-new Date(b.prazo))
      .slice(0,20);
    if (!items.length) { el.innerHTML = UI.emptyState('calendar-check','Sem entregas próximas.'); return; }
    el.innerHTML = items.map(d => `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:center;">
        <div style="min-width:52px;font-size:11px;color:var(--text-2);font-weight:700">${fmtDate(d.prazo)}</div>
        <div style="flex:1;font-size:12px;">${escapeHTML(d.titulo)}</div>
        ${UI.statusPill(d.status)}
      </div>`).join('');
  },

  /* ================== CLIENTES ================== */
  render_clientes(root) {
    const f = this.filters.clientes;
    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Clientes</h1><div class="page-subtitle">Gerencie sua carteira de clientes.</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="btnImport"><i class="fa-solid fa-file-import"></i> Importar CSV</button>
          <button class="btn" id="btnCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
          <button class="btn btn-primary" id="btnNovo"><i class="fa-solid fa-plus"></i> Novo Cliente</button>
        </div>
      </div>
      <div class="toolbar">
        <input id="fq" placeholder="Pesquisar por nome, empresa, email..." value="${escapeHTML(f.q)}" style="min-width:280px;flex:1"/>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th data-sort="empresa">Empresa</th><th data-sort="nome">Contato</th>
          <th data-sort="email">Email</th><th data-sort="cidade">Cidade</th>
          <th>Projetos</th><th>Demandas</th><th style="width:140px"></th>
        </tr></thead><tbody id="tbody"></tbody>
      </table></div>`;

    const draw = () => {
      const list = Store.clientes().filter(c => {
        if (!f.q) return true;
        const q = f.q.toLowerCase();
        return [c.nome,c.empresa,c.email,c.cidade,c.telefone].some(v => (v||'').toLowerCase().includes(q));
      });
      if (this.sort.col) {
        this.applySort(list);
      } else {
        // Ordem padrão: empresa em ordem alfabética
        list.sort((a,b) => (a.empresa||'').localeCompare(b.empresa||'', 'pt-BR'));
      }
      const tb = $('#tbody');
      if (!list.length) { tb.innerHTML = `<tr><td colspan="7">${UI.emptyState('users','Nenhum cliente encontrado.')}</td></tr>`; return; }
      tb.innerHTML = list.map(c => {
        const projs = Store.projetos().filter(p=>p.clienteId===c.id).length;
        const dems = Store.demandas().filter(d=>d.clienteId===c.id).length;
        return `<tr>
          <td><strong class="link-like" data-a="open360" data-empresa="${escapeHTML(c.empresa)}" style="cursor:pointer">${escapeHTML(c.empresa)}</strong></td>
          <td>${escapeHTML(c.nome)}<div style="color:var(--text-2);font-size:11px">${escapeHTML(c.telefone||'')}</div></td>
          <td>${escapeHTML(c.email||'')}</td>
          <td>${escapeHTML(c.cidade||'')}</td>
          <td><span class="pill">${projs}</span></td>
          <td><span class="pill">${dems}</span></td>
          <td><div class="row-actions">
            <button data-a="open360" data-empresa="${escapeHTML(c.empresa)}" title="Abrir área do cliente"><i class="fa-solid fa-building"></i></button>
            <button data-a="edit" data-id="${c.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button class="del" data-a="del" data-id="${c.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('');
      tb.querySelectorAll('[data-a="open360"]').forEach(b => b.onclick = () => this.goCliente360(b.dataset.empresa));
      tb.querySelectorAll('[data-a="edit"]').forEach(b => b.onclick = () => this.openClienteModal(Store.cliente(b.dataset.id)));
      tb.querySelectorAll('[data-a="del"]').forEach(b => b.onclick = () => this.delCliente(b.dataset.id));
    };
    $('#fq').addEventListener('input', debounce(e => { f.q = e.target.value; draw(); }, 150));
    $('#btnNovo').onclick = () => this.openClienteModal();
    $('#btnCsv').onclick = () => this.exportClientesCSV();
    $('#btnImport').onclick = () => this.importCSV('clientes');
    $$('th[data-sort]').forEach(th => th.onclick = () => { this.toggleSort(th.dataset.sort); draw(); });
    draw();
  },

  openClienteModal(c=null) {
    UI.modal({
      title: c ? 'Editar Cliente' : 'Novo Cliente',
      body: UI.clienteForm(c||{}),
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveCli"><i class="fa-solid fa-check"></i> Salvar</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelector('#saveCli').onclick = () => {
          const data = UI.readForm(root.querySelector('#clienteForm'));
          if (!data.nome) return UI.toast('Nome obrigatório','warn');
          Store.upsert('clientes', { id: c?.id, ...data, createdAt: c?.createdAt || new Date().toISOString() });
          close(); UI.toast('Cliente salvo','success'); this.render();
        };
      }
    });
  },
  delCliente(id) {
    UI.confirm('Excluir cliente','Esta ação removerá o cliente. Deseja continuar?', () => {
      Store.remove('clientes', id); UI.toast('Cliente excluído','success'); this.render();
    });
  },

  /* ================== ÁREA DO CLIENTE (workspace estilo monday) ================== */
  render_cliente360(root) {
    const f = this.filters.cliente360;

    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c.id);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if (!f.cliente && empresasUnicas.length === 1) f.cliente = empresasUnicas[0];

    const cliOpts = ['<option value="">Selecione um cliente...</option>'].concat(
      empresasUnicas.map(emp => `<option value="${escapeHTML(emp)}" ${emp===f.cliente?'selected':''}>${escapeHTML(emp)}</option>`)
    ).join('');

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Área do Cliente</h1><div class="page-subtitle">Tudo o que é daquele cliente, em um só lugar.</div></div>
        <div class="toolbar" style="margin-bottom:0;">
          <i class="fa-solid fa-building" style="color:var(--text-2)"></i>
          <select id="clienteSelect" style="min-width:220px;font-weight:600;">${cliOpts}</select>
        </div>
      </div>
      <div id="c360Body"></div>`;

    // Re-renderiza só a Área do Cliente (sem sair pra outra rota), usado pelas
    // sub-telas embutidas (Demandas/Kanban/Calendário) no lugar de this.render().
    const rerenderC360 = () => this.render_cliente360(root);

    $('#clienteSelect').onchange = e => { f.cliente = e.target.value; rerenderC360(); };

    const body = $('#c360Body');
    if (!f.cliente) {
      body.innerHTML = UI.emptyState('building', 'Selecione um cliente acima para ver projetos, demandas, kanban e calendário dele.');
      return;
    }

    const clienteIds = empresaMap[f.cliente] || [];
    const projetos = Store.projetos().filter(p => clienteIds.includes(p.clienteId));
    const projetoIds = projetos.map(p=>p.id);
    const demandas = Store.demandas().filter(d => clienteIds.includes(d.clienteId) || projetoIds.includes(d.projetoId));
    const abertas = demandas.filter(d => !['concluido','cancelado'].includes(d.status));
    const atrasadas = demandas.filter(d => isLate(d));
    const concluidas = demandas.filter(d => d.status === 'concluido');

    const tabs = [
      { id:'visao', label:'Visão geral', icon:'chart-pie' },
      { id:'projetos', label:'Projetos', icon:'diagram-project', count: projetos.length },
      { id:'demandas', label:'Demandas', icon:'list-check', count: demandas.length },
      { id:'kanban', label:'Kanban', icon:'columns' },
      { id:'calendario', label:'Calendário', icon:'calendar-days' },
    ];
    if (!tabs.find(t=>t.id===this.cliente360Tab)) this.cliente360Tab = 'visao';

    body.innerHTML = `
      <div class="c360-tabs">
        ${tabs.map(t => `<button class="c360-tab ${this.cliente360Tab===t.id?'active':''}" data-tab="${t.id}">
          <i class="fa-solid fa-${t.icon}"></i> ${t.label} ${t.count!=null?`<span class="c360-tab-count">${t.count}</span>`:''}
        </button>`).join('')}
      </div>
      <div id="c360Pane"></div>`;

    body.querySelectorAll('.c360-tab').forEach(btn => btn.onclick = () => {
      this.cliente360Tab = btn.dataset.tab;
      rerenderC360();
    });

    const pane = $('#c360Pane');
    const contato = Store.cliente(clienteIds[0]);

    if (this.cliente360Tab === 'visao') {
      pane.innerHTML = `
        <div class="cards-grid">
          <div class="kpi-card"><div class="kpi-label">Projetos</div><div class="kpi-value">${projetos.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Demandas abertas</div><div class="kpi-value">${abertas.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Atrasadas</div><div class="kpi-value" style="color:var(--danger)">${atrasadas.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Concluídas</div><div class="kpi-value" style="color:var(--success)">${concluidas.length}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
          <div class="table-wrap" style="padding:16px;">
            <h3 style="margin:0 0 10px;font-size:14px;">Contatos</h3>
            ${clienteIds.map(id => Store.cliente(id)).filter(Boolean).map(c => `
              <div style="padding:8px 0;border-bottom:1px solid var(--border);">
                <strong>${escapeHTML(c.nome||'—')}</strong>
                <div style="font-size:12px;color:var(--text-2)">${escapeHTML(c.contato||'')} ${c.email?'· '+escapeHTML(c.email):''} ${c.telefone?'· '+escapeHTML(c.telefone):''}</div>
              </div>`).join('') || UI.emptyState('user','Sem contatos cadastrados.')}
          </div>
          <div class="table-wrap" style="padding:16px;">
            <h3 style="margin:0 0 10px;font-size:14px;">Próximos prazos</h3>
            ${demandas.filter(d=>d.prazo && !['concluido','cancelado'].includes(d.status)).sort((a,b)=>new Date(a.prazo)-new Date(b.prazo)).slice(0,6).map(d => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-open-dem="${d.id}">
                <span>${escapeHTML(d.titulo)}</span>
                ${UI.statusPill(isLate(d)?'atrasado':d.status)}
              </div>`).join('') || UI.emptyState('calendar-check','Nenhum prazo pendente.')}
          </div>
        </div>`;
      pane.querySelectorAll('[data-open-dem]').forEach(el => el.onclick = () => this.openDemandaDrawer(el.dataset.openDem));
      return;
    }

    if (this.cliente360Tab === 'projetos') {
      pane.innerHTML = `
        <div class="page-header" style="margin-bottom:10px;">
          <div></div>
          <button class="btn btn-primary btn-sm" id="c360NovoProj"><i class="fa-solid fa-plus"></i> Novo Projeto</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Projeto</th><th>Executante</th><th>Início</th><th>Prazo</th><th>Status</th><th>Prioridade</th><th>Demandas</th><th style="width:100px"></th></tr></thead>
          <tbody>${projetos.length ? projetos.map(p => {
            const r = Store.pessoa(p.responsavelId);
            const demsCount = Store.demandas().filter(d=>d.projetoId===p.id).length;
            return `<tr>
              <td><strong>${escapeHTML(p.nome)}</strong></td>
              <td>${escapeHTML(r?.nome||'—')}</td>
              <td>${fmtDate(p.inicio)}</td>
              <td>${fmtDate(p.prazo)}</td>
              <td>${UI.statusPill(p.status)}</td>
              <td>${UI.prioPill(p.prioridade)}</td>
              <td><span class="pill">${demsCount}</span></td>
              <td><div class="row-actions"><button data-a="edit" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button></div></td>
            </tr>`;
          }).join('') : `<tr><td colspan="8">${UI.emptyState('diagram-project','Nenhum projeto para este cliente ainda.')}</td></tr>`}</tbody>
        </table></div>`;
      pane.querySelectorAll('[data-a="edit"]').forEach(b => b.onclick = () => this.openProjetoModal(Store.projeto(b.dataset.id)));
      $('#c360NovoProj').onclick = () => {
        UI.modal({
          title: 'Novo Projeto', size:'lg',
          body: UI.projetoForm({ clienteId: clienteIds[0] }),
          footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="save"><i class="fa-solid fa-check"></i> Salvar</button>`,
          onOpen: (mroot, close) => {
            mroot.querySelector('[data-close-modal]').onclick = close;
            mroot.querySelector('#save').onclick = () => {
              const d = UI.readForm(mroot.querySelector('#projetoForm'));
              if (!d.nome || !d.clienteId) return UI.toast('Nome e cliente são obrigatórios','warn');
              Store.upsert('projetos', { ...d, equipeIds: [] });
              close(); UI.toast('Projeto salvo','success'); this.render();
            };
          }
        });
      };
      return;
    }

    if (this.cliente360Tab === 'demandas') {
      // Reaproveita a tela de Demandas, mas com um filtro isolado (não mexe no
      // this.filters.demandas global), pra não "vazar" o cliente selecionado aqui
      // pra quando o usuário for na tela de Demandas normal pelo menu.
      const backup = this.filters.demandas;
      this.filters.demandas = { ...backup, cliente: f.cliente };
      pane.innerHTML = `<div id="c360DemPane"></div>`;
      this.render_demandas($('#c360DemPane'), rerenderC360);
      this.filters.demandas = backup;
      return;
    }

    if (this.cliente360Tab === 'kanban') {
      if (!this.cliente360Filters) this.cliente360Filters = {};
      if (!this.cliente360Filters.kanban) this.cliente360Filters.kanban = { q:'', cliente:f.cliente, projeto:'', responsavel:'', equipe:'', prioridade:'' };
      const backup = this.filters.kanban;
      this.filters.kanban = this.cliente360Filters.kanban;
      pane.innerHTML = `<div id="c360KbPane"></div>`;
      this.render_kanban($('#c360KbPane'), rerenderC360);
      this.filters.kanban = backup;
      return;
    }

    if (this.cliente360Tab === 'calendario') {
      if (!this.cliente360Filters) this.cliente360Filters = {};
      if (!this.cliente360Filters.calendario) this.cliente360Filters.calendario = { cliente:f.cliente, projeto:'', responsavel:'', prioridade:'' };
      if (!this.cliente360CalDate) this.cliente360CalDate = new Date();
      const backupFilter = this.filters.calendario;
      const backupDate = this.calDate;
      this.filters.calendario = this.cliente360Filters.calendario;
      this.calDate = this.cliente360CalDate;
      pane.innerHTML = `<div id="c360CalPane"></div>`;
      // onChange (rerenderC360) só é chamado de forma assíncrona, depois de um clique
      // (prev/next/hoje/filtro). É nesse momento que precisamos gravar o this.calDate
      // atualizado de volta em cliente360CalDate — gravar isso logo em seguida, de
      // forma síncrona, salvava sempre a data antiga (a mudança do clique ainda nem
      // tinha acontecido), fazendo "Agosto" voltar sozinho a cada novo render.
      const onCalChange = () => {
        this.cliente360CalDate = this.calDate;
        rerenderC360();
      };
      this.render_calendario($('#c360CalPane'), onCalChange);
      this.filters.calendario = backupFilter;
      this.calDate = backupDate;
      return;
    }
  },

  /* ================== PROJETOS ================== */
  render_projetos(root) {
    const f = this.filters.projetos;

    // Agrupa clientes por empresa (nome exato), removendo duplicatas de empresa no dropdown
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c.id);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b,'pt-BR'));

    const cliOpts = ['<option value="">Todos os clientes</option>'].concat(
      empresasUnicas.map(emp => `<option value="${escapeHTML(emp)}" ${emp===f.cliente?'selected':''}>${escapeHTML(emp)}</option>`)
    ).join('');
    const stOpts = [
      '<option value="">Todos status</option>',
      `<option value="__ativos" ${f.status==='__ativos'?'selected':''}>Projetos ativos</option>`
    ].concat(STATUS_ORDER.filter(s=>s!=='atrasado').map(s=>`<option value="${s}" ${s===f.status?'selected':''}>${STATUS[s].label}</option>`)).join('');
    const prOpts = ['<option value="">Todas prioridades</option>'].concat(Object.keys(PRIORIDADE).map(p=>`<option value="${p}" ${p===f.prioridade?'selected':''}>${PRIORIDADE[p].label}</option>`)).join('');
    const respOptsList = Store.equipe().slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR'));
    const respOpts = ['<option value="">Todos executantes</option>'].concat(
      respOptsList.map(r=>`<option value="${r.id}" ${r.id===f.responsavel?'selected':''}>${escapeHTML(r.nome)}</option>`)
    ).join('');

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Projetos</h1><div class="page-subtitle">Todos os projetos em execução.</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="btnImport"><i class="fa-solid fa-file-import"></i> Importar</button>
          <button class="btn" id="btnCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
          <button class="btn btn-primary" id="btnNovo"><i class="fa-solid fa-plus"></i> Novo Projeto</button>
        </div>
      </div>
      <div class="toolbar">
        <input id="fq" placeholder="Pesquisar projetos..." value="${escapeHTML(f.q)}" style="min-width:240px;flex:1"/>
        <select id="fcli">${cliOpts}</select>
        <select id="fresp">${respOpts}</select>
        <select id="fst">${stOpts}</select>
        <select id="fpr">${prOpts}</select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th data-sort="nome">Projeto</th><th>Cliente</th><th>Executante</th>
          <th data-sort="inicio">Início</th><th data-sort="prazo">Prazo</th>
          <th>Status</th><th>Prioridade</th><th>Demandas</th><th style="width:140px"></th>
        </tr></thead><tbody id="tbody"></tbody>
      </table></div>`;

    const draw = () => {
      const clienteIdsSelecionados = f.cliente ? (empresaMap[f.cliente]||[]) : null;
      let list = Store.projetos().filter(p => {
        if (f.q && !(p.nome||'').toLowerCase().includes(f.q.toLowerCase())) return false;
        if (clienteIdsSelecionados && !clienteIdsSelecionados.includes(p.clienteId)) return false;
        if (f.responsavel && p.responsavelId !== f.responsavel) return false;
        if (f.status === '__ativos' && ['concluido','cancelado'].includes(p.status)) return false;
        if (f.status && f.status !== '__ativos' && p.status !== f.status) return false;
        if (f.prioridade && p.prioridade !== f.prioridade) return false;
        return true;
      });
      this.applySort(list);
      const tb = $('#tbody');
      if (!list.length) { tb.innerHTML = `<tr><td colspan="9">${UI.emptyState('diagram-project','Nenhum projeto encontrado.')}</td></tr>`; return; }
      tb.innerHTML = list.map(p => {
        const c = Store.cliente(p.clienteId); const r = Store.pessoa(p.responsavelId);
        const dems = Store.demandas().filter(d=>d.projetoId===p.id).length;
        return `<tr>
          <td><strong>${escapeHTML(p.nome)}</strong></td>
          <td>${escapeHTML(c?.empresa||'—')}</td>
          <td>${escapeHTML(r?.nome||'—')}</td>
          <td>${fmtDate(p.inicio)}</td>
          <td>${fmtDate(p.prazo)}</td>
          <td>${UI.statusPill(p.status)}</td>
          <td>${UI.prioPill(p.prioridade)}</td>
          <td><span class="pill">${dems}</span></td>
          <td><div class="row-actions">
            <button data-a="edit" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
            <button class="del" data-a="del" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('');
      tb.querySelectorAll('[data-a="edit"]').forEach(b => b.onclick = () => this.openProjetoModal(Store.projeto(b.dataset.id)));
      tb.querySelectorAll('[data-a="del"]').forEach(b => b.onclick = () => this.delProjeto(b.dataset.id));
    };
    $('#fq').addEventListener('input', debounce(e=>{ f.q = e.target.value; draw(); }, 150));
    $('#fcli').onchange = e => { f.cliente = e.target.value; draw(); };
    $('#fresp').onchange = e => { f.responsavel = e.target.value; draw(); };
    $('#fst').onchange = e => { f.status = e.target.value; draw(); };
    $('#fpr').onchange = e => { f.prioridade = e.target.value; draw(); };
    $('#btnNovo').onclick = () => this.openProjetoModal();
    $('#btnCsv').onclick = () => this.exportProjetosCSV();
    $('#btnImport').onclick = () => this.importCSV('projetos');
    $$('th[data-sort]').forEach(th => th.onclick = () => { this.toggleSort(th.dataset.sort); draw(); });
    draw();
  },
  openProjetoModal(p=null) {
    UI.modal({
      title: p ? 'Editar Projeto' : 'Novo Projeto', size:'lg',
      body: UI.projetoForm(p||{}),
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="save"><i class="fa-solid fa-check"></i> Salvar</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelector('#save').onclick = () => {
          const d = UI.readForm(root.querySelector('#projetoForm'));
          if (!d.nome || !d.clienteId) return UI.toast('Nome e cliente são obrigatórios','warn');
          Store.upsert('projetos', { id: p?.id, ...d, equipeIds: p?.equipeIds || [] });
          close(); UI.toast('Projeto salvo','success'); this.render();
        };
      }
    });
  },
  delProjeto(id) {
    UI.confirm('Excluir projeto','Todas as demandas vinculadas serão desvinculadas. Continuar?', () => {
      Store.state.demandas.forEach(d => { if (d.projetoId===id) d.projetoId=''; });
      Store.remove('projetos', id); Store.save();
      UI.toast('Projeto excluído','success'); this.render();
    });
  },

  /* ================== DEMANDAS ================== */
  render_demandas(root, onChange) {
    const doRender = onChange || (() => this.render());
    const f = this.filters.demandas;

    // Agrupa clientes por empresa (nome exato), removendo duplicatas de empresa no dropdown
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c.id);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const clienteIdsSelecionados = f.cliente ? (empresaMap[f.cliente]||[]) : null;

    const cliOpts = ['<option value="">Todos clientes</option>'].concat(
      empresasUnicas.map(emp => `<option value="${escapeHTML(emp)}" ${emp===f.cliente?'selected':''}>${escapeHTML(emp)}</option>`)
    ).join('');

    const projetosDisponiveis = (clienteIdsSelecionados
      ? Store.projetos().filter(p => clienteIdsSelecionados.includes(p.clienteId))
      : Store.projetos()
    ).slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR'));
    const projOpts = ['<option value="">Todos projetos</option>'].concat(
      projetosDisponiveis.map(p=>`<option value="${p.id}" ${p.id===f.projeto?'selected':''}>${escapeHTML(p.nome)}</option>`)
    ).join('');

    const respOpts = ['<option value="">Todos responsáveis</option>'].concat(
      Store.equipe().slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR')).map(e=>`<option value="${e.id}" ${e.id===f.responsavel?'selected':''}>${escapeHTML(e.nome)}</option>`)
    ).join('');
    const stOpts = [
      '<option value="">Todos status</option>',
      `<option value="__em_andamento" ${f.status==='__em_andamento'?'selected':''}>Em andamento</option>`,
      `<option value="atrasado" ${f.status==='atrasado'?'selected':''}>Atrasadas</option>`,
      `<option value="__pendencias" ${f.status==='__pendencias'?'selected':''}>Pendencias</option>`
    ].concat(STATUS_ORDER.filter(s=>s!=='atrasado').map(s=>`<option value="${s}" ${s===f.status?'selected':''}>${STATUS[s].label}</option>`)).join('');
    const prOpts = ['<option value="">Todas prioridades</option>'].concat(Object.keys(PRIORIDADE).map(p=>`<option value="${p}" ${p===f.prioridade?'selected':''}>${PRIORIDADE[p].label}</option>`)).join('');
    const eqOpts = ['<option value="">Todas equipes</option>'].concat(Object.keys(EQUIPE_AREA).map(k=>`<option value="${k}" ${k===f.equipe?'selected':''}>${EQUIPE_AREA[k].label}</option>`)).join('');

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Demandas</h1><div class="page-subtitle">Acompanhe todas as tarefas.</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="btnImport"><i class="fa-solid fa-file-import"></i> Importar</button>
          <button class="btn" id="btnCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
          <button class="btn btn-primary" id="btnNovo"><i class="fa-solid fa-plus"></i> Nova Demanda</button>
        </div>
      </div>
      <div class="toolbar">
        <input id="fq" placeholder="Pesquisar demandas..." value="${escapeHTML(f.q)}" style="min-width:220px;flex:1"/>
        <select id="fcli">${cliOpts}</select>
        <select id="fproj">${projOpts}</select>
        <select id="fresp">${respOpts}</select>
        <select id="feq">${eqOpts}</select>
        <select id="fst">${stOpts}</select>
        <select id="fpr">${prOpts}</select>
        <input type="date" id="fdata" value="${f.data||''}"/>
        <button class="btn btn-sm" id="fclear"><i class="fa-solid fa-eraser"></i></button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th data-sort="titulo">Título</th><th>Projeto</th><th>Cliente</th><th>Executante</th><th>Equipe</th>
          <th>Status</th><th>Prioridade</th><th data-sort="prazo">Prazo</th><th style="width:170px"></th>
        </tr></thead><tbody id="tbody"></tbody>
      </table></div>`;

    const draw = () => {
      let list = Store.demandas().filter(d => {
        if (f.q) {
          const q = f.q.toLowerCase();
          const cli = Store.cliente(d.clienteId), proj = Store.projeto(d.projetoId), resp = Store.pessoa(d.responsavelId);
          const hay = [d.titulo,d.descricao,cli?.empresa,proj?.nome,resp?.nome,d.status,(d.tags||[]).join(',')].map(v=>(v||'').toLowerCase()).join(' ');
          if (!hay.includes(q)) return false;
        }
        if (clienteIdsSelecionados && !clienteIdsSelecionados.includes(d.clienteId)) return false;
        if (f.projeto && d.projetoId !== f.projeto) return false;
        if (f.responsavel && d.responsavelId !== f.responsavel) return false;
        if (f.status) {
          if (f.status==='atrasado') { if (!isLate(d)) return false; }
          else if (f.status==='__em_andamento' && ['concluido','cancelado'].includes(d.status)) return false;
          else if (f.status==='__pendencias' && !['backlog','analise','cliente'].includes(d.status)) return false;
          else if (!['__em_andamento','__pendencias'].includes(f.status) && d.status !== f.status) return false;
        }
        if (f.equipe && d.equipeArea !== f.equipe) return false;
        if (f.prioridade && d.prioridade !== f.prioridade) return false;
        if (f.data && (!d.prazo || isoDay(d.prazo) !== f.data)) return false;
        return true;
      });
      this.applySort(list);
      const tb = $('#tbody');
      if (!list.length) { tb.innerHTML = `<tr><td colspan="9">${UI.emptyState('list-check','Nenhuma demanda encontrada.')}</td></tr>`; return; }
      tb.innerHTML = list.map(d => {
        const cli = Store.cliente(d.clienteId); const proj = Store.projeto(d.projetoId); const resp = Store.pessoa(d.responsavelId);
        const late = isLate(d);
        return `<tr>
          <td><strong style="cursor:pointer" data-a="open" data-id="${d.id}">${escapeHTML(d.titulo)}</strong>
            <div style="margin-top:4px;">${(d.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div></td>
          <td>${escapeHTML(proj?.nome||'—')}</td>
          <td>${escapeHTML(cli?.empresa||'—')}</td>
          <td>${escapeHTML(resp?.nome||'—')}</td>
          <td>${UI.equipeAreaPill(d.equipeArea)}</td>
          <td>${UI.statusPill(late?'atrasado':d.status)}</td>
          <td>${UI.prioPill(d.prioridade)}</td>
          <td>${fmtDate(d.prazo)}</td>
          <td><div class="row-actions">
            <button data-a="open" data-id="${d.id}" title="Detalhes"><i class="fa-solid fa-eye"></i></button>
            <button data-a="edit" data-id="${d.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button data-a="dup" data-id="${d.id}" title="Duplicar"><i class="fa-solid fa-copy"></i></button>
            <button class="del" data-a="del" data-id="${d.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('');
      tb.querySelectorAll('[data-a="open"]').forEach(b => b.onclick = () => this.openDemandaDrawer(b.dataset.id));
      tb.querySelectorAll('[data-a="edit"]').forEach(b => b.onclick = () => this.openDemandaModal(Store.demanda(b.dataset.id)));
      tb.querySelectorAll('[data-a="dup"]').forEach(b => b.onclick = () => this.dupDemanda(b.dataset.id));
      tb.querySelectorAll('[data-a="del"]').forEach(b => b.onclick = () => this.delDemanda(b.dataset.id));
    };
    $('#fq').addEventListener('input', debounce(e=>{ f.q = e.target.value; draw(); }, 150));
    $('#fcli').onchange = e => { f.cliente = e.target.value; f.projeto = ''; doRender(); };
    $('#fproj').onchange = e => {
      f.projeto = e.target.value;
      // Ao escolher um projeto, já vincula o filtro de Cliente à empresa daquele projeto.
      const proj = f.projeto ? Store.projeto(f.projeto) : null;
      const cli = proj?.clienteId ? Store.cliente(proj.clienteId) : null;
      f.cliente = cli ? (cli.empresa||'').trim() : f.cliente;
      doRender();
    };
    ['fresp','feq','fst','fpr'].forEach(id => $('#'+id).onchange = e => {
      const map = { fresp:'responsavel', feq:'equipe', fst:'status', fpr:'prioridade' };
      f[map[id]] = e.target.value; draw();
    });
    $('#fdata').onchange = e => { f.data = e.target.value; draw(); };
    $('#fclear').onclick = () => { this.filters.demandas = { q:'',cliente:'',projeto:'',responsavel:'',equipe:'',status:'',prioridade:'',data:'' }; doRender(); };
    $('#btnNovo').onclick = () => this.openDemandaModal();
    $('#btnImport').onclick = () => this.importCSV('demandas');
    $('#btnCsv').onclick = () => this.exportDemandsCSV();
    $$('th[data-sort]').forEach(th => th.onclick = () => { this.toggleSort(th.dataset.sort); draw(); });
    draw();
  },

  openDemandaModal(d=null) {
    UI.modal({
      title: d ? 'Editar Demanda' : 'Nova Demanda', size:'lg',
      body: UI.demandaForm(d||{}, { defaultCriadoPorId: this.currentUserPessoaId || '' }),
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="save"><i class="fa-solid fa-check"></i> Salvar</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;

        // Filtro cruzado Projeto <-> Cliente (Empresa):
        // - escolher um Projeto filtra/seleciona a Empresa dele automaticamente;
        // - escolher uma Empresa filtra a lista de Projetos para só os daquela empresa
        //   (e repopula o select de contato/Solicitante).
        const form = root.querySelector('#demandaForm');
        const empresaMap = JSON.parse(form.dataset.empresaMap || '{}');
        const projetoEmpresaMap = JSON.parse(form.dataset.projetoEmpresaMap || '{}');
        const projetoClienteMap = JSON.parse(form.dataset.projetoClienteMap || '{}');
        const empresaProjetosMap = JSON.parse(form.dataset.empresaProjetosMap || '{}');
        const todosProjetos = JSON.parse(form.dataset.todosProjetos || '[]');
        const empresaSelect = form.querySelector('[name="empresaSelecionada"]');
        const clienteSelect = form.querySelector('[name="clienteId"]');
        const projetoSelect = form.querySelector('[name="projetoId"]');

        const preencherContatos = (empresa, selecionado='') => {
          const contatos = empresaMap[empresa] || [];
          clienteSelect.innerHTML = ['<option value="">—</option>']
            .concat(contatos.map(c => `<option value="${c.id}" ${c.id===selecionado?'selected':''}>${escapeHTML(c.label)}</option>`))
            .join('');
        };
        const preencherProjetos = (empresa, selecionado='') => {
          const lista = empresa ? (empresaProjetosMap[empresa] || []) : todosProjetos;
          projetoSelect.innerHTML = ['<option value="">—</option>']
            .concat(lista.map(p => `<option value="${p.id}" ${p.id===selecionado?'selected':''}>${escapeHTML(p.label)}</option>`))
            .join('');
        };

        empresaSelect.onchange = () => {
          preencherContatos(empresaSelect.value);
          preencherProjetos(empresaSelect.value);
        };

        projetoSelect.onchange = () => {
          const empresaDoProjeto = projetoSelect.value ? (projetoEmpresaMap[projetoSelect.value] || '') : '';
          const clienteDoProjeto = projetoSelect.value ? (projetoClienteMap[projetoSelect.value] || '') : '';
          if (empresaDoProjeto) {
            empresaSelect.value = empresaDoProjeto;
            // Vincula direto o contato/cliente do projeto escolhido como Solicitante.
            preencherContatos(empresaDoProjeto, clienteDoProjeto);
            preencherProjetos(empresaDoProjeto, projetoSelect.value);
          }
          // Se o projeto escolhido não tem empresa associada, deixa a Empresa como está.
        };

        // Chips de tags: alterna seleção e sincroniza com o input hidden "tags"
        const tagsHidden = form.querySelector('input[name="tags"]');
        const tagPicker = form.querySelector('#tagPicker');
        tagPicker.querySelectorAll('.tag-chip').forEach(chip => {
          chip.onclick = () => {
            chip.classList.toggle('active');
            const selected = Array.from(tagPicker.querySelectorAll('.tag-chip.active')).map(c => c.dataset.tag);
            tagsHidden.value = selected.join(', ');
          };
        });

        root.querySelector('#save').onclick = () => {
          const data = UI.readForm(root.querySelector('#demandaForm'));
          if (!data.titulo) return UI.toast('Título obrigatório','warn');
          delete data.empresaSelecionada;
          if (!data.criadoPorId) data.criadoPorId = this.currentUserPessoaId || '';
          data.tags = (data.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
          data.tempoGasto = parseFloat(data.tempoGasto)||0;
          const record = {
            id: d?.id,
            ...data,
            checklist: d?.checklist || [],
            comentarios: d?.comentarios || [],
            arquivos: d?.arquivos || [],
            criacao: d?.criacao || new Date().toISOString(),
            historico: [...(d?.historico||[]), { tipo: d?'edicao':'criacao', data:new Date().toISOString(), texto: d?'Demanda editada':'Demanda criada' }]
          };
          Store.upsert('demandas', record);
          close(); UI.toast('Demanda salva','success'); this.render();
        };
      }
    });
  },
  dupDemanda(id) {
    const d = Store.demanda(id); if (!d) return;
    const copy = { ...structuredClone(d), id: uid('d'), titulo: d.titulo + ' (cópia)', criacao: new Date().toISOString() };
    Store.upsert('demandas', copy); UI.toast('Demanda duplicada','success'); this.render();
  },
  delDemanda(id) {
    UI.confirm('Excluir demanda','Esta ação não pode ser desfeita.', () => {
      Store.remove('demandas', id); UI.toast('Demanda excluída','success'); this.render();
    });
  },

  openDemandaDrawer(id, onVoltar=null) {
    const d = Store.demanda(id); if (!d) return;
    const cli = Store.cliente(d.clienteId), proj = Store.projeto(d.projetoId), resp = Store.pessoa(d.responsavelId);
    const criador = Store.pessoa(d.criadoPorId);
    const checklist = (d.checklist||[]).map(c => `
      <label class="checklist-item">
        <input type="checkbox" data-ck="${c.id}" ${c.done?'checked':''}/>
        <span style="flex:1;${c.done?'text-decoration:line-through;color:var(--muted)':''}">${escapeHTML(c.texto)}</span>
        ${c.doneEm ? `<span style="font-size:11px;color:var(--text-2);white-space:nowrap;" title="Marcado em ${fmtDate(c.doneEm)}"><i class="fa-regular fa-clock"></i> ${fmtDate(c.doneEm)}</span>` : ''}
      </label>`).join('') || '<div class="empty" style="padding:12px">Sem itens.</div>';
    const comments = (d.comentarios||[]).map(c => `
      <div class="comment"><span class="who">${escapeHTML(c.autor)}</span><span class="when">${fmtDate(c.data)}</span><div>${escapeHTML(c.texto)}</div></div>`).join('') || '<div class="empty" style="padding:12px">Sem comentários.</div>';
    const hist = (d.historico||[]).slice().reverse().map(h => `<div style="font-size:12px;color:var(--text-2);padding:4px 0;">• ${fmtDate(h.data)} — ${escapeHTML(h.texto)}</div>`).join('');

    UI.drawer({
      title: d.titulo,
      body: `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          ${UI.statusPill(isLate(d)?'atrasado':d.status)} ${UI.prioPill(d.prioridade)}
          ${(d.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:10px;">${escapeHTML(d.descricao||'')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
          <div><b>Projeto:</b> ${escapeHTML(proj?.nome||'—')}</div>
          <div><b>Cliente:</b> ${escapeHTML(cli?.empresa||'—')}</div>
          <div><b>Solicitante:</b> ${escapeHTML(cli?.contato || cli?.nome || '—')}</div>
          <div><b>Executante:</b> ${escapeHTML(resp?.nome||'—')}</div>
          <div><b>Criado por:</b> ${escapeHTML(criador?.nome||'—')}</div>
          <div><b>Equipe:</b> ${UI.equipeAreaPill(d.equipeArea)}</div>
          <div><b>Prazo:</b> ${fmtDate(d.prazo)}</div>
          <div><b>Criada:</b> ${fmtDate(d.criacao)}</div>
          <div><b>Tempo gasto:</b> ${d.tempoGasto||0}h</div>
        </div>
        <div class="section-title">Checklist</div>
        <div id="ck">${checklist}</div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input id="ckNew" placeholder="Adicionar item..." style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);"/>
          <button class="btn btn-sm btn-primary" id="ckAdd"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div class="section-title">Comentários</div>
        <div id="cm">${comments}</div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input id="cmNew" placeholder="Escrever comentário..." style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);"/>
          <button class="btn btn-sm btn-primary" id="cmAdd"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        <div class="section-title">Histórico</div>
        ${hist || '<div class="empty" style="padding:12px">Sem histórico.</div>'}
        <div style="display:flex;gap:6px;margin-top:20px;flex-wrap:wrap;">
          ${onVoltar ? '<button class="btn" id="btnVoltar"><i class="fa-solid fa-arrow-left"></i> Voltar</button>' : ''}
          <button class="btn" id="btnEdit"><i class="fa-solid fa-pen"></i> Editar</button>
          <button class="btn" id="btnDup"><i class="fa-solid fa-copy"></i> Duplicar</button>
          <button class="btn btn-danger" id="btnDel"><i class="fa-solid fa-trash"></i> Excluir</button>
        </div>`,
      onOpen: (root, close) => {
        root.querySelectorAll('[data-ck]').forEach(cb => cb.onchange = () => {
          const item = d.checklist.find(x=>x.id===cb.dataset.ck);
          if (item) {
            item.done = cb.checked;
            item.doneEm = cb.checked ? new Date().toISOString() : null;
            d.historico = d.historico || [];
            d.historico.push({ tipo:'checklist', data:new Date().toISOString(), texto:`Item do checklist ${cb.checked?'concluído':'reaberto'}: "${item.texto}"` });
            Store.save(); this.openDemandaDrawer(id, onVoltar);
          }
        });
        root.querySelector('#ckAdd').onclick = () => {
          const v = root.querySelector('#ckNew').value.trim(); if (!v) return;
          d.checklist = d.checklist || [];
          d.checklist.push({ id: uid('ck'), texto:v, done:false, doneEm:null });
          d.historico = d.historico || [];
          d.historico.push({ tipo:'checklist', data:new Date().toISOString(), texto:`Item adicionado ao checklist: "${v}"` });
          Store.save(); this.openDemandaDrawer(id, onVoltar);
        };
        root.querySelector('#cmAdd').onclick = () => {
          const v = root.querySelector('#cmNew').value.trim(); if (!v) return;
          d.comentarios = d.comentarios || [];
          d.comentarios.push({ id: uid('cm'), autor:'Você', texto:v, data:new Date().toISOString() });
          d.historico = d.historico || [];
          d.historico.push({ tipo:'comentario', data:new Date().toISOString(), texto:'Comentário adicionado' });
          Store.save(); this.openDemandaDrawer(id, onVoltar);
        };
        if (onVoltar) root.querySelector('#btnVoltar').onclick = () => { close(); onVoltar(); };
        root.querySelector('#btnEdit').onclick = () => { close(); this.openDemandaModal(d); };
        root.querySelector('#btnDup').onclick = () => { close(); this.dupDemanda(id); };
        root.querySelector('#btnDel').onclick = () => { close(); this.delDemanda(id); };
      }
    });
  },

  /* ================== KANBAN ================== */
  render_kanban(root, onChange) {
    const doRender = onChange || (() => this.render());
    const f = this.filters.kanban;
    const cols = STATUS_ORDER.filter(s => s !== 'atrasado');

    // Agrupa clientes por empresa (nome exato), removendo duplicatas de empresa no dropdown
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c.id);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const clienteIdsSelecionados = f.cliente ? (empresaMap[f.cliente]||[]) : null;

    const cliOpts = ['<option value="">Todos clientes</option>'].concat(
      empresasUnicas.map(emp => `<option value="${escapeHTML(emp)}" ${emp===f.cliente?'selected':''}>${escapeHTML(emp)}</option>`)
    ).join('');

    // Projetos: só mostra os do cliente selecionado (se houver), e em ordem alfabética
    const projetosDisponiveis = (clienteIdsSelecionados
      ? Store.projetos().filter(p => clienteIdsSelecionados.includes(p.clienteId))
      : Store.projetos()
    ).slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR'));
    const projOpts = ['<option value="">Todos projetos</option>'].concat(
      projetosDisponiveis.map(p=>`<option value="${p.id}" ${p.id===f.projeto?'selected':''}>${escapeHTML(p.nome)}</option>`)
    ).join('');

    const respOpts = ['<option value="">Todos responsáveis</option>'].concat(
      Store.equipe().slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR')).map(e=>`<option value="${e.id}" ${e.id===f.responsavel?'selected':''}>${escapeHTML(e.nome)}</option>`)
    ).join('');
    const prOpts = ['<option value="">Todas prioridades</option>'].concat(Object.keys(PRIORIDADE).map(p=>`<option value="${p}" ${p===f.prioridade?'selected':''}>${PRIORIDADE[p].label}</option>`)).join('');
    const eqOpts = ['<option value="">Todas equipes</option>'].concat(Object.keys(EQUIPE_AREA).map(k=>`<option value="${k}" ${k===f.equipe?'selected':''}>${EQUIPE_AREA[k].label}</option>`)).join('');

    const matches = (d) => {
      if (f.q) {
        const q = f.q.toLowerCase();
        const cli = Store.cliente(d.clienteId), proj = Store.projeto(d.projetoId), resp = Store.pessoa(d.responsavelId);
        const hay = [d.titulo,d.descricao,cli?.empresa,proj?.nome,resp?.nome,(d.tags||[]).join(',')].map(v=>(v||'').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (clienteIdsSelecionados && !clienteIdsSelecionados.includes(d.clienteId)) return false;
      if (f.projeto && d.projetoId !== f.projeto) return false;
      if (f.responsavel && d.responsavelId !== f.responsavel) return false;
      if (f.equipe && d.equipeArea !== f.equipe) return false;
      if (f.prioridade && d.prioridade !== f.prioridade) return false;
      return true;
    };

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Kanban</h1><div class="page-subtitle">Arraste os cartões para atualizar o status.</div></div>
        <button class="btn btn-primary" id="btnNovo"><i class="fa-solid fa-plus"></i> Nova Demanda</button>
      </div>
      <div class="toolbar">
        <input id="fq" placeholder="Pesquisar demandas..." value="${escapeHTML(f.q)}" style="min-width:220px;flex:1"/>
        <select id="fcli">${cliOpts}</select>
        <select id="fproj">${projOpts}</select>
        <select id="fresp">${respOpts}</select>
        <select id="feq">${eqOpts}</select>
        <select id="fpr">${prOpts}</select>
        <button class="btn btn-sm" id="fclear"><i class="fa-solid fa-eraser"></i></button>
      </div>
      <div class="kanban" id="kb">
        ${cols.map(s => {
          const list = Store.demandas().filter(d => d.status===s && matches(d));
          return `<div class="kanban-col" data-status="${s}">
            <div class="kanban-col-head">
              <h4><span class="dot" style="background:${STATUS[s].color};display:inline-block;margin-right:6px"></span>${STATUS[s].label}</h4>
              <span class="kanban-count">${list.length}</span>
            </div>
            <div class="kanban-list" data-status="${s}">
              ${list.map(d => cardHTML(d)).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    $('#btnNovo').onclick = () => this.openDemandaModal();
    $('#fq').addEventListener('input', debounce(e=>{ f.q = e.target.value; doRender(); }, 150));
    ['fcli','fproj','fresp','feq','fpr'].forEach(id => $('#'+id).onchange = e => {
      const map = { fcli:'cliente', fproj:'projeto', fresp:'responsavel', feq:'equipe', fpr:'prioridade' };
      f[map[id]] = e.target.value;
      if (id === 'fcli') f.projeto = ''; // troca de cliente reseta o projeto selecionado
      if (id === 'fproj') {
        // Ao escolher um projeto, já vincula o filtro de Cliente à empresa daquele projeto.
        const proj = f.projeto ? Store.projeto(f.projeto) : null;
        const cli = proj?.clienteId ? Store.cliente(proj.clienteId) : null;
        f.cliente = cli ? (cli.empresa||'').trim() : f.cliente;
      }
      doRender();
    });
    $('#fclear').onclick = () => { this.filters.kanban = { q:'',cliente:'',projeto:'',responsavel:'',equipe:'',prioridade:'' }; doRender(); };
    this.bindKanbanDrag(doRender);

    function cardHTML(d) {
      const resp = Store.pessoa(d.responsavelId);
      const cli = Store.cliente(d.clienteId);
      return `<div class="k-card" draggable="true" data-id="${d.id}">
        <div class="k-card-title">${escapeHTML(d.titulo)}</div>
        <div style="font-size:11px;color:var(--text-2);margin-bottom:6px">${escapeHTML(cli?.empresa||'')}</div>
        <div class="k-card-meta">
          <span>${UI.prioPill(d.prioridade)}</span>
          <span>${fmtDate(d.prazo)}</span>
        </div>
        ${d.equipeArea ? `<div style="margin-top:6px;">${UI.equipeAreaPill(d.equipeArea)}</div>` : ''}
        <div class="k-card-tags">${(d.tags||[]).map(t=>`<span class="k-tag">${escapeHTML(t)}</span>`).join('')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <div class="avatar" style="width:24px;height:24px;font-size:10px">${initials(resp?.nome||'?')}</div>
          <button class="icon-btn" style="width:26px;height:26px;" data-open="${d.id}"><i class="fa-solid fa-eye" style="font-size:11px"></i></button>
        </div>
      </div>`;
    }
  },
  bindKanbanDrag(onChange) {
    const doRender = onChange || (() => this.render());
    const kb = $('#kb'); if (!kb) return;
    this.stopKanbanAutoScroll();
    let dragId = null;
    const EDGE = 110;
    const MAX_SPEED = 24;
    const handleAutoScroll = e => {
      const rect = kb.getBoundingClientRect();
      if (e.clientY < rect.top || e.clientY > rect.bottom) {
        this.stopKanbanAutoScroll();
        return;
      }
      let direction = 0;
      let distance = 0;
      if (e.clientX < rect.left + EDGE) {
        direction = -1;
        distance = rect.left + EDGE - e.clientX;
      } else if (e.clientX > rect.right - EDGE) {
        direction = 1;
        distance = e.clientX - (rect.right - EDGE);
      }
      if (!direction) return this.stopKanbanAutoScroll();
      const speed = Math.min(MAX_SPEED, 5 + (distance / EDGE) * MAX_SPEED);
      this.startKanbanAutoScroll(kb, direction * speed);
    };
    const finishDrag = () => {
      kb.classList.remove('is-dragging');
      this.stopKanbanAutoScroll();
      document.removeEventListener('dragover', handleAutoScroll);
      document.removeEventListener('dragend', finishDrag, true);
    };
    kb.querySelectorAll('.k-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragId = card.dataset.id;
        card.classList.add('dragging');
        kb.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        document.addEventListener('dragover', handleAutoScroll);
        document.addEventListener('dragend', finishDrag, true);
      });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); finishDrag(); });
      card.querySelector('[data-open]')?.addEventListener('click', e => { e.stopPropagation(); this.openDemandaDrawer(card.dataset.id); });
    });
    kb.querySelectorAll('.kanban-list').forEach(list => {
      list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('drop-hover'); });
      list.addEventListener('dragleave', () => list.classList.remove('drop-hover'));
      list.addEventListener('drop', e => {
        e.preventDefault(); list.classList.remove('drop-hover');
        const d = Store.demanda(dragId); if (!d) return;
        const newStatus = list.dataset.status;
        if (d.status !== newStatus) {
          d.historico = d.historico || [];
          d.historico.push({ tipo:'status', data:new Date().toISOString(), texto:`Status alterado: ${STATUS[d.status].label} → ${STATUS[newStatus].label}` });
          d.status = newStatus;
          Store.upsert('demandas', d); UI.toast('Status atualizado','success');
          doRender();
        }
      });
    });

    kb.addEventListener('dragover', handleAutoScroll);
    kb.addEventListener('drop', finishDrag);
  },

  startKanbanAutoScroll(kb, speed) {
    this._kbScrollSpeed = speed;
    if (this._kbScrollTimer) return;
    const step = () => {
      const previous = kb.scrollLeft;
      kb.scrollLeft += this._kbScrollSpeed;
      if (kb.scrollLeft === previous) return this.stopKanbanAutoScroll();
      this._kbScrollTimer = requestAnimationFrame(step);
    };
    this._kbScrollTimer = requestAnimationFrame(step);
  },

  stopKanbanAutoScroll() {
    if (this._kbScrollTimer) { cancelAnimationFrame(this._kbScrollTimer); this._kbScrollTimer = null; }
  },

  /* ================== CALENDÁRIO ================== */
  calDate: new Date(),
  render_calendario(root, onChange) {
    const doRender = onChange || (() => this.render());
    const f = this.filters.calendario;
    const ref = new Date(this.calDate.getFullYear(), this.calDate.getMonth(), 1);
    const monthName = ref.toLocaleDateString('pt-BR',{ month:'long', year:'numeric' });

    // Agrupa clientes por empresa (nome exato), removendo duplicatas de empresa no dropdown
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c.id);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const clienteIdsSelecionados = f.cliente ? (empresaMap[f.cliente]||[]) : null;

    const cliOpts = ['<option value="">Todos clientes</option>'].concat(
      empresasUnicas.map(emp => `<option value="${escapeHTML(emp)}" ${emp===f.cliente?'selected':''}>${escapeHTML(emp)}</option>`)
    ).join('');

    const projetosDisponiveis = (clienteIdsSelecionados
      ? Store.projetos().filter(p => clienteIdsSelecionados.includes(p.clienteId))
      : Store.projetos()
    ).slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR'));
    const projOpts = ['<option value="">Todos projetos</option>'].concat(
      projetosDisponiveis.map(p=>`<option value="${p.id}" ${p.id===f.projeto?'selected':''}>${escapeHTML(p.nome)}</option>`)
    ).join('');

    const respOpts = ['<option value="">Todos responsáveis</option>'].concat(
      Store.equipe().slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR')).map(e=>`<option value="${e.id}" ${e.id===f.responsavel?'selected':''}>${escapeHTML(e.nome)}</option>`)
    ).join('');
    const prOpts = ['<option value="">Todas prioridades</option>'].concat(Object.keys(PRIORIDADE).map(p=>`<option value="${p}" ${p===f.prioridade?'selected':''}>${PRIORIDADE[p].label}</option>`)).join('');

    const matches = (d) => {
      if (clienteIdsSelecionados && !clienteIdsSelecionados.includes(d.clienteId)) return false;
      if (f.projeto && d.projetoId !== f.projeto) return false;
      if (f.responsavel && d.responsavelId !== f.responsavel) return false;
      if (f.prioridade && d.prioridade !== f.prioridade) return false;
      return true;
    };

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Calendário</h1><div class="page-subtitle">Prazos, entregas e reuniões.</div></div>
        <div class="cal-nav">
          <button class="btn btn-sm" id="prev"><i class="fa-solid fa-chevron-left"></i></button>
          <strong style="text-transform:capitalize;padding:0 8px;">${monthName}</strong>
          <button class="btn btn-sm" id="next"><i class="fa-solid fa-chevron-right"></i></button>
          <button class="btn btn-sm" id="hoje">Hoje</button>
        </div>
      </div>
      <div class="toolbar">
        <select id="fcli">${cliOpts}</select>
        <select id="fproj">${projOpts}</select>
        <select id="fresp">${respOpts}</select>
        <select id="fpr">${prOpts}</select>
        <button class="btn btn-sm" id="fclear"><i class="fa-solid fa-eraser"></i></button>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px;">
        <style>
          .cal-day.has-items { cursor:pointer; transition: border-color .15s, transform .1s; }
          .cal-day.has-items:hover { border-color: var(--primary-2); transform: translateY(-1px); }
          .cal-more { font-size:10px; color:var(--primary-2); font-weight:700; cursor:pointer; }
          .cal-more:hover { text-decoration: underline; }
        </style>
        <div class="cal-grid">
          ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<div class="cal-head">${d}</div>`).join('')}
          ${this.buildCalendarCells(ref, matches)}
        </div>
      </div>`;
    $('#prev').onclick = () => { this.calDate = new Date(ref.getFullYear(), ref.getMonth()-1, 1); doRender(); };
    $('#next').onclick = () => { this.calDate = new Date(ref.getFullYear(), ref.getMonth()+1, 1); doRender(); };
    $('#hoje').onclick = () => { this.calDate = new Date(); doRender(); };
    $('#fcli').onchange = e => { f.cliente = e.target.value; f.projeto = ''; doRender(); };
    $('#fproj').onchange = e => {
      f.projeto = e.target.value;
      // Ao escolher um projeto, já vincula o filtro de Cliente à empresa daquele projeto.
      const proj = f.projeto ? Store.projeto(f.projeto) : null;
      const cli = proj?.clienteId ? Store.cliente(proj.clienteId) : null;
      f.cliente = cli ? (cli.empresa||'').trim() : f.cliente;
      doRender();
    };
    ['fresp','fpr'].forEach(id => $('#'+id).onchange = e => {
      const map = { fresp:'responsavel', fpr:'prioridade' };
      f[map[id]] = e.target.value; doRender();
    });
    $('#fclear').onclick = () => { this.filters.calendario = { cliente:'',projeto:'',responsavel:'',prioridade:'' }; doRender(); };
    $$('.cal-item').forEach(el => el.onclick = (e) => { e.stopPropagation(); this.openDemandaDrawer(el.dataset.id); });
    $$('.cal-more').forEach(el => el.onclick = (e) => { e.stopPropagation(); this.openDiaDemandasModal(el.dataset.date); });
    $$('.cal-day.has-items').forEach(el => el.onclick = () => this.openDiaDemandasModal(el.dataset.date));
  },

  openDiaDemandasModal(iso) {
    const f = this.filters.calendario;
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c.id);
    });
    const clienteIdsSelecionados = f.cliente ? (empresaMap[f.cliente]||[]) : null;
    const items = Store.demandas()
      .filter(d => d.prazo && isoDay(d.prazo) === iso)
      .filter(d => !clienteIdsSelecionados || clienteIdsSelecionados.includes(d.clienteId))
      .filter(d => !f.projeto || d.projetoId === f.projeto)
      .filter(d => !f.responsavel || d.responsavelId === f.responsavel)
      .filter(d => !f.prioridade || d.prioridade === f.prioridade)
      .sort((a,b) => (a.titulo||'').localeCompare(b.titulo||''));
    const dataFormatada = fmtDate(iso);
    const body = items.length ? `<div class="dashboard-modal-list">${items.map(d => {
      const cli = Store.cliente(d.clienteId);
      const proj = Store.projeto(d.projetoId);
      const resp = Store.pessoa(d.responsavelId);
      return `<div class="dashboard-modal-item" data-open-dem="${d.id}" style="cursor:pointer;">
        <div>
          <strong>${escapeHTML(d.titulo)}</strong>
          <span>${escapeHTML(cli?.empresa || 'Sem cliente')} · ${escapeHTML(proj?.nome || 'Sem projeto')} · ${escapeHTML(resp?.nome || 'Sem executante')}</span>
        </div>
        ${UI.statusPill(isLate(d) ? 'atrasado' : d.status)}
      </div>`;
    }).join('')}</div>` : UI.emptyState('calendar-day','Nenhuma demanda com prazo neste dia.');
    UI.modal({
      title: `Demandas em ${dataFormatada} (${items.length})`,
      size: 'lg',
      body,
      footer: '<button class="btn" data-close-modal>Fechar</button>',
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelectorAll('[data-open-dem]').forEach(el => el.onclick = () => {
          close();
          this.openDemandaDrawer(el.dataset.openDem);
        });
      }
    });
  },
  buildCalendarCells(ref, matches) {
    const first = new Date(ref); first.setDate(1);
    const startDay = first.getDay();
    const daysInMonth = new Date(ref.getFullYear(), ref.getMonth()+1, 0).getDate();
    const start = addDays(first, -startDay);
    const cells = [];
    for (let i=0;i<42;i++) {
      const d = addDays(start, i);
      const inMonth = d.getMonth() === ref.getMonth();
      const iso = isoDay(d);
      const isToday = iso === isoDay(today());
      const items = Store.demandas().filter(x => x.prazo && isoDay(x.prazo) === iso && (!matches || matches(x)));
      cells.push(`<div class="cal-day ${inMonth?'':'other'} ${isToday?'today':''} ${items.length?'has-items':''}" data-date="${iso}" title="${items.length? 'Ver todas as demandas do dia' : ''}">
        <div class="cal-daynum">${d.getDate()}</div>
        ${items.slice(0,4).map(x => `<div class="cal-item ${isLate(x)?'late':''}" data-id="${x.id}" title="${escapeHTML(x.titulo)}">${escapeHTML(x.titulo)}</div>`).join('')}
        ${items.length>4?`<div class="cal-more" data-date="${iso}">+${items.length-4} mais</div>`:''}
      </div>`);
    }
    return cells.join('');
  },

  /* ================== TIMELINE ================== */
  render_timeline(root) {
    const f = this.filters.timeline;
    // Agrupa clientes por empresa (nome exato), para não repetir a mesma empresa várias vezes no filtro
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b));
    const cliOpts = ['<option value="">Todas as empresas</option>']
      .concat(empresasUnicas.map(emp => `<option value="${escapeHTML(emp)}" ${emp===f.cliente?'selected':''}>${escapeHTML(emp)}</option>`))
      .join('');

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Timeline</h1><div class="page-subtitle">Progresso dos projetos por empresa.</div></div>
        <div class="toolbar" style="margin-bottom:0;">
          <select id="ftlCliente" style="min-width:220px;">${cliOpts}</select>
        </div>
      </div>
      <div id="tlBody"></div>
    `;

    $('#ftlCliente').onchange = e => { f.cliente = e.target.value; this.drawTimelineBody(); };
    this.drawTimelineBody();
  },

  drawTimelineBody() {
    const body = $('#tlBody');
    if (!body) return;
    const f = this.filters.timeline;
    Object.values(this.charts).forEach(c => c && c.destroy && c.destroy());

    if (!f.cliente) {
      // Visão comparativa: progresso de todas as empresas (agrupando os contatos de uma mesma empresa)
      const empresaMap = {};
      Store.clientes().forEach(c => {
        const key = (c.empresa||'').trim();
        if (!key) return;
        if (!empresaMap[key]) empresaMap[key] = [];
        empresaMap[key].push(c);
      });
      const empresasUnicas = Object.keys(empresaMap);
      if (!empresasUnicas.length) { body.innerHTML = UI.emptyState('timeline','Sem clientes cadastrados.'); return; }

      const rows = empresasUnicas.map(emp => {
        const clienteIds = empresaMap[emp].map(c => c.id);
        const dems = Store.demandas().filter(d => clienteIds.includes(d.clienteId));
        const projs = Store.projetos().filter(p => clienteIds.includes(p.clienteId));
        const concluidas = dems.filter(d => d.status==='concluido').length;
        const atrasadas = dems.filter(isLate).length;
        const progresso = dems.length ? Math.round((concluidas/dems.length)*100) : 0;
        return { empresa: emp, dems, projs, concluidas, atrasadas, progresso };
      }).filter(r => r.dems.length || r.projs.length)
        .sort((a,b) => b.dems.length - a.dems.length);

      if (!rows.length) { body.innerHTML = UI.emptyState('timeline','Nenhuma empresa com projetos ou demandas ainda.'); return; }

      body.innerHTML = `
        <div class="charts-grid">
          <div class="chart-card col-12">
            <h3>Progresso por empresa (% de demandas concluídas)</h3>
            <div class="chart-wrap" style="height:${Math.max(220, rows.length*36)}px;"><canvas id="chartTlProgress"></canvas></div>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:16px;">
          <table>
            <thead><tr>
              <th>Empresa</th><th>Projetos</th><th>Demandas</th><th>Concluídas</th><th>Atrasadas</th><th>Progresso</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr style="cursor:pointer" data-emp="${escapeHTML(r.empresa)}">
                <td><strong>${escapeHTML(r.empresa)}</strong></td>
                <td>${r.projs.length}</td>
                <td>${r.dems.length}</td>
                <td>${r.concluidas}</td>
                <td>${r.atrasadas ? `<span style="color:#ef4444;font-weight:700;">${r.atrasadas}</span>` : '0'}</td>
                <td style="min-width:160px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden;">
                      <div style="height:100%;width:${r.progresso}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);"></div>
                    </div>
                    <span style="font-size:12px;font-weight:700;min-width:34px;text-align:right;">${r.progresso}%</span>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      body.querySelectorAll('[data-emp]').forEach(tr => tr.onclick = () => {
        f.cliente = tr.dataset.emp;
        $('#ftlCliente').value = f.cliente;
        this.drawTimelineBody();
      });

      const { textColor: tlTextColor, gridColor: tlGridColor } = this.chartTheme();
      this.charts.tlProgress = new Chart($('#chartTlProgress'), {
        type:'bar',
        data:{
          labels: rows.map(r => wrapLabel(r.empresa)),
          datasets:[{ label:'Progresso (%)', data: rows.map(r=>r.progresso), backgroundColor: rows.map(r=> r.atrasadas ? '#ef4444' : '#6366f1'), borderRadius:6, maxBarThickness:22, categoryPercentage:0.7, barPercentage:0.8 }]
        },
        options:{
          maintainAspectRatio:false, indexAxis:'y',
          scales:{
            x:{ min:0, max:100, ticks:{ color: tlTextColor }, grid:{ color: tlGridColor } },
            y:{ ticks:{ autoSkip:false, font:{ size:10 }, color: tlTextColor }, grid:{ color: tlGridColor } }
          },
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{
            title: items => (items[0]?.label instanceof Array ? items[0].label.join(' ') : items[0]?.label),
            label: ctx => `${ctx.raw}% concluído`
          } } }
        }
      });
      return;
    }

    // Visão detalhada de uma empresa específica (agrupando todos os contatos daquela empresa)
    const clientesDaEmpresa = Store.clientes().filter(c => (c.empresa||'').trim() === f.cliente);
    if (!clientesDaEmpresa.length) { f.cliente=''; this.render(); return; }
    const clienteIds = clientesDaEmpresa.map(c => c.id);
    const nomeEmpresa = f.cliente;
    const dems = Store.demandas().filter(d => clienteIds.includes(d.clienteId));
    const projs = Store.projetos().filter(p => clienteIds.includes(p.clienteId));
    const concluidas = dems.filter(d => d.status==='concluido').length;
    const atrasadas = dems.filter(isLate).length;
    const emAndamento = dems.filter(d => !['concluido','cancelado'].includes(d.status)).length;
    const progresso = dems.length ? Math.round((concluidas/dems.length)*100) : 0;

    const kpi = (label, value, icon, color) => `<div class="kpi">
        <div class="kpi-head"><div class="kpi-label">${label}</div><div class="kpi-icon" style="background:${color}"><i class="fa-solid fa-${icon}"></i></div></div>
        <div class="kpi-value">${value}</div>
      </div>`;

    const projsComData = projs.filter(p => p.inicio && p.prazo).sort((a,b)=> new Date(a.inicio)-new Date(b.inicio));

    // Progresso das demandas por status
    const demStatusRows = STATUS_ORDER
      .map(st => ({ st, label: STATUS[st]?.label || st, color: STATUS[st]?.color || '#6366f1', count: dems.filter(d => d.status === st).length }))
      .filter(r => r.count > 0);

    body.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:16px;">
        ${kpi('Projetos', projs.length, 'diagram-project', '#8b5cf6')}
        ${kpi('Demandas', dems.length, 'list-check', '#6366f1')}
        ${kpi('Em andamento', emAndamento, 'spinner', '#0ea5e9')}
        ${kpi('Concluídas', concluidas, 'check', '#10b981')}
        ${kpi('Atrasadas', atrasadas, 'triangle-exclamation', '#ef4444')}
        ${kpi('Progresso', progresso+'%', 'chart-line', '#22c55e')}
      </div>
      <div class="charts-grid">
        <div class="chart-card col-12">
          <h3>Progresso das demandas — ${escapeHTML(nomeEmpresa)}</h3>
          ${dems.length
            ? `<div class="chart-wrap" style="height:${Math.max(180, demStatusRows.length*46)}px;"><canvas id="chartTlProjetos"></canvas></div>`
            : UI.emptyState('list-check','Nenhuma demanda cadastrada para esta empresa.')}
        </div>
      </div>
      ${projsComData.length ? `
      <div class="timeline-proj-list" style="margin-top:16px;">
        <div style="font-size:11px;color:var(--text-2);font-weight:700;margin-bottom:10px;">PROJETOS</div>
        ${projsComData.map(p => {
          const demsProj = Store.demandas().filter(d => d.projetoId === p.id);
          const concluidasProj = demsProj.filter(d => d.status==='concluido').length;
          const progressoProj = demsProj.length ? Math.round((concluidasProj/demsProj.length)*100) : 0;
          return `<div class="timeline-proj-item" data-proj="${p.id}" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);margin-bottom:8px;">
            <div style="min-width:0;">
              <strong style="display:block;font-size:13px;">${escapeHTML(p.nome)}</strong>
              <span style="display:block;margin-top:4px;color:var(--text-2);font-size:12px;">Início: ${fmtDate(p.inicio)} · Prazo: ${fmtDate(p.prazo)} · ${demsProj.length} demanda(s) · ${progressoProj}% concluído</span>
            </div>
            ${UI.statusPill(p.status)}
          </div>`;
        }).join('')}
      </div>` : ''}
    `;

    body.querySelectorAll('[data-proj]').forEach(el => el.onclick = () => this.openTimelineProjeto(el.dataset.proj));

    if (dems.length) {
      const { textColor: tlpTextColor, gridColor: tlpGridColor } = this.chartTheme();
      this.charts.tlProjetos = new Chart($('#chartTlProjetos'), {
        type:'bar',
        data:{
          labels: demStatusRows.map(r => r.label),
          datasets:[{ label:'Demandas', data: demStatusRows.map(r=>r.count), backgroundColor: demStatusRows.map(r=>r.color), borderRadius:6 }]
        },
        options:{
          maintainAspectRatio:false, indexAxis:'y',
          scales:{
            x:{ min:0, ticks:{ precision:0, color: tlpTextColor }, grid:{ color: tlpGridColor } },
            y:{ ticks:{ color: tlpTextColor }, grid:{ color: tlpGridColor } }
          },
          plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => `${ctx.raw} demanda(s)` } } }
        }
      });
    }
  },

  openTimelineProjeto(projetoId) {
    const p = Store.projeto(projetoId);
    if (!p) return;
    const cliente = Store.cliente(p.clienteId);
    const responsavel = Store.pessoa(p.responsavelId);
    const dems = Store.demandas().filter(d => d.projetoId === p.id);
    const body = `
      <div class="dashboard-modal-item" style="margin-bottom:14px;">
        <div>
          <strong>${escapeHTML(p.nome)}</strong>
          <span>${escapeHTML(cliente?.empresa || 'Sem cliente')} · Executante: ${escapeHTML(responsavel?.nome || '—')} · Início: ${fmtDate(p.inicio)} · Prazo: ${fmtDate(p.prazo)}</span>
        </div>
        ${UI.statusPill(p.status)}
      </div>
      ${dems.length ? `<div class="dashboard-modal-list">${dems.map(d => {
        const respD = Store.pessoa(d.responsavelId);
        return `<div class="dashboard-modal-item"><div><strong>${escapeHTML(d.titulo)}</strong><span>${escapeHTML(respD?.nome || 'Sem executante')} · Prazo: ${fmtDate(d.prazo)}</span></div>${UI.statusPill(isLate(d) ? 'atrasado' : d.status)}</div>`;
      }).join('')}</div>` : UI.emptyState('list-check','Nenhuma demanda cadastrada para este projeto.')}
    `;
    UI.modal({ title: p.nome, size:'lg', body, footer:'<button class="btn" data-close-modal>Fechar</button>', onOpen: (root, close) => {
      root.querySelector('[data-close-modal]').onclick = close;
    }});
  },

  /* ================== REUNIÕES ================== */
  render_reunioes(root) {
    const reunioes = Store.reunioes().slice().sort((a,b) => new Date(b.data) - new Date(a.data));
    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Reuniões</h1><div class="page-subtitle">Status reports, decisões e atas.</div></div>
        <button class="btn btn-primary" id="btnNovaReuniao"><i class="fa-solid fa-plus"></i> Nova reunião</button>
      </div>
      <div id="reuniaoList" class="reuniao-list">
        ${reunioes.length ? reunioes.map(m => {
          const cli = m.clienteId ? Store.cliente(m.clienteId) : null;
          const proj = m.projetoId ? Store.projeto(m.projetoId) : null;
          const nParticipantes = (m.participantes||'').split(',').filter(Boolean).length;
          const nAnexos = (m.anexos||[]).length;
          return `<div class="reuniao-card" data-reuniao="${m.id}">
            <div class="reuniao-card-icon"><i class="fa-solid fa-calendar-days"></i></div>
            <div class="reuniao-card-body">
              <div class="reuniao-card-title">${escapeHTML(m.titulo)}</div>
              <div class="reuniao-card-meta">
                <span><i class="fa-regular fa-clock"></i> ${fmtDate(m.data)}${m.horaInicio?` ${escapeHTML(m.horaInicio)}${m.horaFim?`–${escapeHTML(m.horaFim)}`:''}`:''}</span>
                ${cli?`<span class="dot-sep"></span><span><i class="fa-regular fa-building"></i> ${escapeHTML(cli.empresa)}</span>`:''}
                ${proj?`<span class="dot-sep"></span><span><i class="fa-solid fa-diagram-project"></i> ${escapeHTML(proj.nome)}</span>`:''}
              </div>
            </div>
            <div class="reuniao-card-side">
              <span class="reuniao-badge"><i class="fa-solid fa-users"></i> ${nParticipantes} participante(s)</span>
              ${nAnexos ? `<span class="reuniao-attach-badge"><i class="fa-solid fa-paperclip"></i> ${nAnexos} anexo(s)</span>` : ''}
            </div>
          </div>`;
        }).join('') : UI.emptyState('calendar-check','Nenhuma reunião registrada ainda.')}
      </div>`;
    $('#btnNovaReuniao').onclick = () => this.openReuniaoModal();
    root.querySelectorAll('[data-reuniao]').forEach(card => card.onclick = () => this.openReuniaoDrawer(card.dataset.reuniao));
  },

  openReuniaoModal(m=null) {
    // Agrupa clientes por empresa (nome exato) para não repetir a mesma empresa várias vezes no dropdown
    const clientesAll = Store.clientes();
    const empresaMap = {};
    clientesAll.forEach(c => {
      const key = (c.empresa||'').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = [];
      empresaMap[key].push(c);
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b));
    const empresaOpts = empresasUnicas.map(emp => ({ value: emp, label: emp }));
    const projOpts = Store.projetos().map(p=>({value:p.id,label:p.nome}));

    // Empresa de cada projeto (via projeto.clienteId -> cliente.empresa), para filtro cruzado
    const empresaDoProjeto = {};
    Store.projetos().forEach(p => {
      const c = p.clienteId ? Store.cliente(p.clienteId) : null;
      empresaDoProjeto[p.id] = c ? (c.empresa||'').trim() : '';
    });
    // Empresa -> lista de projetos daquela empresa
    const projetosPorEmpresa = {};
    Store.projetos().forEach(p => {
      const emp = empresaDoProjeto[p.id];
      if (!emp) return;
      (projetosPorEmpresa[emp] = projetosPorEmpresa[emp] || []).push({ id: p.id, label: p.nome });
    });

    // Empresa atualmente selecionada: prioriza a empresa do projeto já salvo (se houver);
    // senão cai na empresa do contato (clienteId) salvo na reunião.
    const projetoAtual = m?.projetoId ? Store.projeto(m.projetoId) : null;
    const clienteAtual = m?.clienteId ? Store.cliente(m.clienteId) : null;
    const empresaAtual = (projetoAtual ? empresaDoProjeto[projetoAtual.id] : '') || (clienteAtual ? (clienteAtual.empresa||'').trim() : '');
    const projOptsFiltrados = empresaAtual ? (projetosPorEmpresa[empresaAtual]||[]) : projOpts;

    // Participantes previamente salvos (nomes livres, separados por vírgula) — usados para pré-marcar chips
    const participantesAtuais = (m?.participantes||'').split(',').map(s=>s.trim()).filter(Boolean);

    const equipe = Store.equipe();
    const equipeChips = equipe.map(e =>
      `<span class="tag-chip${participantesAtuais.includes(e.nome)?' active':''}" data-participante="${escapeHTML(e.nome)}" data-email="${escapeHTML(e.email||'')}">${escapeHTML(e.nome)}</span>`
    ).join('') || '<div class="empty" style="padding:6px 0;font-size:12px;">Nenhum membro cadastrado em Equipe.</div>';

    // Renderiza os chips de contato apenas dos clientes ligados à empresa selecionada
    const renderContatosChips = (empresa) => {
      if (!empresa || !empresaMap[empresa]) return '<div class="empty" style="padding:6px 0;font-size:12px;">Selecione uma empresa para ver os contatos.</div>';
      const contatos = empresaMap[empresa]
        .map(c => ({ nome: (c.contato || c.nome || '').trim(), email: (c.email||'').trim() }))
        .filter(c => c.nome);
      if (!contatos.length) return '<div class="empty" style="padding:6px 0;font-size:12px;">Esta empresa não possui contatos cadastrados.</div>';
      return contatos.map(c =>
        `<span class="tag-chip${participantesAtuais.includes(c.nome)?' active':''}" data-participante="${escapeHTML(c.nome)}" data-email="${escapeHTML(c.email)}">${escapeHTML(c.nome)}</span>`
      ).join('');
    };

    UI.modal({
      title: m ? 'Editar Reunião' : 'Nova Reunião',
      size: 'lg',
      body: `
        <form id="reuniaoForm" class="form-grid">
          <div class="field full"><label>Título *</label><input name="titulo" required value="${escapeHTML(m?.titulo||'')}"/></div>
          <div class="field"><label>Data</label><input type="date" name="data" value="${m?.data?isoDay(m.data):isoDay(new Date().toISOString())}"/></div>
          <div class="field"><label>Cliente (Empresa)</label>${UI.select('empresaSelecionada',[{value:'',label:'—'},...empresaOpts], empresaAtual)}</div>
          <div class="field"><label>Hora início</label><input type="time" name="horaInicio" value="${escapeHTML(m?.horaInicio||'09:00')}"/></div>
          <div class="field"><label>Hora fim</label><input type="time" name="horaFim" value="${escapeHTML(m?.horaFim||'10:00')}"/></div>
          <div class="field"><label>Projeto</label>${UI.select('projetoId',[{value:'',label:'—'},...projOptsFiltrados], m?.projetoId||'')}</div>
          <div class="field full">
            <label>Participantes — Equipe</label>
            <div class="tag-picker" id="equipePicker">${equipeChips}</div>
          </div>
          <div class="field full">
            <label>Participantes — Contatos de Cliente</label>
            <div class="tag-picker" id="contatoPicker">${renderContatosChips(empresaAtual)}</div>
          </div>
          <input type="hidden" name="participantes" value="${escapeHTML(participantesAtuais.join(', '))}"/>
          <input type="hidden" name="participantesEmails" value=""/>
          <input type="hidden" name="clienteId" value="${escapeHTML(m?.clienteId||(clientesAll.find(c=>(c.empresa||'').trim()===empresaAtual)?.id||''))}"/>
        </form>`,
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveReuniao"><i class="fa-solid fa-check"></i> Salvar</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;

        const hiddenInput = root.querySelector('input[name="participantes"]');
        const hiddenEmails = root.querySelector('input[name="participantesEmails"]');
        const clienteIdInput = root.querySelector('input[name="clienteId"]');
        const contatoPicker = root.querySelector('#contatoPicker');

        const syncHidden = () => {
          const selecionados = root.querySelectorAll('.tag-chip.active');
          hiddenInput.value = Array.from(selecionados).map(el => el.dataset.participante).join(', ');
          hiddenEmails.value = Array.from(selecionados).map(el => el.dataset.email).filter(Boolean).join(', ');
        };
        const bindContatoChips = () => {
          contatoPicker.querySelectorAll('.tag-chip').forEach(chip => {
            chip.onclick = () => { chip.classList.toggle('active'); syncHidden(); };
          });
        };

        root.querySelectorAll('#equipePicker .tag-chip').forEach(chip => {
          chip.onclick = () => { chip.classList.toggle('active'); syncHidden(); };
        });
        bindContatoChips();
        syncHidden();

        const projetoSelect = root.querySelector('select[name="projetoId"]');
        const empresaSelect = root.querySelector('select[name="empresaSelecionada"]');

        const rebuildProjOpts = (empresa, keepValue='') => {
          const opts = empresa && projetosPorEmpresa[empresa] ? projetosPorEmpresa[empresa] : projOpts;
          projetoSelect.innerHTML = [{value:'',label:'—'},...opts].map(o =>
            `<option value="${escapeHTML(o.value)}" ${o.value===keepValue?'selected':''}>${escapeHTML(o.label)}</option>`
          ).join('');
        };

        empresaSelect.onchange = (e) => {
          const empresa = e.target.value;
          contatoPicker.innerHTML = renderContatosChips(empresa);
          bindContatoChips();
          syncHidden();
          // Guarda o id do primeiro cliente daquela empresa (mantém compatibilidade com clienteId em outras telas)
          clienteIdInput.value = empresa && empresaMap[empresa] ? (empresaMap[empresa][0]?.id || '') : '';
          // Filtra o dropdown de projeto pra mostrar só os projetos daquela empresa
          rebuildProjOpts(empresa);
        };

        projetoSelect.onchange = (e) => {
          const projId = e.target.value;
          if (!projId) return;
          const empresa = empresaDoProjeto[projId];
          if (!empresa || empresa === empresaSelect.value) return;
          // Ao escolher um projeto, sincroniza a empresa (e contatos) selecionada automaticamente
          empresaSelect.value = empresa;
          contatoPicker.innerHTML = renderContatosChips(empresa);
          bindContatoChips();
          syncHidden();
          clienteIdInput.value = empresaMap[empresa] ? (empresaMap[empresa][0]?.id || '') : '';
          rebuildProjOpts(empresa, projId);
        };

        root.querySelector('#saveReuniao').onclick = () => {
          const data = UI.readForm(root.querySelector('#reuniaoForm'));
          delete data.empresaSelecionada;
          if (!data.titulo) return UI.toast('Título obrigatório','warn');
          const record = {
            id: m?.id,
            ...data,
            ata: m?.ata || [],
            decisoes: m?.decisoes || [],
            riscos: m?.riscos || [],
            impedimentos: m?.impedimentos || [],
            createdAt: m?.createdAt || new Date().toISOString()
          };
          Store.upsert('reunioes', record);
          close(); UI.toast('Reunião salva','success'); this.render();
        };
      }
    });
  },

  openReuniaoDrawer(id) {
    const m = Store.reuniao(id); if (!m) return;
    const cli = m.clienteId ? Store.cliente(m.clienteId) : null;
    const proj = m.projetoId ? Store.projeto(m.projetoId) : null;

    const listSection = (titulo, campo, placeholder) => {
      const itens = m[campo] || [];
      const rows = itens.map(item => `
        <div class="list-item-row" data-item="${campo}:${item.id}" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);align-items:flex-start;">
          <div class="list-item-text" style="font-size:12px;flex:1;white-space:pre-wrap;">${escapeHTML(item.texto)}</div>
          <button class="row-btn" data-edit="${campo}:${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="row-btn" data-del="${campo}:${item.id}" title="Remover"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('') || '<div class="empty" style="padding:8px 0;font-size:12px;">Nada registrado.</div>';
      return `
        <div class="section-title">${titulo}</div>
        <div id="list-${campo}">${rows}</div>
        <div style="display:flex;gap:6px;margin-top:8px;align-items:flex-start;">
          <textarea id="new-${campo}" class="list-entry-input" rows="1" placeholder="${placeholder}"></textarea>
          <button class="btn btn-sm btn-primary" data-add="${campo}"><i class="fa-solid fa-plus"></i></button>
        </div>`;
    };

    const fmtBytes = (bytes) => {
      if (!bytes && bytes !== 0) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
      return `${(bytes/(1024*1024)).toFixed(1)} MB`;
    };
    const fileIcon = (nome='', tipo='') => {
      const ext = (nome.split('.').pop()||'').toLowerCase();
      if (tipo.includes('pdf') || ext==='pdf') return 'fa-file-pdf';
      if (tipo.includes('csv') || ext==='csv') return 'fa-file-csv';
      if (tipo.includes('sheet') || ['xls','xlsx'].includes(ext)) return 'fa-file-excel';
      if (tipo.includes('word') || ['doc','docx'].includes(ext)) return 'fa-file-word';
      if (tipo.includes('image') || ['png','jpg','jpeg','gif','webp'].includes(ext)) return 'fa-file-image';
      if (tipo.includes('zip') || ['zip','rar','7z'].includes(ext)) return 'fa-file-zipper';
      return 'fa-file';
    };
    const renderAnexos = (anexos) => {
      if (!anexos.length) return '<div class="empty" style="padding:8px 0;font-size:12px;">Nenhum anexo.</div>';
      return anexos.map(a => `
        <div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);align-items:center;">
          <a href="${a.dataUrl}" download="${escapeHTML(a.nome)}" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;color:var(--text);text-decoration:none;">
            <i class="fa-solid ${fileIcon(a.nome,a.tipo)}" style="color:var(--primary-2);width:16px;"></i>
            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(a.nome)}</span>
            <span style="font-size:11px;color:var(--text-2);flex-shrink:0;">${fmtBytes(a.tamanho)}</span>
          </a>
          <button class="row-btn" data-del-anexo="${a.id}" title="Remover"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
    };

    UI.drawer({
      title: m.titulo,
      body: `
        <div style="font-size:12px;color:var(--text-2);margin-bottom:14px;">
          ${fmtDate(m.data)}${m.horaInicio?` · ${escapeHTML(m.horaInicio)}${m.horaFim?`–${escapeHTML(m.horaFim)}`:''}`:''}${cli?` · Cliente: ${escapeHTML(cli.empresa)}`:''}${proj?` · Projeto: ${escapeHTML(proj.nome)}`:''}
        </div>
        <div style="font-size:12px;margin-bottom:6px;"><b>Participantes:</b> ${escapeHTML(m.participantes||'—')}</div>
        <div style="margin-bottom:14px;">
          <a class="btn btn-sm" id="btnConviteMeet" href="#" target="_blank" rel="noopener">
            <i class="fa-solid fa-video"></i> Criar convite Google Meet
          </a>
        </div>
        ${listSection('Ata / Decisões', 'decisoes', 'Adicionar item da ata...')}
        ${listSection('Riscos identificados', 'riscos', 'Adicionar risco...')}
        ${listSection('Impedimentos', 'impedimentos', 'Adicionar impedimento...')}
        <div class="section-title">Anexos</div>
        <div id="list-anexos">${renderAnexos(m.anexos||[])}</div>
        <div class="file-upload" style="margin-top:10px;">
          <label class="file-upload-label" for="anexoInput">
            <i class="fa-solid fa-paperclip"></i> Escolher arquivos
          </label>
          <span class="file-upload-hint" id="anexoInputHint">PDF, CSV, imagens e outros arquivos até 4MB cada.</span>
          <input type="file" id="anexoInput" multiple/>
        </div>
        <div style="display:flex;gap:6px;margin-top:20px;">
          <button class="btn" id="btnEditReuniao"><i class="fa-solid fa-pen"></i> Editar</button>
          <button class="btn btn-danger" id="btnDelReuniao"><i class="fa-solid fa-trash"></i> Excluir</button>
        </div>`,
      onOpen: (root, close) => {
        const emails = (m.participantesEmails||'').split(',').map(s=>s.trim()).filter(Boolean);
        const btnConvite = root.querySelector('#btnConviteMeet');
        btnConvite.onclick = (ev) => {
          ev.preventDefault();
          if (!emails.length) {
            UI.toast('Nenhum e-mail cadastrado entre os participantes desta reunião. Edite a reunião e cadastre e-mails na Equipe/Clientes.', 'warn');
            return;
          }
          const link = buildGoogleCalendarLink({
            titulo: m.titulo,
            dataISO: isoDay(m.data),
            horaInicio: m.horaInicio || '09:00',
            horaFim: m.horaFim || '10:00',
            convidados: emails,
            detalhes: `Reunião gerada pelo FlowDesk.${cli?` Cliente: ${cli.empresa}.`:''}${proj?` Projeto: ${proj.nome}.`:''}`
          });
          window.open(link, '_blank', 'noopener');
        };

        const camposLista = ['decisoes','riscos','impedimentos'];
        const refreshList = (campo) => {
          const itens = m[campo] || [];
          root.querySelector(`#list-${campo}`).innerHTML = itens.map(item => `
            <div class="list-item-row" data-item="${campo}:${item.id}" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);align-items:flex-start;">
              <div class="list-item-text" style="font-size:12px;flex:1;white-space:pre-wrap;">${escapeHTML(item.texto)}</div>
              <button class="row-btn" data-edit="${campo}:${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="row-btn" data-del="${campo}:${item.id}" title="Remover"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join('') || '<div class="empty" style="padding:8px 0;font-size:12px;">Nada registrado.</div>';
          bindListRow(campo);
        };

        // Troca uma linha da lista pelo modo de edição (textarea + Salvar/Cancelar),
        // permitindo corrigir erros de digitação sem precisar excluir e recriar o item.
        const startEdit = (campo, itemId) => {
          const item = (m[campo]||[]).find(x => x.id === itemId);
          if (!item) return;
          const rowEl = root.querySelector(`[data-item="${campo}:${itemId}"]`);
          if (!rowEl) return;
          rowEl.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
              <textarea class="list-entry-input" rows="1" style="width:100%;">${escapeHTML(item.texto)}</textarea>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-primary" data-save-edit="${campo}:${itemId}"><i class="fa-solid fa-check"></i> Salvar</button>
                <button class="btn btn-sm" data-cancel-edit="${campo}:${itemId}">Cancelar</button>
              </div>
            </div>`;
          const ta = rowEl.querySelector('textarea');
          const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
          ta.addEventListener('input', fit);
          fit();
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);

          rowEl.querySelector('[data-save-edit]').onclick = () => {
            const v = ta.value.trim();
            if (!v) { UI.toast('O texto não pode ficar vazio', 'warn'); return; }
            item.texto = v;
            Store.save();
            refreshList(campo);
          };
          rowEl.querySelector('[data-cancel-edit]').onclick = () => refreshList(campo);
        };

        const bindListRow = (campo) => {
          root.querySelectorAll(`[data-edit^="${campo}:"]`).forEach(btn => btn.onclick = () => {
            const [,itemId] = btn.dataset.edit.split(':');
            startEdit(campo, itemId);
          });
          root.querySelectorAll(`[data-del^="${campo}:"]`).forEach(btn => btn.onclick = () => {
            const [,itemId] = btn.dataset.del.split(':');
            m[campo] = (m[campo]||[]).filter(x => x.id !== itemId);
            Store.save(); refreshList(campo);
          });
        };
        camposLista.forEach(campo => {
          const input = root.querySelector(`#new-${campo}`);
          const fitInput = () => {
            input.style.height = 'auto';
            input.style.height = `${input.scrollHeight}px`;
          };
          input.addEventListener('input', fitInput);
          root.querySelector(`[data-add="${campo}"]`).onclick = () => {
            const v = input.value.trim(); if (!v) return;
            if (!m[campo]) m[campo] = [];
            m[campo].push({ id: uid('it'), texto: v });
            input.value = '';
            fitInput();
            Store.save(); refreshList(campo);
          };
          bindListRow(campo);
        });

        const refreshAnexos = () => {
          root.querySelector('#list-anexos').innerHTML = renderAnexos(m.anexos||[]);
          root.querySelectorAll('[data-del-anexo]').forEach(btn => btn.onclick = () => {
            m.anexos = (m.anexos||[]).filter(a => a.id !== btn.dataset.delAnexo);
            Store.save(); refreshAnexos();
          });
        };
        refreshAnexos();

        root.querySelector('#anexoInput').onchange = (e) => {
          const files = Array.from(e.target.files || []);
          const hint = root.querySelector('#anexoInputHint');
          const MAX_BYTES = 4 * 1024 * 1024;
          let pendentes = files.length;
          if (!pendentes) return;
          hint.textContent = files.length === 1 ? `Enviando "${files[0].name}"...` : `Enviando ${files.length} arquivos...`;
          const resetHint = () => { hint.textContent = 'PDF, CSV, imagens e outros arquivos até 4MB cada.'; };
          files.forEach(file => {
            if (file.size > MAX_BYTES) {
              UI.toast(`"${file.name}" excede 4MB e não foi anexado`, 'warn');
              pendentes--; if (pendentes === 0) { e.target.value = ''; resetHint(); }
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              if (!m.anexos) m.anexos = [];
              m.anexos.push({
                id: uid('anx'), nome: file.name, tipo: file.type || '',
                tamanho: file.size, dataUrl: reader.result,
                criadoEm: new Date().toISOString()
              });
              Store.save(); refreshAnexos();
              pendentes--; if (pendentes === 0) { e.target.value = ''; resetHint(); }
            };
            reader.onerror = () => {
              UI.toast(`Falha ao ler "${file.name}"`, 'warn');
              pendentes--; if (pendentes === 0) { e.target.value = ''; resetHint(); }
            };
            reader.readAsDataURL(file);
          });
        };

        root.querySelector('#btnEditReuniao').onclick = () => { close(); this.openReuniaoModal(m); };
        root.querySelector('#btnDelReuniao').onclick = () => {
          UI.confirm('Excluir reunião','Esta ação não pode ser desfeita.', () => {
            Store.remove('reunioes', m.id); close(); UI.toast('Reunião excluída','success'); this.render();
          });
        };
      }
    });
  },

  /* ================== EQUIPE ================== */
  render_equipe(root) {
    const team = Store.equipe();
    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Equipe</h1><div class="page-subtitle">Membros e carga de trabalho.</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="btnImport"><i class="fa-solid fa-file-import"></i> Importar CSV</button>
          <button class="btn" id="btnCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
          <button class="btn btn-primary" id="btnNovoMembro"><i class="fa-solid fa-plus"></i> Novo membro</button>
        </div>
      </div>
      <div class="kpi-grid">
        ${team.map(p => {
          const dems = Store.demandas().filter(d => d.responsavelId===p.id);
          const ativas = dems.filter(d => !['concluido','cancelado'].includes(d.status)).length;
          const conc = dems.filter(d => d.status==='concluido').length;
          return `<div class="kpi" data-membro="${p.id}" style="cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <div class="avatar">${initials(p.nome)}</div>
              <div>
                <div style="font-weight:700;">${escapeHTML(p.nome)}</div>
                <div style="font-size:11px;color:var(--text-2);">${escapeHTML(p.cargo)}</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;font-size:12px;color:var(--text-2);">
              <div><b style="color:var(--text);font-size:16px">${ativas}</b> ativas</div>
              <div><b style="color:var(--text);font-size:16px">${conc}</b> concluídas</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    $('#btnNovoMembro').onclick = () => this.openMembroModal();
    $('#btnImport').onclick = () => this.importCSV('equipe');
    $('#btnCsv').onclick = () => this.exportEquipeCSV();
    root.querySelectorAll('[data-membro]').forEach(card => card.onclick = () => this.openMembroDrawer(card.dataset.membro));
  },

  openMembroDrawer(id) {
    const p = Store.pessoa(id); if (!p) return;
    const dems = Store.demandas().filter(d => d.responsavelId===p.id);
    const ativas = dems.filter(d => !['concluido','cancelado'].includes(d.status));
    const concluidas = dems.filter(d => d.status==='concluido');

    const now = new Date();
    const mesAtual = now.getMonth(), anoAtual = now.getFullYear();
    const dentroDoMes = (d) => {
      const dt = new Date(d.criacao);
      return dt.getMonth()===mesAtual && dt.getFullYear()===anoAtual;
    };
    const horasMes = dems.filter(dentroDoMes).reduce((sum,d) => sum + (parseFloat(d.tempoGasto)||0), 0);
    const horasTotal = dems.reduce((sum,d) => sum + (parseFloat(d.tempoGasto)||0), 0);

    const rowDemanda = (d) => `
      <div class="demanda-row" data-id="${d.id}" style="cursor:pointer;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <div style="font-weight:600;font-size:13px;">${escapeHTML(d.titulo)}</div>
          ${UI.statusPill(isLate(d)?'atrasado':d.status)}
        </div>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--text-2);margin-top:4px;">
          <span>Prazo: ${fmtDate(d.prazo)}</span>
          <span>Tempo: ${d.tempoGasto||0}h</span>
        </div>
      </div>`;

    UI.drawer({
      title: p.nome,
      body: `
        <div style="font-size:13px;color:var(--text-2);margin-bottom:4px;">${escapeHTML(p.cargo||'')}</div>
        <div style="font-size:12px;color:var(--text-2);margin-bottom:14px;"><i class="fa-regular fa-envelope"></i> ${escapeHTML(p.email||'—')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
          <div class="kpi" style="padding:10px;">
            <div style="font-size:11px;color:var(--text-2);">Demandas ativas</div>
            <div style="font-size:20px;font-weight:700;">${ativas.length}</div>
          </div>
          <div class="kpi" style="padding:10px;">
            <div style="font-size:11px;color:var(--text-2);">Concluídas</div>
            <div style="font-size:20px;font-weight:700;">${concluidas.length}</div>
          </div>
          <div class="kpi" style="padding:10px;">
            <div style="font-size:11px;color:var(--text-2);">Horas neste mês</div>
            <div style="font-size:20px;font-weight:700;">${horasMes}h</div>
          </div>
          <div class="kpi" style="padding:10px;">
            <div style="font-size:11px;color:var(--text-2);">Horas no total</div>
            <div style="font-size:20px;font-weight:700;">${horasTotal}h</div>
          </div>
        </div>
        <div class="section-title">Demandas ativas</div>
        ${ativas.length ? ativas.map(rowDemanda).join('') : '<div class="empty" style="padding:12px">Sem demandas ativas.</div>'}
        <div class="section-title">Concluídas recentemente</div>
        ${concluidas.length ? concluidas.slice(0,5).map(rowDemanda).join('') : '<div class="empty" style="padding:12px">Nenhuma concluída ainda.</div>'}
        <div style="display:flex;gap:6px;margin-top:20px;">
          <button class="btn" id="btnEditMembro"><i class="fa-solid fa-pen"></i> Editar membro</button>
          <button class="btn btn-danger" id="btnDelMembro"><i class="fa-solid fa-trash"></i> Remover membro</button>
        </div>`,
      onOpen: (root, close) => {
        root.querySelectorAll('[data-id]').forEach(row => row.onclick = () => {
          close();
          this.openDemandaDrawer(row.dataset.id, () => this.openMembroDrawer(id));
        });
        root.querySelector('#btnEditMembro').onclick = () => { close(); this.openMembroModal(p); };
        root.querySelector('#btnDelMembro').onclick = () => this.delMembro(p, close);
      }
    });
  },

  delMembro(p, closeDrawer) {
    const linkedDemands = Store.demandas().filter(d => d.responsavelId === p.id).length;
    const linkedProjects = Store.projetos().filter(project => project.responsavelId === p.id || (project.equipeIds || []).includes(p.id)).length;
    const details = [
      linkedDemands ? `${linkedDemands} demanda(s) ficarao sem responsavel` : '',
      linkedProjects ? `${linkedProjects} projeto(s) terao o membro removido` : ''
    ].filter(Boolean).join('. ');
    UI.confirm('Remover membro', `${p.nome} sera removido da equipe. ${details || 'Nenhum item sera afetado.'}`, () => {
      Store.state.demandas.forEach(d => { if (d.responsavelId === p.id) d.responsavelId = ''; });
      Store.state.projetos.forEach(project => {
        if (project.responsavelId === p.id) project.responsavelId = '';
        project.equipeIds = (project.equipeIds || []).filter(id => id !== p.id);
      });
      Store.remove('equipe', p.id);
      closeDrawer();
      UI.toast('Membro removido da equipe','success');
      this.render();
    });
  },

  openMembroModal(p=null) {
    UI.modal({
      title: p ? 'Editar Membro' : 'Novo Membro',
      body: `
        <form id="membroForm" class="form-grid">
          <div class="field full"><label>Nome *</label><input name="nome" required value="${escapeHTML(p?.nome||'')}"/></div>
          <div class="field full"><label>Função</label><input name="cargo" placeholder="Ex: Dev, Consultor, Squad Lead" value="${escapeHTML(p?.cargo||'')}"/></div>
          <div class="field full"><label>Email</label><input name="email" type="email" placeholder="nome@empresa.com" value="${escapeHTML(p?.email||'')}"/></div>
        </form>`,
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveMembro"><i class="fa-solid fa-check"></i> Salvar</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelector('#saveMembro').onclick = () => {
          const data = UI.readForm(root.querySelector('#membroForm'));
          if (!data.nome) return UI.toast('Nome obrigatório','warn');
          const email = (data.email||'').trim() || p?.email || `${data.nome.toLowerCase().replace(/[^a-z]/g,'.')}@empresa.com`;
          Store.upsert('equipe', { id: p?.id, ...data, email });
          close(); UI.toast('Membro salvo','success'); this.render();
        };
      }
    });
  },

  /* ================== RELATÓRIOS ================== */
  render_relatorios(root) {
    const dems = Store.demandas();
    const porCliente = {};
    dems.forEach(d => {
      const c = Store.cliente(d.clienteId); const n = c?.empresa||'—';
      porCliente[n] = (porCliente[n]||0)+1;
    });
    const porResp = {};
    dems.forEach(d => {
      const p = Store.pessoa(d.responsavelId); const n = p?.nome||'—';
      porResp[n] = (porResp[n]||0)+1;
    });
    const tempoMedio = (() => {
      const t = dems.reduce((s,d)=>s+(d.tempoGasto||0),0);
      return dems.length ? (t/dems.length).toFixed(1) : 0;
    })();
    const projsConcl = Store.projetos().filter(p=>p.status==='concluido').length;
    const projsAtr = Store.projetos().filter(p=> p.prazo && new Date(p.prazo) < today() && p.status!=='concluido').length;

    const table = (rows) => `<table class="report-table"><thead><tr><th>Nome</th><th>Total</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHTML(r[0])}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Relatórios</h1><div class="page-subtitle">Indicadores consolidados.</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="btnPdf"><i class="fa-solid fa-file-pdf"></i> Exportar PDF</button>
          <button class="btn" id="btnCsv"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Tempo médio (h)</div><div class="kpi-value">${tempoMedio}</div></div>
        <div class="kpi"><div class="kpi-label">Projetos concluídos</div><div class="kpi-value">${projsConcl}</div></div>
        <div class="kpi"><div class="kpi-label">Projetos atrasados</div><div class="kpi-value">${projsAtr}</div></div>
        <div class="kpi"><div class="kpi-label">Total de demandas</div><div class="kpi-value">${dems.length}</div></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card col-6"><h3>Demandas por Cliente</h3><div class="table-wrap">${table(Object.entries(porCliente).sort((a,b)=>b[1]-a[1]))}</div></div>
        <div class="chart-card col-6"><h3>Demandas por Executante</h3><div class="table-wrap">${table(Object.entries(porResp).sort((a,b)=>b[1]-a[1]))}</div></div>
      </div>`;
    $('#btnPdf').onclick = () => this.exportRelatorioPDF();
    $('#btnCsv').onclick = () => this.exportDemandsCSV();
  },

  /* ================== CONFIG ================== */
  render_config(root) {
    root.innerHTML = `
      <div class="page-header"><div><h1 class="page-title">Configurações</h1><div class="page-subtitle">Preferências do sistema.</div></div></div>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Aparência</div>
          <p style="color:var(--text-2);font-size:13px;">Alternar entre tema claro e escuro.</p>
          <button class="btn" onclick="App.toggleTheme()"><i class="fa-solid fa-circle-half-stroke"></i> Alternar tema</button>
        </div>
        <div class="kpi">
          <div class="kpi-label">Dados</div>
          <p style="color:var(--text-2);font-size:13px;">Regenerar dados de exemplo.</p>
          <button class="btn btn-danger" onclick="UI.confirm('Resetar','Regenerar todos os dados?',()=>{Store.reset();App.render();UI.toast('Dados regenerados','success');})">Resetar dados</button>
        </div>
        <div class="kpi">
          <div class="kpi-label">Backup</div>
          <p style="color:var(--text-2);font-size:13px;">Baixe uma cópia completa em JSON.</p>
          <button class="btn" onclick="download('flowdesk-backup.json', JSON.stringify(Store.state,null,2), 'application/json')"><i class="fa-solid fa-download"></i> Backup JSON</button>
        </div>
      </div>
    `;
  },

  /* ================== SORT / EXPORT / IMPORT ================== */
  toggleSort(col) {
    if (this.sort.col === col) this.sort.dir *= -1;
    else { this.sort.col = col; this.sort.dir = 1; }
  },
  applySort(list) {
    const { col, dir } = this.sort; if (!col) return;
    list.sort((a,b) => {
      const va = a[col]||''; const vb = b[col]||'';
      if (va < vb) return -1*dir; if (va > vb) return 1*dir; return 0;
    });
  },

  exportDemandsCSV() {
    const rows = Store.demandas().map(d => ({
      titulo:d.titulo, projeto:Store.projeto(d.projetoId)?.nome||'',
      cliente:Store.cliente(d.clienteId)?.empresa||'', responsavel:Store.pessoa(d.responsavelId)?.nome||'',
      equipe:EQUIPE_AREA[d.equipeArea]?.label||'',
      status:STATUS[d.status]?.label, prioridade:PRIORIDADE[d.prioridade]?.label,
      criacao:fmtDate(d.criacao), prazo:fmtDate(d.prazo), tempoGasto:d.tempoGasto,
      tags:(d.tags||[]).join(', ')
    }));
    download('demandas.csv', toCSV(rows), 'text/csv'); UI.toast('CSV exportado','success');
  },
  exportClientesCSV() {
    const rows = Store.clientes().map(c => ({
      nome: c.nome||'', empresa: c.empresa||'', contato: c.contato||'',
      telefone: c.telefone||'', email: c.email||'', cidade: c.cidade||'', obs: c.obs||''
    }));
    download('clientes.csv', toCSV(rows), 'text/csv'); UI.toast('CSV exportado','success');
  },
  exportEquipeCSV() {
    const rows = Store.equipe().map(p => ({
      nome: p.nome||'', cargo: p.cargo||'', email: p.email||''
    }));
    download('equipe.csv', toCSV(rows), 'text/csv'); UI.toast('CSV exportado','success');
  },
  exportProjetosCSV() {
    const rows = Store.projetos().map(p => ({
      nome:p.nome, cliente:Store.cliente(p.clienteId)?.empresa||'',
      responsavel:Store.pessoa(p.responsavelId)?.nome||'',
      inicio:fmtDate(p.inicio), prazo:fmtDate(p.prazo),
      status:STATUS[p.status]?.label, prioridade:PRIORIDADE[p.prioridade]?.label
    }));
    download('projetos.csv', toCSV(rows), 'text/csv'); UI.toast('CSV exportado','success');
  },
  importCSV(target) {
    const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const rows = parseCSV(String(r.result));
        let n = 0, atualizados = 0, ignorados = 0;
        rows.forEach(row => {
          if (target === 'demandas') {
            const titulo = (row.titulo||'').trim();
            if (!titulo) { ignorados++; return; }

            // Resolve cliente pelo nome da empresa (cria se não existir)
            const clienteNome = (row.cliente||'').trim();
            let clienteId = '';
            if (clienteNome) {
              let cli = Store.clientes().find(c => (c.empresa||'').trim().toLowerCase() === clienteNome.toLowerCase());
              if (!cli) {
                cli = { id: uid('c'), nome:'', empresa: clienteNome, contato:'', telefone:'', email:'', cidade:'', obs:'', createdAt: new Date().toISOString() };
                Store.upsert('clientes', cli);
              }
              clienteId = cli.id;
            }

            // Resolve projeto pelo nome (cria se não existir, vinculado ao cliente)
            const projetoNome = (row.projeto||'').trim();
            let projetoId = '';
            if (projetoNome) {
              let proj = Store.projetos().find(p => (p.nome||'').trim().toLowerCase() === projetoNome.toLowerCase());
              if (!proj) {
                proj = { id: uid('p'), nome: projetoNome, clienteId, responsavelId:'', inicio:'', prazo:'', status:'backlog', prioridade:'normal', equipeIds:[] };
                Store.upsert('projetos', proj);
              }
              projetoId = proj.id;
            }

            // Resolve responsável pelo nome (cria se não existir)
            const respNome = (row.responsavel||'').trim();
            let responsavelId = '';
            if (respNome) {
              let pessoa = Store.equipe().find(e => (e.nome||'').trim().toLowerCase() === respNome.toLowerCase());
              if (!pessoa) {
                pessoa = { id: uid('u'), nome: respNome, cargo:'', email:'' };
                Store.upsert('equipe', pessoa);
              }
              responsavelId = pessoa.id;
            }

            // Resolve status pelo label (padrão: backlog)
            const statusLabel = (row.status||'').trim().toLowerCase();
            const statusCode = STATUS_ORDER.find(s => STATUS[s].label.toLowerCase() === statusLabel) || 'backlog';

            // Resolve prioridade pelo label (padrão: normal)
            const prioLabel = (row.prioridade||'').trim().toLowerCase();
            const prioCode = Object.keys(PRIORIDADE).find(p => PRIORIDADE[p].label.toLowerCase() === prioLabel) || 'normal';

            // Resolve equipe pelo label (padrão: vazio)
            const equipeLabel = (row.equipe||'').trim().toLowerCase();
            const equipeArea = Object.keys(EQUIPE_AREA).find(e => EQUIPE_AREA[e].label.toLowerCase() === equipeLabel) || '';

            // Converte datas dd/mm/aaaa para ISO
            const parseBRDate = (s) => {
              s = (s||'').trim(); if (!s || s === '—') return '';
              const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (!m) return '';
              return `${m[3]}-${m[2]}-${m[1]}`;
            };
            const criacao = parseBRDate(row.criacao) || new Date().toISOString();
            const prazo = parseBRDate(row.prazo);

            const tags = (row.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
            const tempoGasto = parseFloat(row.tempoGasto) || 0;

            // Evita duplicar: casa por título + cliente + prazo já cadastrados
            const existente = Store.demandas().find(d =>
              (d.titulo||'').trim().toLowerCase() === titulo.toLowerCase() &&
              d.clienteId === clienteId &&
              (d.prazo ? isoDay(d.prazo) : '') === prazo
            );

            const registro = {
              id: existente?.id || uid('d'),
              titulo, projetoId, clienteId, responsavelId,
              equipeArea: equipeArea || existente?.equipeArea || '',
              status: statusCode, prioridade: prioCode,
              criacao, prazo, tempoGasto, tags,
              descricao: existente?.descricao || '',
              checklist: existente?.checklist || [],
              comentarios: existente?.comentarios || []
            };
            Store.upsert('demandas', registro);
            existente ? atualizados++ : n++;
          } else if (target === 'clientes') {
            const nome = (row.nome||'').trim();
            const empresa = (row.empresa||'').trim();
            const email = (row.email||'').trim();
            if (!nome && !empresa) { ignorados++; return; }
            // Evita duplicar: casa por e-mail, ou por nome+empresa já cadastrados
            const existente = Store.clientes().find(c =>
              (email && (c.email||'').trim().toLowerCase() === email.toLowerCase()) ||
              ((c.nome||'').trim() === nome && (c.empresa||'').trim() === empresa)
            );
            const registro = {
              id: existente?.id || uid('c'),
              nome, empresa, contato: (row.contato||'').trim(),
              telefone: (row.telefone||'').trim(), email,
              cidade: (row.cidade||'').trim(), obs: (row.obs||'').trim(),
              createdAt: existente?.createdAt || new Date().toISOString()
            };
            Store.upsert('clientes', registro);
            existente ? atualizados++ : n++;
          } else if (target === 'projetos') {
            const nome = (row.nome||row.projeto||'').trim();
            if (!nome) { ignorados++; return; }

            // Resolve cliente pelo nome da empresa (cria se não existir)
            const clienteNome = (row.cliente||row.empresa||'').trim();
            let clienteId = '';
            if (clienteNome) {
              let cli = Store.clientes().find(c => (c.empresa||'').trim().toLowerCase() === clienteNome.toLowerCase());
              if (!cli) {
                cli = { id: uid('c'), nome:'', empresa: clienteNome, contato:'', telefone:'', email:'', cidade:'', obs:'', createdAt: new Date().toISOString() };
                Store.upsert('clientes', cli);
              }
              clienteId = cli.id;
            }

            // Resolve responsável pelo nome (cria se não existir)
            const respNome = (row.responsavel||'').trim();
            let responsavelId = '';
            if (respNome) {
              let pessoa = Store.equipe().find(e => (e.nome||'').trim().toLowerCase() === respNome.toLowerCase());
              if (!pessoa) {
                pessoa = { id: uid('u'), nome: respNome, cargo:'', email:'' };
                Store.upsert('equipe', pessoa);
              }
              responsavelId = pessoa.id;
            }

            // Resolve status pelo label (padrão: backlog)
            const statusLabel = (row.status||'').trim().toLowerCase();
            const statusCode = STATUS_ORDER.find(s => s!=='atrasado' && STATUS[s].label.toLowerCase() === statusLabel) || 'backlog';

            // Resolve prioridade pelo label (padrão: normal)
            const prioLabel = (row.prioridade||'').trim().toLowerCase();
            const prioCode = Object.keys(PRIORIDADE).find(p => PRIORIDADE[p].label.toLowerCase() === prioLabel) || 'normal';

            // Converte datas dd/mm/aaaa para ISO
            const parseBRDate = (s) => {
              s = (s||'').trim(); if (!s || s === '—') return '';
              const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (!m) return '';
              return `${m[3]}-${m[2]}-${m[1]}`;
            };
            const inicio = parseBRDate(row.inicio);
            const prazo = parseBRDate(row.prazo);

            // Evita duplicar: casa por nome + cliente já cadastrados
            const existente = Store.projetos().find(p =>
              (p.nome||'').trim().toLowerCase() === nome.toLowerCase() &&
              p.clienteId === clienteId
            );

            const registro = {
              id: existente?.id || uid('p'),
              nome, clienteId, responsavelId,
              inicio, prazo, status: statusCode, prioridade: prioCode,
              descricao: (row.descricao||'').trim() || existente?.descricao || '',
              obs: (row.obs||'').trim() || existente?.obs || '',
              equipeIds: existente?.equipeIds || []
            };
            Store.upsert('projetos', registro);
            existente ? atualizados++ : n++;
          } else if (target === 'equipe') {
            const nome = (row.nome||'').trim();
            const email = (row.email||'').trim();
            if (!nome) { ignorados++; return; }
            // Evita duplicar: casa por e-mail, ou por nome já cadastrado
            const existente = Store.equipe().find(e =>
              (email && (e.email||'').trim().toLowerCase() === email.toLowerCase()) ||
              (e.nome||'').trim().toLowerCase() === nome.toLowerCase()
            );
            const registro = {
              id: existente?.id || uid('u'),
              nome, cargo: (row.cargo||'').trim(),
              email: email || existente?.email || `${nome.toLowerCase().replace(/[^a-z]/g,'.')}@empresa.com`
            };
            Store.upsert('equipe', registro);
            existente ? atualizados++ : n++;
          }
        });
        const partes = [];
        if (n) partes.push(`${n} novo(s)`);
        if (atualizados) partes.push(`${atualizados} atualizado(s)`);
        if (ignorados) partes.push(`${ignorados} ignorado(s) sem nome/empresa`);
        UI.toast(partes.length ? partes.join(', ') : 'Nenhum registro importado', 'success');
        this.render();
      };
      r.readAsText(f);
    };
    inp.click();
  },
  exportDashboardPDF() {
    const dems = Store.demandas();
    const body = `<h2>Resumo</h2>
      <p>Clientes: ${Store.clientes().length} | Projetos: ${Store.projetos().length} | Demandas: ${dems.length}</p>
      <table><thead><tr><th>Título</th><th>Cliente</th><th>Status</th><th>Prazo</th></tr></thead>
      <tbody>${dems.slice(0,50).map(d=>`<tr><td>${escapeHTML(d.titulo)}</td><td>${escapeHTML(Store.cliente(d.clienteId)?.empresa||'')}</td><td>${STATUS[d.status]?.label}</td><td>${fmtDate(d.prazo)}</td></tr>`).join('')}</tbody></table>`;
    exportPDF('FlowDesk — Dashboard', body);
  },
  exportRelatorioPDF() {
    const dems = Store.demandas();
    const body = `<h2>Relatório de Demandas</h2>
      <table><thead><tr><th>Título</th><th>Cliente</th><th>Executante</th><th>Status</th><th>Prazo</th><th>Tempo (h)</th></tr></thead>
      <tbody>${dems.map(d=>`<tr><td>${escapeHTML(d.titulo)}</td><td>${escapeHTML(Store.cliente(d.clienteId)?.empresa||'')}</td><td>${escapeHTML(Store.pessoa(d.responsavelId)?.nome||'')}</td><td>${STATUS[d.status]?.label}</td><td>${fmtDate(d.prazo)}</td><td>${d.tempoGasto||0}</td></tr>`).join('')}</tbody></table>`;
    exportPDF('FlowDesk — Relatório', body);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
