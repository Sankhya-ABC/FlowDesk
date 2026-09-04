/* ============ FlowDesk — App Controller ============ */

const App = {
  view: 'dashboard',
  filters: {
    demandas: { id:'', q:'', cliente:'', projeto:'', responsavel:'', equipe:'', status:'', prioridade:'', data:'' },
    ordensServico: { q:'', cliente:'', demanda:'', status:'', responsavel:'', dataIni:'', dataFim:'', modo:'lista' },
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
    OSStore.load();
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

  // Abre Demandas já filtradas por um projeto específico (usado a partir da lista de Projetos)
  goProjetoDemandas(projetoId) {
    Object.assign(this.filters.demandas, { id:'', q:'', cliente:'', projeto:projetoId, responsavel:'', equipe:'', status:'', prioridade:'', data:'' });
    this.go('demandas');
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
      const n = nomeResponsavel(d) || 'Sem executante';
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
          <td>${escapeHTML(c.nome)}<div style="color:var(--text-2);font-size:11px">${escapeHTML(maskPhone(c.telefone||''))}</div></td>
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
        attachPhoneMask(root.querySelector('#clienteTelefone'));
        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelector('#saveCli').onclick = () => {
          const data = UI.readForm(root.querySelector('#clienteForm'));
          if (!data.nome) return UI.toast('Nome obrigatório','warn');
          if (!data.empresa) return UI.toast('Empresa obrigatória','warn');
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
          ${f.cliente ? `<button class="icon-btn" id="clienteClear" title="Limpar filtro"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
      </div>
      <div id="c360Body"></div>`;

    // Re-renderiza só a Área do Cliente (sem sair pra outra rota), usado pelas
    // sub-telas embutidas (Demandas/Kanban/Calendário) no lugar de this.render().
    const rerenderC360 = () => this.render_cliente360(root);

    $('#clienteSelect').onchange = e => { f.cliente = e.target.value; rerenderC360(); };
    const clearBtn = $('#clienteClear');
    if (clearBtn) clearBtn.onclick = () => { f.cliente = ''; rerenderC360(); };

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
        <div class="page-header" style="margin-bottom:10px;">
          <div></div>
          <button class="btn btn-primary" id="btnCronograma"><i class="fa-solid fa-timeline"></i> Gerar Cronograma</button>
        </div>
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
                <div style="font-size:12px;color:var(--text-2)">${escapeHTML(c.contato||'')} ${c.email?'· '+escapeHTML(c.email):''} ${c.telefone?'· '+escapeHTML(maskPhone(c.telefone)):''}</div>
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
      $('#btnCronograma').onclick = () => this.exportCronogramaCliente(f.cliente, projetos, demandas);
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
      // O filtro isolado é mantido entre re-renders (this.cliente360Filters.demandas),
      // senão qualquer mudança feita pelo usuário (projeto, status, etc.) seria
      // descartada no próximo redraw, que reconstrói `f` a partir do zero.
      if (!this.cliente360Filters) this.cliente360Filters = {};
      if (!this.cliente360Filters.demandas) this.cliente360Filters.demandas = { id:'', q:'', cliente:'', projeto:'', responsavel:'', equipe:'', status:'', prioridade:'', data:'' };
      if (this.cliente360Filters.demandas.cliente !== f.cliente) {
        this.cliente360Filters.demandas = { id:'', q:'', cliente:f.cliente, projeto:'', responsavel:'', equipe:'', status:'', prioridade:'', data:'' };
      }
      const backup = this.filters.demandas;
      this.filters.demandas = this.cliente360Filters.demandas;
      pane.innerHTML = `<div id="c360DemPane"></div>`;
      this.render_demandas($('#c360DemPane'), rerenderC360);
      this.filters.demandas = backup;
      return;
    }

    if (this.cliente360Tab === 'kanban') {
      if (!this.cliente360Filters) this.cliente360Filters = {};
      if (!this.cliente360Filters.kanban) this.cliente360Filters.kanban = { q:'', cliente:f.cliente, projeto:'', responsavel:'', equipe:'', prioridade:'' };
      this.cliente360Filters.kanban.cliente = f.cliente;
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
      this.cliente360Filters.calendario.cliente = f.cliente;
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

  /* ================== ORDENS DE SERVIÇO ================== */
  readOSApontamentos(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('[data-os-apontamento]')).map((card) => {
      const out = {};
      card.querySelectorAll('[data-key]').forEach(el => { out[el.dataset.key] = el.value; });
      return out;
    });
  },

  renderOSApontamentos(container, list) {
    if (!container) return;
    const rows = Array.isArray(list) && list.length ? list : [{}];
    container.innerHTML = rows.map((a,i) => UI.osApontamentoCard(a, i)).join('');
    container.querySelectorAll('.os-remove-apontamento').forEach(btn => {
      btn.onclick = () => {
        const atual = this.readOSApontamentos(container);
        const index = Number(btn.closest('[data-os-apontamento]')?.dataset.osApontamento);
        if (atual.length <= 1 || !Number.isInteger(index)) return;
        atual.splice(index, 1);
        this.renderOSApontamentos(container, atual);
      };
    });
  },

  osResumo(os) {
    const apont = Array.isArray(os?.apontamentos) ? os.apontamentos : [];
    const minutos = apont.reduce((total, a) => {
      if (!a.horaInicial || !a.horaFinal) return total;
      const [hi,mi] = a.horaInicial.split(':').map(Number);
      const [hf,mf] = a.horaFinal.split(':').map(Number);
      let d = (hf*60+mf) - (hi*60+mi) - Number(a.intervalo||0);
      if (d < 0) d += 24*60;
      return total + Math.max(0, d);
    }, 0);
    const previsto = Number(os?.tempoPrevisto||0);
    const saldo = previsto - minutos;
    return { apontamentos: apont.length, minutos, previsto, saldo, consumo: previsto > 0 ? (minutos/previsto)*100 : null };
  },

  osStatusLabel(s) {
    return (typeof osStatusLabelMap !== 'undefined' && osStatusLabelMap[s])
      ? osStatusLabelMap[s]
      : (s || '<SEM DESCRICAO SLA>');
  },

  osFormatHours(mins) {
    const n = Math.max(0, Number(mins)||0);
    return `${Math.floor(n/60)}h ${String(n%60).padStart(2,'0')}min`;
  },

  osAgendaEntry(os) {
    const apont = Array.isArray(os.apontamentos) ? os.apontamentos : [];
    const d = Store.demanda(os.demandaId);
    const cli = Store.cliente(os.clienteId || d?.clienteId);
    const resp = os.responsavelId ? Store.pessoa(os.responsavelId) : null;
    const fallbackExec = os.responsavelNome || resp?.nome || 'Sem executante';
    const entries=[];
    const addEntry=(a,idx)=>{
      let date=a.dataExecucao||'', start=a.horaInicial||'', end=a.horaFinal||'';
      if(a.agendamento){ const dt=new Date(a.agendamento); if(!isNaN(dt)){ date=date||isoDay(dt); start=start||dt.toTimeString().slice(0,5); } }
      if(!date) return;
      const sm=start?Number(start.slice(0,2))*60+Number(start.slice(3,5)):0;
      let em=end?Number(end.slice(0,2))*60+Number(end.slice(3,5)):sm+60;
      if(em<=sm) em=sm+60;
      const ex=a.executanteId?Store.pessoa(a.executanteId):null;
      entries.push({os,idx,date,start:start||'—',end:end||'—',startMin:sm,endMin:em,executanteId:a.executanteId||os.responsavelId||'',exec:a.executanteNome||ex?.nome||fallbackExec,cliente:cli?.empresa||'—',demanda:d?.titulo||'—'});
    };
    if(apont.length) apont.forEach(addEntry);
    return entries;
  },

  osAllAgendaEntries(list) { return list.flatMap(os=>this.osAgendaEntry(os)); },

  osConflictEntries(target, ignoreOsId='') {
    if(!target?.responsavelId || target.responsavelId==='__novo' || !target.date || !target.start) return [];
    const [h,m]=target.start.split(':').map(Number); const st=h*60+m;
    let en=st+60;
    if(target.end){ const [eh,em]=target.end.split(':').map(Number); en=eh*60+em; if(en<=st) en+=24*60; }
    return this.osAllAgendaEntries(OSStore.all()).filter(e=>e.os.id!==ignoreOsId && e.executanteId===target.responsavelId && e.date===target.date && st < e.endMin-1 && en > e.startMin+1);
  },

  renderOSAgenda(root, entries, modo) {
    const f=this.filters.ordensServico;
    const base=f.dataIni?parseLocalDate(f.dataIni):today(); base.setHours(0,0,0,0);
    const days=modo==='dia'?[base]:Array.from({length:7},(_,i)=>addDays(base,(1-(base.getDay()||7))+i));
    const dayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const byDay={}; entries.forEach(e=>(byDay[e.date]??=[]).push(e));
    root.innerHTML=`<div class="os-agenda-head"><div><strong>${modo==='dia'?fmtDate(days[0]):`${fmtDate(days[0])} — ${fmtDate(days[6])}`}</strong><span>${entries.length} atendimento(s) no período</span></div><div class="os-agenda-actions"><button class="btn btn-sm" id="osAgendaPrev"><i class="fa-solid fa-chevron-left"></i></button><button class="btn btn-sm" id="osAgendaToday">Hoje</button><button class="btn btn-sm" id="osAgendaNext"><i class="fa-solid fa-chevron-right"></i></button></div></div><div class="os-agenda-grid ${modo==='dia'?'single-day':''}">${days.map(day=>{const key=isoDay(day),list=(byDay[key]||[]).sort((a,b)=>a.startMin-b.startMin);return `<div class="os-agenda-day"><div class="os-agenda-day-head"><span>${dayNames[day.getDay()]}</span><strong>${day.getDate()}</strong><small>${fmtDate(day)}</small></div><div class="os-agenda-slots">${list.length?list.map(e=>`<button class="os-agenda-card" data-os-agenda-id="${e.os.id}"><span class="os-agenda-time">${escapeHTML(e.start)}${e.end!=='—'?` — ${escapeHTML(e.end)}`:''}</span><strong>OS-${Number(e.os.numero||0).toString().padStart(5,'0')}</strong><span>${escapeHTML(e.cliente)}</span><span>${escapeHTML(e.exec)}</span><small>${escapeHTML(e.demanda)}</small>${UI.osStatusPill(e.os.statusOs)}</button>`).join(''):`<div class="os-agenda-empty"><i class="fa-regular fa-calendar"></i><span>Sem atendimentos</span></div>`}</div></div>`;}).join('')}</div>`;
    root.querySelectorAll('[data-os-agenda-id]').forEach(b=>b.onclick=()=>this.openOSDrawer(b.dataset.osAgendaId));
    root.querySelector('#osAgendaPrev').onclick=()=>{f.dataIni=isoDay(addDays(base,modo==='dia'?-1:-7));f.dataFim=f.dataIni;this.render();};
    root.querySelector('#osAgendaNext').onclick=()=>{f.dataIni=isoDay(addDays(base,modo==='dia'?1:7));f.dataFim=f.dataIni;this.render();};
    root.querySelector('#osAgendaToday').onclick=()=>{f.dataIni=isoDay(today());f.dataFim=f.dataIni;this.render();};
  },

  render_ordensServico(root) {
    const f=this.filters.ordensServico, all=OSStore.all();
    const empresas=[...new Set(all.map(os=>Store.cliente(os.clienteId)?.empresa).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const demandas=Store.demandas().slice().sort((a,b)=>(a.titulo||'').localeCompare(b.titulo||'','pt-BR'));
    const cliOpts=empresas.map(emp=>`<option value="${escapeHTML(emp)}" ${f.cliente===emp?'selected':''}>${escapeHTML(emp)}</option>`).join('');
    const demOpts=demandas.map(d=>`<option value="${d.id}" ${f.demanda===d.id?'selected':''}>#${Store.demandaSeq(d.id)} — ${escapeHTML(d.titulo)}</option>`).join('');
    const stOpts=OS_STATUS_OPTIONS.map(o=>`<option value="${o.value}" ${f.status===o.value?'selected':''}>${escapeHTML(o.label)}</option>`).join('');
    const respOpts=Store.equipe().slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR')).map(p=>`<option value="${escapeHTML(p.id)}" ${f.responsavel===p.id?'selected':''}>${escapeHTML(p.nome)}</option>`).join('');
    root.innerHTML=`<div class="page-header"><div><h1 class="page-title">Ordens de Serviço</h1><div class="page-subtitle">Gestão operacional, agenda, horas e acompanhamento das OS.</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="btnOSRefresh"><i class="fa-solid fa-rotate"></i> Atualizar</button><button class="btn btn-primary" id="btnNovaOS"><i class="fa-solid fa-plus"></i> Nova OS</button></div></div>
    <div class="kpi-grid os-kpi-grid"><div class="kpi"><div class="kpi-head"><div class="kpi-label">Total</div><div class="kpi-icon" style="background:var(--primary)"><i class="fa-solid fa-screwdriver-wrench"></i></div></div><div class="kpi-value" id="osKpiTotal">0</div><div class="kpi-hint">OS cadastradas</div></div><div class="kpi"><div class="kpi-head"><div class="kpi-label">Em andamento</div><div class="kpi-icon" style="background:var(--info)"><i class="fa-solid fa-spinner"></i></div></div><div class="kpi-value" id="osKpiAndamento">0</div><div class="kpi-hint">Atendimento em execução</div></div><div class="kpi"><div class="kpi-head"><div class="kpi-label">Agendadas</div><div class="kpi-icon" style="background:var(--warning)"><i class="fa-solid fa-calendar-check"></i></div></div><div class="kpi-value" id="osKpiAgendadas">0</div><div class="kpi-hint">Atendimentos com horário</div></div><div class="kpi"><div class="kpi-head"><div class="kpi-label">Sem apontamento</div><div class="kpi-icon" style="background:var(--danger)"><i class="fa-regular fa-clock"></i></div></div><div class="kpi-value" id="osKpiSemApontamento">0</div><div class="kpi-hint">OS abertas sem horas</div></div><div class="kpi"><div class="kpi-head"><div class="kpi-label">Horas realizadas</div><div class="kpi-icon" style="background:var(--success)"><i class="fa-solid fa-stopwatch"></i></div></div><div class="kpi-value" id="osKpiHoras">0h</div><div class="kpi-hint">Tempo apontado</div></div><div class="kpi"><div class="kpi-head"><div class="kpi-label">Concluídas</div><div class="kpi-icon" style="background:var(--success)"><i class="fa-solid fa-check"></i></div></div><div class="kpi-value" id="osKpiConcluidas">0</div><div class="kpi-hint">OS encerradas</div></div></div>
    <div class="os-alerts" id="osAlerts"></div>
    <div class="toolbar os-toolbar"><input id="osFq" placeholder="Pesquisar OS, demanda, cliente, executante..." value="${escapeHTML(f.q)}" style="min-width:240px;flex:1"/><select id="osFcli"><option value="">Todos clientes</option>${cliOpts}</select><select id="osFdem"><option value="">Todas demandas</option>${demOpts}</select><select id="osFresp"><option value="">Todos executantes</option>${respOpts}</select><select id="osFstatus"><option value="">Todos status</option>${stOpts}</select><label class="os-date-filter"><span>De</span><input type="date" id="osFini" value="${escapeHTML(f.dataIni||'')}"></label><label class="os-date-filter"><span>Até</span><input type="date" id="osFfim" value="${escapeHTML(f.dataFim||'')}"></label><div class="os-view-switch"><button class="btn btn-sm ${f.modo==='lista'?'btn-primary':''}" id="osModoLista"><i class="fa-solid fa-list"></i> Lista</button><button class="btn btn-sm ${f.modo==='semana'?'btn-primary':''}" id="osModoSemana"><i class="fa-solid fa-calendar-week"></i> Semana</button><button class="btn btn-sm ${f.modo==='dia'?'btn-primary':''}" id="osModoDia"><i class="fa-solid fa-calendar-day"></i> Dia</button></div></div><div id="osMainContent"></div>`;

    const isMatch=os=>{const q=(f.q||'').trim().toLowerCase(),d=Store.demanda(os.demandaId),cli=Store.cliente(os.clienteId),resp=os.responsavelId?Store.pessoa(os.responsavelId):null,hay=[os.numero,d?.titulo,cli?.empresa,os.responsavelNome,resp?.nome,this.osStatusLabel(os.statusOs),os.contrato,os.ambiente,os.origem,os.centroResultado].map(v=>String(v||'').toLowerCase()).join(' ');if(q&&!hay.includes(q))return false;if(f.cliente&&(cli?.empresa||'')!==f.cliente)return false;if(f.demanda&&os.demandaId!==f.demanda)return false;if(f.responsavel&&os.responsavelId!==f.responsavel)return false;if(f.status&&os.statusOs!==f.status)return false;if(f.dataIni||f.dataFim){const ds=this.osAgendaEntry(os).map(e=>e.date).filter(Boolean);const vals=ds.length?ds:(os.dataLimite?[isoDay(os.dataLimite)]:[]);if(vals.length&&!vals.some(dt=>(!f.dataIni||dt>=f.dataIni)&&(!f.dataFim||dt<=f.dataFim)))return false;}return true;};
    const filtered=all.filter(isMatch).sort((a,b)=>Number(b.numero||0)-Number(a.numero||0));
    const totals=all.reduce((acc,os)=>{const r=this.osResumo(os),entries=this.osAgendaEntry(os);acc.total++;acc.andamento+=os.statusOs==='em_andamento'?1:0;acc.agendadas+=entries.length;acc.semApontamento+=!r.minutos&&!['concluido','cancelado'].includes(os.statusOs)?1:0;acc.minutos+=r.minutos;acc.concluidas+=['concluido','solucionado'].includes(os.statusOs)?1:0;return acc;},{total:0,andamento:0,agendadas:0,semApontamento:0,minutos:0,concluidas:0});
    $('#osKpiTotal').textContent=totals.total;$('#osKpiAndamento').textContent=totals.andamento;$('#osKpiAgendadas').textContent=totals.agendadas;$('#osKpiSemApontamento').textContent=totals.semApontamento;$('#osKpiHoras').textContent=this.osFormatHours(totals.minutos).replace('min','').trim();$('#osKpiConcluidas').textContent=totals.concluidas;
    const overdue=all.filter(os=>os.dataLimite&&isoDay(os.dataLimite)<isoDay(today())&&!['concluido','cancelado'].includes(os.statusOs)); const noLogs=all.filter(os=>!this.osResumo(os).minutos&&!['concluido','cancelado'].includes(os.statusOs)); const entries=this.osAllAgendaEntries(all); const conflicts=[]; entries.forEach(e=>entries.forEach(x=>{if(x===e||!e.os.responsavelId||e.os.responsavelId!==x.os.responsavelId||e.date!==x.date)return;if(e.startMin<x.endMin-1&&e.endMin>x.startMin+1&&!conflicts.some(c=>c.a===e&&c.b===x))conflicts.push({a:e,b:x});}));
    const alerts=[];if(overdue.length)alerts.push(`<div class="os-alert danger"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>${overdue.length} OS em atraso</strong><span>Data limite vencida.</span></div><button class="btn btn-sm" data-alert="overdue">Ver</button></div>`);if(noLogs.length)alerts.push(`<div class="os-alert warn"><i class="fa-regular fa-clock"></i><div><strong>${noLogs.length} OS sem apontamento</strong><span>OS abertas sem horas realizadas.</span></div><button class="btn btn-sm" data-alert="nolog">Ver</button></div>`);if(conflicts.length)alerts.push(`<div class="os-alert danger"><i class="fa-solid fa-calendar-xmark"></i><div><strong>${conflicts.length} conflito(s) de agenda</strong><span>Mesmo executante em horários sobrepostos.</span></div><button class="btn btn-sm" data-alert="conflict">Abrir agenda</button></div>`);$('#osAlerts').innerHTML=alerts.join('');

    const main=$('#osMainContent');
    if(f.modo!=='lista'){const entriesFiltered=this.osAllAgendaEntries(filtered);this.renderOSAgenda(main,entriesFiltered,f.modo);}
    else {main.innerHTML=`<div class="table-wrap"><table><thead><tr><th>OS</th><th>Demanda</th><th>Cliente</th><th>Executante</th><th>Apont.</th><th>Status</th><th>Data limite</th><th>Agenda</th><th>Sankhya</th><th style="width:126px"></th></tr></thead><tbody id="osTbody"></tbody></table></div>`;const tb=$('#osTbody');if(!filtered.length)tb.innerHTML=`<tr><td colspan="10">${UI.emptyState('screwdriver-wrench','Nenhuma OS encontrada.')}</td></tr>`;else tb.innerHTML=filtered.map(os=>{const d=Store.demanda(os.demandaId),cli=Store.cliente(os.clienteId),resp=os.responsavelId?Store.pessoa(os.responsavelId):null,exec=os.responsavelNome||resp?.nome||'—',r=this.osResumo(os),ag=this.osAgendaEntry(os),sk=os.sankhya?.status==='enviado'?'<span class="pill">Enviada</span>':'<span class="pill">Pendente</span>';return `<tr><td><strong class="os-table-id">OS-${Number(os.numero||0).toString().padStart(5,'0')}</strong></td><td><strong style="cursor:pointer" data-a="open" data-id="${os.id}">${escapeHTML(d?.titulo||'Demanda removida')}</strong><div class="os-table-muted">#${Store.demandaSeq(os.demandaId)||'—'}</div></td><td>${escapeHTML(cli?.empresa||'—')}</td><td>${escapeHTML(exec)}</td><td><span class="pill">${r.apontamentos}</span>${r.minutos?`<div class="os-table-muted">${this.osFormatHours(r.minutos)}</div>`:''}</td><td>${UI.osStatusPill(os.statusOs)}</td><td>${os.dataLimite?fmtDate(os.dataLimite):'—'}${os.horaLimite?`<div class="os-table-muted">${escapeHTML(os.horaLimite)}</div>`:''}</td><td>${ag.length?`<span class="pill">${ag.length} ag.</span>`:'—'}</td><td>${sk}</td><td><div class="row-actions"><button data-a="open" data-id="${os.id}" title="Detalhes"><i class="fa-solid fa-eye"></i></button><button data-a="edit" data-id="${os.id}" title="Editar"><i class="fa-solid fa-pen"></i></button><button class="del" data-a="del" data-id="${os.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;}).join('');tb.querySelectorAll('[data-a="open"]').forEach(b=>b.onclick=()=>this.openOSDrawer(b.dataset.id));tb.querySelectorAll('[data-a="edit"]').forEach(b=>b.onclick=()=>this.openOSModal(OSStore.get(b.dataset.id)));tb.querySelectorAll('[data-a="del"]').forEach(b=>b.onclick=()=>this.delOS(b.dataset.id));}
    $('#osFq').oninput=debounce(e=>{f.q=e.target.value;this.render();},180);$('#osFcli').onchange=e=>{f.cliente=e.target.value;this.render();};$('#osFdem').onchange=e=>{f.demanda=e.target.value;this.render();};$('#osFresp').onchange=e=>{f.responsavel=e.target.value;this.render();};$('#osFstatus').onchange=e=>{f.status=e.target.value;this.render();};$('#osFini').onchange=e=>{f.dataIni=e.target.value;if(f.dataFim&&f.dataFim<f.dataIni)f.dataFim=f.dataIni;this.render();};$('#osFfim').onchange=e=>{f.dataFim=e.target.value;this.render();};$('#osModoLista').onclick=()=>{f.modo='lista';this.render();};$('#osModoSemana').onclick=()=>{f.modo='semana';if(!f.dataIni)f.dataIni=isoDay(today());if(!f.dataFim)f.dataFim=f.dataIni;this.render();};$('#osModoDia').onclick=()=>{f.modo='dia';if(!f.dataIni)f.dataIni=isoDay(today());if(!f.dataFim)f.dataFim=f.dataIni;this.render();};$('#btnNovaOS').onclick=()=>this.openOSModal();$('#btnOSRefresh').onclick=()=>this.render();
    root.querySelectorAll('[data-alert]').forEach(btn=>btn.onclick=()=>{const t=btn.dataset.alert;if(t==='overdue'){UI.modal({title:`OS em atraso (${overdue.length})`,size:'lg',body:`<div class="dashboard-modal-list">${overdue.map(os=>{const d=Store.demanda(os.demandaId),c=Store.cliente(os.clienteId);return `<div class="dashboard-modal-item"><div><strong>OS-${Number(os.numero||0).toString().padStart(5,'0')}</strong><span>${escapeHTML(d?.titulo||'Demanda')} · ${escapeHTML(c?.empresa||'Sem cliente')} · limite ${fmtDate(os.dataLimite)}</span></div>${UI.osStatusPill(os.statusOs)}</div>`;}).join('')}</div>`,footer:'<button class="btn" data-close-modal>Fechar</button>',onOpen:(r,c)=>r.querySelector('[data-close-modal]').onclick=c});}else if(t==='nolog'){UI.modal({title:`OS sem apontamento (${noLogs.length})`,size:'lg',body:`<div class="dashboard-modal-list">${noLogs.map(os=>{const d=Store.demanda(os.demandaId),c=Store.cliente(os.clienteId);return `<div class="dashboard-modal-item"><div><strong>OS-${Number(os.numero||0).toString().padStart(5,'0')}</strong><span>${escapeHTML(d?.titulo||'Demanda')} · ${escapeHTML(c?.empresa||'Sem cliente')}</span></div>${UI.osStatusPill(os.statusOs)}</div>`;}).join('')}</div>`,footer:'<button class="btn" data-close-modal>Fechar</button>',onOpen:(r,c)=>r.querySelector('[data-close-modal]').onclick=c});}else{f.modo='semana';f.dataIni=isoDay(today());f.dataFim=f.dataIni;this.render();UI.toast('Revise os horários sobrepostos na agenda. Novos conflitos serão bloqueados ao salvar.','warn',5500);}});
  },

  openOSModal(os=null, demandaPreSelecionada='') {
    const selectedDemanda = demandaPreSelecionada || os?.demandaId || '';
    UI.modal({
      title: os ? `Editar OS-${Number(os.numero||0).toString().padStart(5,'0')}` : 'Nova Ordem de Serviço',
      size:'lg',
      body: UI.osForm(os||{}, { demandaId:selectedDemanda }),
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveOS"><i class="fa-solid fa-check"></i> ${os?'Salvar alterações':'Salvar OS'}</button>`,
      onOpen: (root, close) => {
        const form = root.querySelector('#osForm');
        const demandaSelect = form.querySelector('[name="demandaId"]');
        const respSelect = form.querySelector('[name="responsavelId"]');
        const respLivre = form.querySelector('#osResponsavelLivre');
        const clienteInput = form.querySelector('#osCliente');
        const solicitanteInput = form.querySelector('#osSolicitante');
        const apontContainer = form.querySelector('#osApontamentos');

        const fmtMin = (mins) => `${Math.floor(mins/60)}h ${mins%60}min`;
        const calcMinutes = (a) => {
          if (!a?.horaInicial || !a?.horaFinal) return 0;
          const [hi,mi] = a.horaInicial.split(':').map(Number);
          const [hf,mf] = a.horaFinal.split(':').map(Number);
          let d = (hf*60+mf) - (hi*60+mi) - Number(a.intervalo||0);
          if (d < 0) d += 24*60;
          return Math.max(0,d);
        };
        const atualizarMetricas = () => {
          const dados = this.readOSApontamentos(apontContainer);
          const mins = dados.reduce((sum,a)=>sum+calcMinutes(a),0);
          const previsto = Number(form.querySelector('[name="tempoPrevisto"]')?.value || 0);
          const pct = previsto > 0 ? Math.round((mins/previsto)*100) : null;
          const setText = (sel,text) => { const el=root.querySelector(sel); if(el) el.textContent=text; };
          setText('#osMetricCount', String(dados.length));
          setText('#osMetricRealizado', fmtMin(mins));
          setText('#osMetricPrevisto', previsto ? fmtMin(previsto) : '—');
          setText('#osMetricConsumo', pct == null ? '—' : `${pct}%`);
          const wrap=root.querySelector('#osProgressWrap'), bar=root.querySelector('#osProgressBar');
          if(wrap) wrap.style.display = previsto ? '' : 'none';
          if(bar) bar.style.width = `${Math.min(pct||0,100)}%`;
        };
        const atualizarTab = (tab) => {
          root.querySelectorAll('[data-os-tab]').forEach(b => b.classList.toggle('active', b.dataset.osTab===tab));
          root.querySelectorAll('[data-os-panel]').forEach(p => p.classList.toggle('active', p.dataset.osPanel===tab));
        };
        root.querySelectorAll('[data-os-tab]').forEach(btn => btn.onclick = () => atualizarTab(btn.dataset.osTab));
        const statusSelect = form.querySelector('[name="statusOs"]');
        statusSelect.addEventListener('change', () => {
          const holder = root.querySelector('#osModalSummaryStatus');
          if (holder) holder.innerHTML = UI.osStatusPill(statusSelect.value || 'novo');
        });

        const renderApontamentos = (list) => {
          this.renderOSApontamentos(apontContainer, list);
          atualizarMetricas();
        };
        renderApontamentos(os?.apontamentos?.length ? os.apontamentos : [{}]);

        const atualizarContexto = () => {
          const d = Store.demanda(demandaSelect.value);
          const cli = d?.clienteId ? Store.cliente(d.clienteId) : null;
          clienteInput.value = cli?.empresa || '';
          solicitanteInput.value = d?.solicitanteNome || cli?.contato || cli?.nome || '';
          const title = root.querySelector('#osModalSummaryTitle');
          const context = root.querySelector('#osModalSummaryContext');
          if(title) title.textContent = d?.titulo || 'Vincule uma demanda';
          if(context) context.textContent = `${cli?.empresa || 'Cliente será preenchido pela demanda'} · ${d?.solicitanteNome || cli?.contato || cli?.nome || 'Solicitante será preenchido pela demanda'}`;
          if (d && !os?.id) {
            respSelect.value = d.responsavelId || '';
          }
          if (respSelect.value !== '__novo') respLivre.style.display = 'none';
        };
        demandaSelect.onchange = () => {
          atualizarContexto();
          // Ao trocar a demanda de uma nova OS, herda o executante e volta ao estado inicial do registro.
        };
        respSelect.onchange = () => {
          respLivre.style.display = respSelect.value === '__novo' ? '' : 'none';
          if (respSelect.value === '__novo') respLivre.focus();
        };
        form.querySelector('[name="tempoPrevisto"]').addEventListener('input', atualizarMetricas);
        apontContainer.addEventListener('input', atualizarMetricas);
        apontContainer.addEventListener('change', atualizarMetricas);
        atualizarContexto();

        form.querySelector('#osAddApontamento').onclick = () => {
          const atual = this.readOSApontamentos(apontContainer);
          atual.push({ executanteId: respSelect.value !== '__novo' ? respSelect.value : '' });
          renderApontamentos(atual);
          atualizarTab('apontamentos');
        };

        apontContainer.addEventListener('click', (e) => {
          const actionBtn = e.target.closest('[data-action]');
          if (actionBtn) {
            const card = actionBtn.closest('[data-os-apontamento]');
            if (!card) return;
            const atual = this.readOSApontamentos(apontContainer);
            const index = Number(card.dataset.osApontamento);
            const a = atual[index] || {};
            if (actionBtn.dataset.action === 'start') {
              const now = new Date();
              a.dataExecucao = isoDay(now);
              a.horaInicial = now.toTimeString().slice(0,5);
              a.status = 'em_andamento';
              if (!a.executanteId && respSelect.value !== '__novo') a.executanteId = respSelect.value;
            } else {
              const now = new Date();
              a.dataExecucao = a.dataExecucao || isoDay(now);
              a.horaFinal = now.toTimeString().slice(0,5);
            }
            renderApontamentos(atual);
            return;
          }
        });

        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelector('#saveOS').onclick = () => {
          const d = Store.demanda(demandaSelect.value);
          if (!d) return UI.toast('Selecione uma demanda válida para a OS','warn');
          const data = UI.readForm(form);
          const apontamentos = this.readOSApontamentos(apontContainer);
          if (!apontamentos.length) return UI.toast('Adicione pelo menos um apontamento','warn');
          if (apontamentos.some(a => !String(a.servico||'').trim())) return UI.toast('Informe o serviço em todos os apontamentos','warn');
          if (apontamentos.some(a => a.horaFinal && !a.horaInicial)) return UI.toast('Todo horário final precisa de um horário inicial','warn');

          const agendaResponsavel = data.responsavelId && data.responsavelId !== '__novo' ? data.responsavelId : '';
          for (let i=0; i<apontamentos.length; i++) {
            const a = apontamentos[i];
            const respId = a.executanteId || agendaResponsavel;
            let date = a.dataExecucao || '';
            let start = a.horaInicial || '';
            let end = a.horaFinal || '';
            if (a.agendamento) {
              const dt = new Date(a.agendamento);
              if (!isNaN(dt)) { date = date || isoDay(dt); start = start || dt.toTimeString().slice(0,5); }
            }
            if (!respId || !date || !start) continue;
            const conflitos = this.osConflictEntries({responsavelId:respId, date, start, end}, os?.id || '');
            if (conflitos.length) {
              const c = conflitos[0];
              return UI.toast(`Conflito de agenda: ${c.exec} já possui OS-${Number(c.os.numero||0).toString().padStart(5,'0')} em ${fmtDate(c.date)} às ${c.start}. Ajuste o horário antes de salvar.`, 'warn', 6500);
            }
          }

          const cli = d.clienteId ? Store.cliente(d.clienteId) : null;
          const respPessoa = data.responsavelId && data.responsavelId !== '__novo' ? Store.pessoa(data.responsavelId) : null;
          const respNome = data.responsavelId === '__novo' ? String(data.responsavelNomeLivre||'').trim() : (respPessoa?.nome || '');
          const normalizados = apontamentos.map(a => ({
            ...a,
            intervalo: Number(a.intervalo||0),
            valor: a.valor === '' ? null : Number(a.valor||0),
            executanteNome: a.executanteId ? (Store.pessoa(a.executanteId)?.nome||'') : '',
          }));
          const saved = OSStore.upsert({
            ...os,
            id: os?.id,
            numero: os?.numero || OSStore.nextNumber(),
            demandaId: d.id,
            clienteId: d.clienteId || '',
            solicitanteNome: d.solicitanteNome || cli?.contato || cli?.nome || '',
            responsavelId: data.responsavelId === '__novo' ? '' : (data.responsavelId||''),
            responsavelNome: respNome || nomeResponsavel(d),
            statusOs: data.statusOs || 'novo',
            origem: data.origem || '',
            contrato: data.contrato || '',
            ambiente: data.ambiente || '',
            centroResultado: data.centroResultado || '',
            tempoPrevisto: data.tempoPrevisto === '' ? null : Number(data.tempoPrevisto),
            dataLimite: data.dataLimite || '',
            horaLimite: data.horaLimite || '',
            osRelacionada: data.osRelacionada || '',
            observacoes: data.observacoes || '',
            apontamentos: normalizados,
            criadoEm: os?.criadoEm || new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            sankhya: os?.sankhya || { status:'pendente' }
          });
          close();
          UI.toast(`OS-${Number(saved.numero).toString().padStart(5,'0')} ${os ? 'atualizada' : 'salva'} no FlowDesk`,'success');
          this.render();
        };
      }
    });
  },

  openOSDrawer(id) {
    const os = OSStore.get(id); if (!os) return;
    const d = Store.demanda(os.demandaId);
    const cli = Store.cliente(os.clienteId || d?.clienteId);
    const resp = os.responsavelId ? Store.pessoa(os.responsavelId) : null;
    const execNome = os.responsavelNome || resp?.nome || '—';
    const resumo = this.osResumo(os);
    const apontamentos = (os.apontamentos||[]).map((a,i) => {
      const exec = a.executanteId ? Store.pessoa(a.executanteId) : null;
      return `<tr>
        <td><strong>${i+1}</strong></td><td><strong>${escapeHTML(a.servico||'—')}</strong><div class="os-table-muted">${escapeHTML(a.produto||'Sem produto')}</div></td>
        <td>${escapeHTML(a.executanteNome || exec?.nome || '—')}</td><td>${a.dataExecucao?fmtDate(a.dataExecucao):'—'}</td>
        <td>${escapeHTML(a.horaInicial||'—')} — ${escapeHTML(a.horaFinal||'—')}</td>
        <td>${escapeHTML(a.classificacao||'—')}</td><td>${escapeHTML(a.motivo||'—')}</td>
        <td>${a.valor != null && a.valor !== '' ? Number(a.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'}</td>
      </tr>`;
    }).join('');

    UI.drawer({
      title:`OS-${Number(os.numero||0).toString().padStart(5,'0')}`,
      body:`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">${UI.osStatusPill(os.statusOs)} <span class="pill">${resumo.apontamentos} apontamento(s)</span></div>
        <div class="os-summary">
          <div class="os-summary-card"><div class="label">Demanda</div><div class="value">#${Store.demandaSeq(os.demandaId)||'—'}</div></div>
          <div class="os-summary-card"><div class="label">Previsto</div><div class="value">${resumo.previsto ? `${Math.floor(resumo.previsto/60)}h ${resumo.previsto%60}min` : '—'}</div></div>
          <div class="os-summary-card"><div class="label">Realizado</div><div class="value">${Math.floor(resumo.minutos/60)}h ${resumo.minutos%60}min</div></div>
          <div class="os-summary-card"><div class="label">Saldo</div><div class="value">${resumo.previsto ? `${resumo.saldo < 0 ? '-' : ''}${Math.floor(Math.abs(resumo.saldo)/60)}h ${Math.abs(resumo.saldo)%60}min` : '—'}</div></div>
        </div>
        <div class="os-context-grid">
          <div class="os-context-card"><div class="os-context-label">Cliente</div><div class="os-context-value">${escapeHTML(cli?.empresa||'—')}</div></div>
          <div class="os-context-card"><div class="os-context-label">Executante</div><div class="os-context-value">${escapeHTML(execNome)}</div></div>
          <div class="os-context-card"><div class="os-context-label">Consumo</div><div class="os-context-value">${resumo.consumo == null ? '—' : `${resumo.consumo.toFixed(0)}%`}</div></div>
        </div>
        <div class="os-integration-banner"><i class="fa-solid fa-plug-circle-xmark"></i><div><strong>Sankhya: ${os.sankhya?.status==='enviado'?'enviada':'não enviada'}</strong><div>${os.sankhya?.status==='enviado' ? `Enviada em ${new Date(os.sankhya.data).toLocaleString('pt-BR')}` : 'A integração será conectada depois que o backend/token estiver pronto.'}</div></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
          <div><b>Demanda:</b> ${escapeHTML(d?.titulo||'Demanda removida')}</div>
          <div><b>Solicitante:</b> ${escapeHTML(os.solicitanteNome||d?.solicitanteNome||'—')}</div>
          <div><b>Contrato:</b> ${escapeHTML(os.contrato||'—')}</div>
          <div><b>Ambiente:</b> ${escapeHTML(os.ambiente||'—')}</div>
          <div><b>Origem:</b> ${escapeHTML(os.origem||'—')}</div>
          <div><b>Centro de resultado:</b> ${escapeHTML(os.centroResultado||'—')}</div>
          <div><b>Tempo previsto:</b> ${os.tempoPrevisto != null && os.tempoPrevisto !== '' ? `${escapeHTML(os.tempoPrevisto)} min` : '—'}</div>
          <div><b>Data limite:</b> ${os.dataLimite?fmtDate(os.dataLimite):'—'}${os.horaLimite?` ${escapeHTML(os.horaLimite)}`:''}</div>
          <div><b>OS relacionada:</b> ${escapeHTML(os.osRelacionada||'—')}</div>
          <div><b>Criada em:</b> ${os.criadoEm?new Date(os.criadoEm).toLocaleString('pt-BR'):'—'}</div>
        </div>
        ${os.observacoes ? `<div class="section-title">Observações</div><div class="comment">${escapeHTML(os.observacoes)}</div>` : ''}
        <div class="section-title">Apontamentos</div>
        <div class="table-wrap"><table class="os-apont-table"><thead><tr><th>#</th><th>Serviço / Produto</th><th>Executante</th><th>Data</th><th>Horário</th><th>Classificação</th><th>Motivo</th><th>Valor</th></tr></thead><tbody>${apontamentos || '<tr><td colspan="8">Nenhum apontamento.</td></tr>'}</tbody></table></div>
        <div class="os-detail-actions">
          <button class="btn btn-primary" id="btnEditarOS"><i class="fa-solid fa-pen"></i> Editar</button>
          <button class="btn" id="btnEnviarSankhya"><i class="fa-solid fa-cloud-arrow-up"></i> Enviar ao Sankhya</button>
          <button class="btn btn-danger" id="btnExcluirOS"><i class="fa-solid fa-trash"></i> Excluir</button>
        </div>`,
      onOpen: (root, close) => {
        root.querySelector('#btnEditarOS').onclick = () => { close(); this.openOSModal(os); };
        root.querySelector('#btnEnviarSankhya').onclick = () => UI.toast('Integração com o Sankhya ainda não está conectada. A OS continua salva no FlowDesk.','info',5000);
        root.querySelector('#btnExcluirOS').onclick = () => { close(); this.delOS(os.id); };
      }
    });
  },

  delOS(id) {
    const os = OSStore.get(id); if (!os) return;
    UI.confirm('Excluir OS', `OS-${Number(os.numero||0).toString().padStart(5,'0')} e todos os seus apontamentos serão removidos. Continuar?`, () => {
      OSStore.remove(id);
      UI.toast('OS excluída do FlowDesk','success');
      this.render();
    });
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
        return `<tr class="row-clickable" data-a="open" data-id="${p.id}" title="Ver demandas deste projeto">
          <td><strong>${escapeHTML(p.nome)}</strong></td>
          <td>${escapeHTML(c?.empresa||'—')}</td>
          <td>${escapeHTML(r?.nome||'—')}</td>
          <td>${fmtDate(p.inicio)}</td>
          <td>${fmtDate(p.prazo)}</td>
          <td>${UI.statusPill(p.status)}</td>
          <td>${UI.prioPill(p.prioridade)}</td>
          <td><span class="pill pill-link" data-a="open" data-id="${p.id}">${dems}</span></td>
          <td><div class="row-actions">
            <button data-a="docs" data-id="${p.id}" title="Baixar documentos das demandas"><i class="fa-solid fa-file-zipper"></i></button>
            <button data-a="edit" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
            <button class="del" data-a="del" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('');
      tb.querySelectorAll('tr[data-a="open"]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('[data-a="edit"], [data-a="del"], [data-a="docs"]')) return;
        this.goProjetoDemandas(tr.dataset.id);
      });
      tb.querySelectorAll('[data-a="edit"]').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.openProjetoModal(Store.projeto(b.dataset.id)); });
      tb.querySelectorAll('[data-a="del"]').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.delProjeto(b.dataset.id); });
      tb.querySelectorAll('[data-a="docs"]').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.baixarDocumentosProjeto(b.dataset.id); });
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
  // Baixa o zip com todos os documentos das demandas do projeto. Faz um fetch
  // primeiro (em vez de um <a href> direto) porque o endpoint pode responder
  // 404 em JSON quando não há documentos, e um <a> baixaria esse JSON como
  // se fosse o arquivo.
  async baixarDocumentosProjeto(projetoId) {
    try {
      const res = await fetch(Documentos.urlZipProjeto(projetoId));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return UI.toast(body.error || 'Nenhum documento encontrado para este projeto', 'warn');
      }
      const blob = await res.blob();
      const nome = Store.projeto(projetoId)?.nome || projetoId;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documentos-${nome}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      UI.toast('Falha ao baixar documentos do projeto', 'error');
    }
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
        <input id="fid" placeholder="ID" value="${escapeHTML(f.id||'')}" style="max-width:90px"/>
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
      <div class="table-wrap"><table class="demandas-table">
        <thead><tr>
          <th data-sort="_seq">ID</th><th data-sort="titulo">Título</th><th>Projeto</th><th>Cliente</th><th>Executante</th><th>Equipe</th>
          <th>Status</th><th>Prioridade</th><th data-sort="prazo">Prazo</th><th style="width:170px"></th>
        </tr></thead><tbody id="tbody"></tbody>
      </table></div>`;

    const draw = () => {
      let list = Store.demandas().filter(d => {
        if (f.id) {
          const alvo = String(f.id).replace(/\D/g,'');
          if (!alvo || String(Store.demandaSeq(d.id)) !== alvo) return false;
        }
        if (f.q) {
          const q = f.q.toLowerCase();
          const cli = Store.cliente(d.clienteId), proj = Store.projeto(d.projetoId), resp = Store.pessoa(d.responsavelId);
          const hay = [d.titulo,d.descricao,cli?.empresa,nomeProjeto(d),nomeResponsavel(d),d.status,(d.tags||[]).join(',')].map(v=>(v||'').toLowerCase()).join(' ');
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
          <td style="color:var(--text-2);font-variant-numeric:tabular-nums;">#${Store.demandaSeq(d.id)}</td>
          <td><strong style="cursor:pointer" data-a="open" data-id="${d.id}">${escapeHTML(d.titulo)}</strong>
            <div style="margin-top:4px;">${(d.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div></td>
          <td>${escapeHTML(nomeProjeto(d)||'—')}</td>
          <td>${escapeHTML(cli?.empresa||'—')}</td>
          <td>${escapeHTML(nomeResponsavel(d)||'—')}</td>
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
    $('#fid').addEventListener('input', debounce(e=>{ f.id = e.target.value; draw(); }, 150));
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
    $('#fclear').onclick = () => { const cli = f.cliente; Object.assign(f, { id:'',q:'',cliente:cli,projeto:'',responsavel:'',equipe:'',status:'',prioridade:'',data:'' }); doRender(); };
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
        const clienteHidden = form.querySelector('input[name="clienteId"]');
        const projetoSelect = form.querySelector('[name="projetoId"]');

        // Liga o toggle mostrar/esconder do campo de texto no <select> já renderizado
        // no HTML inicial (antes de qualquer onchange de Empresa/Projeto acontecer).
        const ligarToggleSolicitante = () => {
          const sel = form.querySelector('#solicitanteField select[name="solicitanteNome"]');
          const livre = form.querySelector('#solicitanteField input[name="solicitanteNomeLivre"]');
          if (!sel || !livre) return;
          sel.onchange = () => {
            livre.style.display = sel.value==='__novo' ? '' : 'none';
            clienteHidden.value = (sel.value && sel.value!=='__novo') ? sel.value : '';
            if (sel.value === '__novo') livre.focus();
          };
        };
        ligarToggleSolicitante();

        // Executante: mesmo padrão do Solicitante — dropdown de equipe interna com
        // opção "+ Outro..." pra digitar nome de terceiros/contatos do cliente que
        // não estão cadastrados no sistema.
        const ligarToggleExecutante = () => {
          const sel = form.querySelector('#executanteField select[name="responsavelId"]');
          const livre = form.querySelector('#executanteField input[name="responsavelNomeLivre"]');
          if (!sel || !livre) return;
          sel.onchange = () => {
            livre.style.display = sel.value==='__novo' ? '' : 'none';
            if (sel.value === '__novo') livre.focus();
          };
        };
        ligarToggleExecutante();

        // Solicitante: dropdown com os contatos já cadastrados da empresa (mesmo padrão
        // visual dos demais campos), com opção "+ Novo contato..." para digitar um nome novo.
        // Quando a empresa não tem nenhum contato cadastrado, o campo vira texto livre.
        const preencherContatos = (empresa, selecionadoId='') => {
          const contatos = empresaMap[empresa] || [];
          const solicitanteField = form.querySelector('#solicitanteField');
          const opts = [{ value:'', label:'—' }, ...contatos.map(c=>({value:c.id,label:c.label})), { value:'__novo', label:'+ Novo contato...' }];

          if (contatos.length) {
            solicitanteField.innerHTML = `<label>Solicitante (Contato)</label>
              ${UI.select('solicitanteNome', opts, selecionadoId || '')}
              <input name="solicitanteNomeLivre" placeholder="Nome do novo contato" style="margin-top:8px;display:none"/>`;
            ligarToggleSolicitante();
            const sel = solicitanteField.querySelector('select[name="solicitanteNome"]');
            if (selecionadoId) { clienteHidden.value = selecionadoId; sel.onchange(); }
          } else {
            solicitanteField.innerHTML = `<label>Solicitante (Contato)</label>
              <input name="solicitanteNome" placeholder="Nome do contato"/>`;
            clienteHidden.value = '';
          }
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
            // Vincula direto o contato/cliente do projeto escolhido como Solicitante (sugestão).
            preencherContatos(empresaDoProjeto, clienteDoProjeto);
            preencherProjetos(empresaDoProjeto, projetoSelect.value);
          }
          // Se o projeto escolhido não tem empresa associada, deixa a Empresa como está.
        };

        root.querySelector('#save').onclick = () => {
          const data = UI.readForm(root.querySelector('#demandaForm'));
          if (!data.titulo) return UI.toast('Título obrigatório','warn');
          delete data.empresaSelecionada;
          // Resolve o Solicitante: quando veio do dropdown de contatos, `solicitanteNome`
          // guarda o id do contato (ou "__novo"); o nome de fato pode estar no campo de
          // texto livre correspondente. Normaliza tudo pra {clienteId, solicitanteNome}.
          {
            const solicSel = form.querySelector('select[name="solicitanteNome"]');
            if (solicSel) {
              if (solicSel.value === '__novo') {
                data.solicitanteNome = (data.solicitanteNomeLivre || '').trim();
                data.clienteId = '';
              } else if (solicSel.value) {
                const contatos = empresaMap[empresaSelect.value] || [];
                const c = contatos.find(x => x.id === solicSel.value);
                data.clienteId = solicSel.value;
                data.solicitanteNome = c ? c.label : '';
              } else {
                data.solicitanteNome = '';
                data.clienteId = '';
              }
            }
            delete data.solicitanteNomeLivre;
          }
          // Resolve o Executante: mesma lógica do Solicitante — se "+ Outro..." foi
          // escolhido, guarda o nome digitado em responsavelNome e zera responsavelId.
          {
            const respSel = form.querySelector('#executanteField select[name="responsavelId"]');
            if (respSel && respSel.value === '__novo') {
              data.responsavelNome = (data.responsavelNomeLivre || '').trim();
              data.responsavelId = '';
            } else if (data.responsavelId) {
              data.responsavelNome = '';
            }
            delete data.responsavelNomeLivre;
          }
          if (!data.criadoPorId) data.criadoPorId = this.currentUserPessoaId || '';
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
    const osDaDemanda = OSStore.all().filter(os => os.demandaId === d.id).sort((a,b)=>Number(b.numero||0)-Number(a.numero||0));

    UI.drawer({
      title: `#${Store.demandaSeq(d.id)} · ${d.titulo}`,
      body: `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          ${UI.statusPill(isLate(d)?'atrasado':d.status)} ${UI.prioPill(d.prioridade)}
          ${(d.tags||[]).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:10px;">${escapeHTML(d.descricao||'')}</div>
        ${d.proximosPassos ? `<div style="font-size:13px;margin-bottom:10px;"><b>Próximos passos:</b> ${escapeHTML(d.proximosPassos)}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
          <div><b>Projeto:</b> ${escapeHTML(nomeProjeto(d)||'—')}</div>
          <div><b>Cliente:</b> ${escapeHTML(cli?.empresa||'—')}</div>
          <div><b>Solicitante:</b> ${escapeHTML(d.solicitanteNome || cli?.contato || cli?.nome || '—')}</div>
          <div><b>Executante:</b> ${escapeHTML(nomeResponsavel(d)||'—')}</div>
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
        <div class="section-title">Documentos</div>
        <div id="docsList"><div class="empty" style="padding:12px">Carregando...</div></div>
        <div class="file-upload" style="margin-top:10px;">
          <label class="file-upload-label" for="docFile">
            <i class="fa-solid fa-paperclip"></i> Escolher arquivo
          </label>
          <span class="file-upload-hint" id="docFileHint">Nenhum arquivo selecionado</span>
          <input type="file" id="docFile"/>
          <button class="btn btn-primary btn-sm" id="docAdd" style="margin-left:auto;"><i class="fa-solid fa-upload"></i> Enviar</button>
        </div>
        <div class="section-title">Histórico</div>
        ${hist || '<div class="empty" style="padding:12px">Sem histórico.</div>'}
        <div class="section-title">Ordens de Serviço</div>
        <div class="os-integration-banner"><i class="fa-solid fa-screwdriver-wrench"></i><div><strong>${osDaDemanda.length ? `${osDaDemanda.length} OS vinculada(s)` : 'Nenhuma OS vinculada'}</strong><div>Crie uma OS a partir desta demanda para reaproveitar cliente, solicitante e executante.</div></div><button class="btn btn-sm btn-primary" id="btnNovaOSDaDemanda" style="margin-left:auto;white-space:nowrap"><i class="fa-solid fa-plus"></i> Nova OS</button></div>
        ${osDaDemanda.length ? `<div style="display:flex;flex-direction:column;gap:6px;">${osDaDemanda.map(os=>`<button class="btn btn-ghost" data-os-demanda="${os.id}" style="justify-content:space-between;text-align:left;border:1px solid var(--border);"><span><strong>OS-${Number(os.numero||0).toString().padStart(5,'0')}</strong> · ${escapeHTML(this.osStatusLabel(os.statusOs))}</span><span>${os.apontamentos?.length||0} apont.</span></button>`).join('')}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:20px;flex-wrap:wrap;">
          ${onVoltar ? '<button class="btn" id="btnVoltar"><i class="fa-solid fa-arrow-left"></i> Voltar</button>' : ''}
          <button class="btn" id="btnEdit"><i class="fa-solid fa-pen"></i> Editar</button>
          <button class="btn" id="btnDup"><i class="fa-solid fa-copy"></i> Duplicar</button>
          <button class="btn btn-danger" id="btnDel"><i class="fa-solid fa-trash"></i> Excluir</button>
        </div>`,
      onOpen: (root, close) => {
        this.carregarDocumentosDemanda(root, id);
        const docFileInput = root.querySelector('#docFile');
        const docFileHint = root.querySelector('#docFileHint');
        docFileInput.onchange = () => {
          docFileHint.textContent = docFileInput.files[0]?.name || 'Nenhum arquivo selecionado';
        };
        root.querySelector('#docAdd').onclick = async () => {
          const file = docFileInput.files[0];
          if (!file) return UI.toast('Selecione um arquivo', 'warn');
          try {
            await Documentos.upload(id, file);
            docFileInput.value = '';
            docFileHint.textContent = 'Nenhum arquivo selecionado';
            UI.toast('Documento enviado', 'success');
            this.carregarDocumentosDemanda(root, id);
          } catch (err) {
            console.error(err);
            UI.toast('Falha ao enviar documento', 'error');
          }
        };
        root.querySelectorAll('[data-ck]').forEach(cb => cb.onchange = () => {
          const item = d.checklist.find(x=>x.id===cb.dataset.ck);
          if (item) {
            item.done = cb.checked;
            item.doneEm = cb.checked ? new Date().toISOString() : null;
            d.historico = d.historico || [];
            d.historico.push({ tipo:'checklist', data:new Date().toISOString(), texto:`Item do checklist ${cb.checked?'concluído':'reaberto'}: "${item.texto}"` });
            Store.upsert('demandas', d); this.openDemandaDrawer(id, onVoltar);
          }
        });
        root.querySelector('#ckAdd').onclick = () => {
          const v = root.querySelector('#ckNew').value.trim(); if (!v) return;
          d.checklist = d.checklist || [];
          d.checklist.push({ id: uid('ck'), texto:v, done:false, doneEm:null });
          d.historico = d.historico || [];
          d.historico.push({ tipo:'checklist', data:new Date().toISOString(), texto:`Item adicionado ao checklist: "${v}"` });
          Store.upsert('demandas', d); this.openDemandaDrawer(id, onVoltar);
        };
        root.querySelector('#cmAdd').onclick = () => {
          const v = root.querySelector('#cmNew').value.trim(); if (!v) return;
          d.comentarios = d.comentarios || [];
          d.comentarios.push({ id: uid('cm'), autor:'Você', texto:v, data:new Date().toISOString() });
          d.historico = d.historico || [];
          d.historico.push({ tipo:'comentario', data:new Date().toISOString(), texto:'Comentário adicionado' });
          Store.upsert('demandas', d); this.openDemandaDrawer(id, onVoltar);
        };
        root.querySelector('#btnNovaOSDaDemanda')?.addEventListener('click', () => { close(); this.openOSModal(null, d.id); });
        root.querySelectorAll('[data-os-demanda]').forEach(btn => btn.onclick = () => { close(); this.openOSDrawer(btn.dataset.osDemanda); });
        if (onVoltar) root.querySelector('#btnVoltar').onclick = () => { close(); onVoltar(); };
        root.querySelector('#btnEdit').onclick = () => { close(); this.openDemandaModal(d); };
        root.querySelector('#btnDup').onclick = () => { close(); this.dupDemanda(id); };
        root.querySelector('#btnDel').onclick = () => { close(); this.delDemanda(id); };
      }
    });
  },

  // Busca e renderiza a lista de documentos de uma demanda dentro do drawer
  // já aberto. Separado do corpo do drawer porque documentos não vêm do
  // bootstrap (Store.state) — sempre um fetch à parte.
  async carregarDocumentosDemanda(root, demandaId) {
    const list = root.querySelector('#docsList');
    if (!list) return; // drawer pode já ter sido fechado quando a resposta chega
    try {
      const docs = await Documentos.listar(demandaId);
      list.innerHTML = docs.length
        ? docs.map(doc => `
          <div class="comment" style="display:flex;align-items:center;gap:8px;">
            <i class="fa-solid fa-file"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(doc.nomeArquivo)}</div>
              <div style="font-size:11px;color:var(--text-2);">${fmtBytes(doc.tamanho)} · ${fmtDate(doc.createdAt)}</div>
            </div>
            <a class="icon-btn" href="${Documentos.urlDownload(doc.id)}" title="Baixar"><i class="fa-solid fa-download"></i></a>
            <button class="icon-btn" data-doc-del="${doc.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </div>`).join('')
        : '<div class="empty" style="padding:12px">Nenhum documento anexado.</div>';

      list.querySelectorAll('[data-doc-del]').forEach(btn => btn.onclick = () => {
        UI.confirm('Excluir documento', 'Tem certeza que deseja excluir este documento?', async () => {
          try {
            await Documentos.remover(btn.dataset.docDel);
            UI.toast('Documento excluído', 'success');
            this.carregarDocumentosDemanda(root, demandaId);
          } catch (err) {
            console.error(err);
            UI.toast('Falha ao excluir documento', 'error');
          }
        });
      });
    } catch (err) {
      console.error(err);
      list.innerHTML = '<div class="empty" style="padding:12px">Falha ao carregar documentos.</div>';
    }
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
        const hay = [d.titulo,d.descricao,cli?.empresa,nomeProjeto(d),nomeResponsavel(d),(d.tags||[]).join(',')].map(v=>(v||'').toLowerCase()).join(' ');
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
          <div class="avatar" style="width:24px;height:24px;font-size:10px">${initials(nomeResponsavel(d)||'?')}</div>
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
          <span>${escapeHTML(cli?.empresa || 'Sem cliente')} · ${escapeHTML(nomeProjeto(d) || 'Sem projeto')} · ${escapeHTML(nomeResponsavel(d) || 'Sem executante')}</span>
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
        return `<div class="dashboard-modal-item"><div><strong>${escapeHTML(d.titulo)}</strong><span>${escapeHTML(nomeResponsavel(d) || 'Sem executante')} · Prazo: ${fmtDate(d.prazo)}</span></div>${UI.statusPill(isLate(d) ? 'atrasado' : d.status)}</div>`;
      }).join('')}</div>` : UI.emptyState('list-check','Nenhuma demanda cadastrada para este projeto.')}
    `;
    UI.modal({ title: p.nome, size:'lg', body, footer:'<button class="btn" data-close-modal>Fechar</button>', onOpen: (root, close) => {
      root.querySelector('[data-close-modal]').onclick = close;
    }});
  },

  // Gera um relatório de cronograma (PDF, via impressão) para enviar ao cliente:
  // uma tabela cronológica de projetos + demandas com datas/status, e uma barra
  // de linha do tempo (Gantt simplificado, feito com divs — canvas não imprime
  // de forma confiável na janela de print do exportPDF).
  exportCronogramaCliente(nomeEmpresa, projetos, demandas) {
    // Só entram itens com data (início e/ou prazo) — sem isso não há o que
    // posicionar num cronograma.
    const itensProjeto = projetos
      .filter(p => p.inicio || p.prazo)
      .map(p => ({
        tipo: 'Projeto', titulo: p.nome, status: p.status,
        inicio: p.inicio ? parseLocalDate(p.inicio) : (p.prazo ? parseLocalDate(p.prazo) : null),
        fim: p.prazo ? parseLocalDate(p.prazo) : (p.inicio ? parseLocalDate(p.inicio) : null),
      }));
    const itensDemanda = demandas
      .filter(d => d.prazo)
      .map(d => ({
        tipo: 'Demanda', titulo: d.titulo, status: isLate(d) ? 'atrasado' : d.status,
        inicio: parseLocalDate(d.prazo), fim: parseLocalDate(d.prazo),
        projetoNome: d.projetoId ? nomeProjeto(d) : '',
      }));
    const itens = [...itensProjeto, ...itensDemanda].sort((a,b) => a.inicio - b.inicio);

    if (!itens.length) { UI.toast('Nenhum projeto ou demanda com data para montar o cronograma','warn'); return; }

    const menorData = itens.reduce((min,i) => i.inicio < min ? i.inicio : min, itens[0].inicio);
    const maiorData = itens.reduce((max,i) => i.fim > max ? i.fim : max, itens[0].fim);
    const totalDias = Math.max(1, daysBetween(menorData, maiorData));
    const pctPos = (d) => Math.min(100, Math.max(0, (daysBetween(menorData, d) / totalDias) * 100));
    const pctWidth = (a,b) => Math.max(1.2, ((daysBetween(a,b) / totalDias) * 100));

    const gantt = itens.map(i => {
      const left = pctPos(i.inicio);
      const width = pctWidth(i.inicio, i.fim);
      const cor = STATUS[i.status]?.color || '#6366f1';
      return `<tr>
        <td style="border:none;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(i.titulo)}${i.tipo==='Demanda'?' <span style="color:#888;font-size:10px;">(demanda)</span>':''}</td>
        <td style="border:none;position:relative;padding:4px 8px;">
          <div style="position:relative;height:14px;background:#f0f0f0;border-radius:4px;">
            <div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${cor};border-radius:4px;"></div>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Detalhamento agrupado por projeto: cada projeto vira um bloco com
    // cabeçalho (nome, período, status) e as demandas dele listadas embaixo,
    // ordenadas por prazo. Demandas sem projeto (ou com um dos valores
    // especiais tipo "Fora do escopo") caem num bloco à parte no final.
    const statusChip = (st) => {
      const s = STATUS[st] || STATUS.backlog;
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;background:${s.color}1a;color:${s.color};white-space:nowrap;"><span style="width:6px;height:6px;border-radius:50%;background:${s.color};display:inline-block;"></span>${escapeHTML(s.label)}</span>`;
    };

    const demandasPorProjeto = {};
    const demandasSemProjeto = [];
    demandas.forEach(d => {
      const st = isLate(d) ? 'atrasado' : d.status;
      const row = { titulo: d.titulo, prazo: d.prazo ? parseLocalDate(d.prazo) : null, status: st };
      if (d.projetoId && Store.projeto(d.projetoId)) {
        (demandasPorProjeto[d.projetoId] = demandasPorProjeto[d.projetoId] || []).push(row);
      } else {
        demandasSemProjeto.push({ ...row, projetoNome: d.projetoId ? nomeProjeto(d) : '' });
      }
    });
    Object.values(demandasPorProjeto).forEach(list => list.sort((a,b) => (a.prazo||0) - (b.prazo||0)));
    demandasSemProjeto.sort((a,b) => (a.prazo||0) - (b.prazo||0));

    const demandaLinha = (d) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0 9px 18px;border-top:1px solid #eee;">
        <div style="min-width:0;display:flex;align-items:center;gap:8px;">
          <span style="width:5px;height:5px;border-radius:50%;background:#c7cad1;flex:none;"></span>
          <span style="font-size:12.5px;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(d.titulo)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex:none;">
          <span style="font-size:11px;color:#888;">${d.prazo ? fmtDate(d.prazo) : '—'}</span>
          ${statusChip(d.status)}
        </div>
      </div>`;

    const projetosOrdenados = projetos.slice().sort((a,b) => {
      const da = a.inicio ? parseLocalDate(a.inicio) : (a.prazo ? parseLocalDate(a.prazo) : new Date(8640000000000000));
      const db = b.inicio ? parseLocalDate(b.inicio) : (b.prazo ? parseLocalDate(b.prazo) : new Date(8640000000000000));
      return da - db;
    });

    const blocoProjeto = (p) => {
      const dems = demandasPorProjeto[p.id] || [];
      const concluidas = dems.filter(d => d.status === 'concluido').length;
      return `
      <div style="border:1px solid #e3e5e9;border-radius:10px;margin-bottom:14px;overflow:hidden;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#f7f8fa;border-bottom:${dems.length ? '1px solid #e3e5e9' : 'none'};">
          <div style="min-width:0;">
            <div style="font-size:13.5px;font-weight:700;color:#111;">${escapeHTML(p.nome)}</div>
            <div style="font-size:11px;color:#888;margin-top:2px;">Início: ${fmtDate(p.inicio)} · Prazo: ${fmtDate(p.prazo)}${dems.length ? ` · ${concluidas}/${dems.length} demanda(s) concluída(s)` : ''}</div>
          </div>
          ${statusChip(p.status)}
        </div>
        ${dems.length ? `<div style="padding:0 16px;">${dems.map(demandaLinha).join('')}</div>` : `<div style="padding:10px 16px;font-size:11.5px;color:#aaa;">Nenhuma demanda com prazo vinculada a este projeto.</div>`}
      </div>`;
    };

    const blocoSemProjeto = demandasSemProjeto.length ? `
      <div style="border:1px solid #e3e5e9;border-radius:10px;margin-bottom:14px;overflow:hidden;page-break-inside:avoid;">
        <div style="padding:12px 16px;background:#f7f8fa;border-bottom:1px solid #e3e5e9;">
          <div style="font-size:13.5px;font-weight:700;color:#111;">Sem projeto vinculado</div>
        </div>
        <div style="padding:0 16px;">${demandasSemProjeto.map(demandaLinha).join('')}</div>
      </div>` : '';

    const body = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:20px;border-bottom:2px solid #6366f1;">
        <div>
          <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8b5cf6;font-weight:700;">FlowDesk · Cronograma</div>
          <div style="font-size:19px;font-weight:800;color:#111;margin-top:2px;">${escapeHTML(nomeEmpresa)}</div>
        </div>
        <div style="text-align:right;font-size:11.5px;color:#777;">
          <div>Período: <strong style="color:#333;">${fmtDate(menorData)} — ${fmtDate(maiorData)}</strong></div>
          <div style="margin-top:2px;">${projetos.length} projeto(s) · ${demandas.length} demanda(s)</div>
        </div>
      </div>
      <h2 style="font-size:14px;margin:0 0 10px;color:#333;">Linha do tempo</h2>
      <table style="margin-bottom:30px;border:none;"><tbody>${gantt}</tbody></table>
      <h2 style="font-size:14px;margin:0 0 12px;color:#333;">Detalhamento por projeto</h2>
      ${projetosOrdenados.map(blocoProjeto).join('')}
      ${blocoSemProjeto}`;
    exportPDF(`Cronograma — ${nomeEmpresa}`, body, true);
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
      const n = nomeResponsavel(d)||'—';
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
      const va = col==='_seq' ? (Store.demandaSeq(a.id)||0) : (a[col]||'');
      const vb = col==='_seq' ? (Store.demandaSeq(b.id)||0) : (b[col]||'');
      if (va < vb) return -1*dir; if (va > vb) return 1*dir; return 0;
    });
  },

  exportDemandsCSV() {
    const rows = Store.demandas().map(d => ({
      titulo:d.titulo, projeto:nomeProjeto(d)||'',
      cliente:Store.cliente(d.clienteId)?.empresa||'', responsavel:nomeResponsavel(d)||'',
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
      <tbody>${dems.map(d=>`<tr><td>${escapeHTML(d.titulo)}</td><td>${escapeHTML(Store.cliente(d.clienteId)?.empresa||'')}</td><td>${escapeHTML(nomeResponsavel(d)||'')}</td><td>${STATUS[d.status]?.label}</td><td>${fmtDate(d.prazo)}</td><td>${d.tempoGasto||0}</td></tr>`).join('')}</tbody></table>`;
    exportPDF('FlowDesk — Relatório', body);
  },

  /* ================== TRANSIÇÃO PARA O CS ================== */
  transicaoTab: 'lista',

  render_transicaocs(root) {
    const list = Store.transicoes().slice().sort((a,b) => new Date(b.criacao||0) - new Date(a.criacao||0));
    const statusLabel = (t) => TransicaoCS.isAssinado(t)
      ? '<span class="status concluido"><span class="dot" style="background:#10b981"></span>Assinado</span>'
      : '<span class="status cliente"><span class="dot" style="background:#f59e0b"></span>Pendente</span>';

    root.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">Transição para o CS</h1><div class="page-subtitle">Formulário de passagem de bastão da implantação para o Customer Success.</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" id="btnNovaTransicao"><i class="fa-solid fa-plus"></i> Nova passagem de bastão</button>
        </div>
      </div>
      ${!list.length ? UI.emptyState('right-left','Nenhuma passagem de bastão registrada ainda.') : `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Cliente</th><th>GP</th><th>Data prevista</th><th>Status</th><th>Criado em</th><th></th>
          </tr></thead>
          <tbody>
            ${list.map(t => {
              const cli = Store.cliente(t.clienteId);
              const gp = Store.pessoa(t.gpId);
              const assinado = TransicaoCS.isAssinado(t);
              return `<tr data-id="${t.id}" style="cursor:pointer;">
                <td><b>${escapeHTML(t.clienteEmpresa || cli?.empresa || '—')}</b></td>
                <td>${escapeHTML(gp?.nome || '—')}</td>
                <td>${t.dataTransicao ? fmtDate(t.dataTransicao) : '—'}</td>
                <td>${statusLabel(t)}</td>
                <td>${fmtDate(t.criacao)}</td>
                <td style="text-align:right;white-space:nowrap;">
                  ${!assinado ? `<button class="icon-btn" data-del-transicao="${t.id}" title="Excluir" style="margin-right:6px;"><i class="fa-solid fa-trash" style="color:#ef4444"></i></button>` : ''}
                  <i class="fa-solid fa-chevron-right" style="color:var(--text-2)"></i>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    `;
    $('#btnNovaTransicao').onclick = () => this.openTransicaoModal();
    root.querySelectorAll('tr[data-id]').forEach(row => row.onclick = () => this.openTransicaoDetalhe(row.dataset.id));
    root.querySelectorAll('[data-del-transicao]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.delTransicao;
        UI.confirm('Excluir transição', 'Esta ação não pode ser desfeita.', () => {
          Store.remove('transicoes', id);
          UI.toast('Transição excluída','success');
          this.render();
        });
      };
    });
  },

  openTransicaoModal(t=null) {
    // Agrupa por empresa (mesmo padrão do formulário de demanda) para não listar
    // um contato por linha — só uma opção por empresa no dropdown.
    const empresaMap = {};
    Store.clientes().forEach(c => {
      const key = (c.empresa || '').trim();
      if (!key) return;
      if (!empresaMap[key]) empresaMap[key] = c.id; // guarda o primeiro cliente daquela empresa como referência
    });
    const empresasUnicas = Object.keys(empresaMap).sort((a,b) => a.localeCompare(b));
    const cliOpts = empresasUnicas.map(emp => ({ value: emp, label: emp }));
    const gpOpts = Store.equipe().map(e => ({ value: e.id, label: e.nome }));

    const empresaAtual = t?.clienteEmpresa || (t?.clienteId ? (Store.cliente(t.clienteId)?.empresa || '') : '');

    UI.modal({
      title: t ? 'Editar Transição' : 'Nova Passagem de Bastão',
      body: `
        <form id="transicaoForm" class="form-grid">
          <div class="field full"><label>Cliente *</label>${UI.select('clienteEmpresa', [{value:'',label:'Selecione...'},...cliOpts], empresaAtual, 'required')}</div>
          <div class="field"><label>GP responsável *</label>${UI.select('gpId', [{value:'',label:'Selecione...'},...gpOpts], t?.gpId||'', 'required')}</div>
          <div class="field"><label>Data da transição *</label><input type="date" name="dataTransicao" required value="${t?.dataTransicao?isoDay(t.dataTransicao):''}"/></div>
        </form>`,
      footer: `<button class="btn" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveTransicao"><i class="fa-solid fa-check"></i> ${t?'Salvar':'Criar e continuar'}</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-close-modal]').onclick = close;
        root.querySelector('#saveTransicao').onclick = () => {
          const data = UI.readForm(root.querySelector('#transicaoForm'));
          if (!data.clienteEmpresa || !data.gpId || !data.dataTransicao) return UI.toast('Preencha cliente, GP e data','warn');
          const registro = {
            id: t?.id,
            clienteId: empresaMap[data.clienteEmpresa] || t?.clienteId || '',
            clienteEmpresa: data.clienteEmpresa,
            gpId: data.gpId,
            dataTransicao: data.dataTransicao,
            respostas: t?.respostas || {},
            assinaturas: t?.assinaturas || {},
            criacao: t?.criacao || new Date().toISOString(),
          };
          Store.upsert('transicoes', registro);
          close();
          UI.toast('Transição salva','success');
          this.render();
          this.openTransicaoDetalhe(registro.id);
        };
      }
    });
  },

  openTransicaoDetalhe(id) {
    const t = Store.transicao(id); if (!t) return;
    const bloqueado = TransicaoCS.isAssinado(t);
    const cli = Store.cliente(t.clienteId);
    const gp = Store.pessoa(t.gpId);

    const body = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
        <div>
          <div style="font-size:12px;color:var(--text-2)">Cliente</div>
          <div style="font-weight:700;font-size:15px;">${escapeHTML(t.clienteEmpresa || cli?.empresa || '—')}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-2)">GP</div>
          <div style="font-weight:600;">${escapeHTML(gp?.nome || '—')}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-2)">Data da transição</div>
          <div style="font-weight:600;">${t.dataTransicao ? fmtDate(t.dataTransicao) : '—'}</div>
        </div>
        <div>
          ${bloqueado
            ? '<span class="status concluido"><span class="dot" style="background:#10b981"></span>Documento assinado</span>'
            : '<span class="status cliente"><span class="dot" style="background:#f59e0b"></span>Aguardando assinaturas</span>'}
        </div>
      </div>
      ${!bloqueado ? `<div style="display:flex;gap:6px;margin-bottom:16px;">
        <button class="btn" id="btnEditTransicaoHead"><i class="fa-solid fa-pen"></i> Editar dados</button>
        <button class="btn btn-danger" id="btnExcluirTransicao"><i class="fa-solid fa-trash"></i> Excluir</button>
      </div>` : ''}
      <div class="section-title">Questionário de passagem de bastão</div>
      <form id="transicaoQuestForm" class="form-grid" style="margin-bottom:20px;">
        ${TransicaoCS.PERGUNTAS.map((p, i) => `
          <div class="field full">
            <label>${escapeHTML(p)}</label>
            <textarea name="q${i}" ${bloqueado?'disabled':''} rows="2">${escapeHTML(t.respostas?.['q'+i]||'')}</textarea>
          </div>
        `).join('')}
      </form>
      ${!bloqueado ? `<button class="btn" id="btnSalvarRespostas" style="margin-bottom:20px;"><i class="fa-solid fa-floppy-disk"></i> Salvar respostas</button>` : ''}

      <div class="section-title">Assinaturas obrigatórias</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:8px;">
        ${TransicaoCS.ASSINANTES.map(a => TransicaoCS.renderAssinanteRow(t, a)).join('')}
      </div>
      ${bloqueado ? `<p style="font-size:12px;color:var(--text-2);margin-top:10px;"><i class="fa-solid fa-lock"></i> Documento assinado por todos os signatários. As informações estão bloqueadas para edição.</p>` : ''}
      <div style="display:flex;gap:6px;margin-top:20px;">
        <button class="btn" id="btnGerarDocTransicao"><i class="fa-solid fa-file-lines"></i> Gerar documento</button>
      </div>
    `;

    const { close } = UI.drawer({
      title: 'Transição para o CS',
      body,
      onOpen: (root) => {
        if (!bloqueado) {
          const editHead = root.querySelector('#btnEditTransicaoHead');
          if (editHead) editHead.onclick = () => { close(); this.openTransicaoModal(t); };

          const delBtn = root.querySelector('#btnExcluirTransicao');
          if (delBtn) delBtn.onclick = () => {
            UI.confirm('Excluir transição', 'Esta ação não pode ser desfeita.', () => {
              Store.remove('transicoes', t.id);
              close();
              UI.toast('Transição excluída','success');
              this.render();
            });
          };

          root.querySelector('#btnSalvarRespostas').onclick = () => {
            const data = UI.readForm(root.querySelector('#transicaoQuestForm'));
            t.respostas = { ...(t.respostas||{}), ...data };
            Store.upsert('transicoes', t);
            UI.toast('Respostas salvas','success');
          };

          TransicaoCS.ASSINANTES.forEach(a => {
            const btn = root.querySelector(`[data-assinar="${a.key}"]`);
            if (!btn) return;
            btn.onclick = async () => {
              const nome = App.currentUser?.nome;
              if (!nome) return UI.toast('Não foi possível identificar seu usuário','warn');
              const payload = {
                ...t,
                assinaturas: { ...(t.assinaturas || {}), [a.key]: { nome, data: new Date().toISOString() } },
              };
              btn.disabled = true;
              try {
                const saved = await Store.upsertAwait('transicoes', payload);
                Object.assign(t, saved);
                UI.toast(`Assinado por ${nome}`,'success');
                close();
                this.openTransicaoDetalhe(t.id);
              } catch (err) {
                // Backend recusou (ex.: a pessoa logada não é a autorizada para esta key).
                btn.disabled = false;
                UI.toast(err?.message || 'Não foi possível assinar','error');
              }
            };
          });
        }

        root.querySelector('#btnGerarDocTransicao').onclick = () => this.exportTransicaoPDF(t);
      }
    });
  },

  exportTransicaoPDF(t) {
    const cli = Store.cliente(t.clienteId);
    const gp = Store.pessoa(t.gpId);
    const bloqueado = TransicaoCS.isAssinado(t);
    const empresa = escapeHTML(t.clienteEmpresa || cli?.empresa || '—');
    const contato = cli?.contato || cli?.nome || '';

    const perguntasHTML = TransicaoCS.PERGUNTAS.map((p, i) => {
      const resp = (t.respostas?.['q'+i] || '').trim();
      return `
      <div class="qa">
        <div class="qa-q"><span class="qa-num">${String(i+1).padStart(2,'0')}</span>${escapeHTML(p)}</div>
        <div class="qa-a">${resp ? escapeHTML(resp).replace(/\n/g,'<br>') : '<span class="muted">Sem resposta registrada.</span>'}</div>
      </div>`;
    }).join('');

    const assinaturasHTML = TransicaoCS.ASSINANTES.map(a => {
      const s = t.assinaturas?.[a.key];
      const nomeEsperado = a.key === 'gp' ? (gp?.nome || 'GP responsável') : a.nomeFixo;
      return `
      <div class="sig-card ${s ? 'sig-ok' : 'sig-pending'}">
        <div class="sig-icon">${s ? '&#10003;' : '&#9679;'}</div>
        <div class="sig-info">
          <div class="sig-role">${escapeHTML(a.label)}</div>
          <div class="sig-name">${escapeHTML(nomeEsperado)}</div>
          ${s
            ? `<div class="sig-meta">Assinado por <b>${escapeHTML(s.nome)}</b><br>${new Date(s.data).toLocaleString('pt-BR')}</div>`
            : `<div class="sig-meta muted">Assinatura pendente</div>`}
        </div>
      </div>`;
    }).join('');

    const geradoEm = new Date().toLocaleString('pt-BR');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transição CS — ${empresa}</title>
<style>
  @page { margin: 28mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color:#1e293b; margin:0; padding:36px 40px; font-size:13px; line-height:1.55; }
  .doc-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #4f46e5; padding-bottom:18px; margin-bottom:24px; }
  .doc-header .brand { font-size:12px; letter-spacing:2px; text-transform:uppercase; color:#4f46e5; font-weight:700; margin-bottom:6px; }
  .doc-header h1 { font-size:22px; margin:0 0 4px; color:#0f172a; }
  .doc-header .sub { font-size:13px; color:#64748b; }
  .status-badge { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:999px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; }
  .status-badge.ok { background:#dcfce7; color:#15803d; }
  .status-badge.pending { background:#fef3c7; color:#b45309; }

  .info-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:30px; }
  .info-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; }
  .info-box .label { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#94a3b8; font-weight:700; margin-bottom:4px; }
  .info-box .value { font-size:14px; font-weight:600; color:#0f172a; }
  .info-box .value.small { font-size:12px; font-weight:500; color:#475569; }

  .section-title { font-size:14px; font-weight:800; color:#0f172a; margin:28px 0 14px; padding-bottom:8px; border-bottom:2px solid #e2e8f0; display:flex; align-items:center; gap:8px; }
  .section-title::before { content:''; width:5px; height:16px; background:#4f46e5; border-radius:3px; display:inline-block; }

  .qa { padding:12px 0; border-bottom:1px solid #eef1f6; page-break-inside:avoid; }
  .qa:last-child { border-bottom:none; }
  .qa-q { font-weight:700; color:#1e293b; font-size:12.5px; margin-bottom:6px; display:flex; gap:8px; }
  .qa-num { color:#4f46e5; font-weight:800; font-size:11px; }
  .qa-a { color:#475569; font-size:12.5px; padding-left:24px; }
  .qa-a .muted { color:#a3aab8; font-style:italic; }

  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:6px; }
  .sig-card { display:flex; gap:12px; align-items:flex-start; border-radius:10px; padding:14px; border:1px solid #e2e8f0; page-break-inside:avoid; }
  .sig-card.sig-ok { background:#f0fdf4; border-color:#bbf7d0; }
  .sig-card.sig-pending { background:#fffbeb; border-color:#fde68a; }
  .sig-icon { width:26px; height:26px; min-width:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; }
  .sig-ok .sig-icon { background:#22c55e; color:#fff; }
  .sig-pending .sig-icon { background:#f59e0b; color:#fff; }
  .sig-role { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#94a3b8; font-weight:700; }
  .sig-name { font-size:13px; font-weight:700; color:#0f172a; margin:2px 0 4px; }
  .sig-meta { font-size:11px; color:#475569; }
  .sig-meta.muted { color:#a3892f; font-style:italic; }

  .doc-footer { margin-top:36px; padding-top:14px; border-top:1px solid #e2e8f0; font-size:10.5px; color:#94a3b8; display:flex; justify-content:space-between; }
  .no-print { margin-top:24px; }
  .no-print button { background:#4f46e5; color:#fff; border:none; padding:10px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
  @media print { .no-print{ display:none } body{ padding:0; } }
</style></head>
<body>
  <div class="doc-header">
    <div>
      <div class="brand">FlowDesk</div>
      <h1>Passagem de Bastão — Transição para o CS</h1>
      <div class="sub">${empresa}</div>
    </div>
    <span class="status-badge ${bloqueado ? 'ok' : 'pending'}">${bloqueado ? '&#10003; Documento assinado' : '&#9679; Assinaturas pendentes'}</span>
  </div>

  <div class="info-grid">
    <div class="info-box"><div class="label">Cliente</div><div class="value">${empresa}</div>${contato ? `<div class="value small">${escapeHTML(contato)}</div>` : ''}</div>
    <div class="info-box"><div class="label">GP responsável</div><div class="value">${escapeHTML(gp?.nome || '—')}</div></div>
    <div class="info-box"><div class="label">Data da transição</div><div class="value">${t.dataTransicao ? fmtDate(t.dataTransicao) : '—'}</div></div>
  </div>

  <div class="section-title">Questionário de passagem de bastão</div>
  ${perguntasHTML}

  <div class="section-title">Assinaturas</div>
  <div class="sig-grid">${assinaturasHTML}</div>

  <div class="doc-footer">
    <span>Documento gerado pelo FlowDesk em ${geradoEm}</span>
    <span>${bloqueado ? 'Status: assinado por todos os signatários' : 'Status: aguardando assinaturas'}</span>
  </div>

  <div class="no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }
};

/* ============ Transição para o CS — regras fixas ============ */
const TransicaoCS = {
  PERGUNTAS: [
    'O que foi vendido e qual era o objetivo principal do cliente?',
    'O que foi efetivamente entregue?',
    'O que ficou fora do escopo?',
    'O que ainda está pendente?',
    'Existem promessas ou acordos feitos durante a implantação que precisamos conhecer?',
    'Quais são os principais problemas ou riscos atuais?',
    'Quais chamados/demandas estão abertos?',
    'Quais são os processos mais críticos do cliente?',
    'Quais são as principais customizações e integrações?',
    'Quem são os principais contatos e decisores?',
    'Como está o relacionamento com o cliente hoje?',
    'Existe alguma insatisfação que precisamos tratar?',
    'Quais oportunidades comerciais foram identificadas durante a implantação?',
    'Existe alguma particularidade contratual ou condição comercial que precisamos conhecer?',
    'Qual é a recomendação de Serviços para o time de Base a partir de agora?'
  ],

  // Assinantes fixos (hardcoded), independentemente da equipe cadastrada.
  // Os e-mails aqui são só para checagem de UX (mostrar/esconder o botão);
  // a validação que realmente vale está no backend (src/server/db/api.ts),
  // então mesmo que alguém edite este JS no navegador não consegue assinar
  // como outra pessoa — o servidor rejeita pelo e-mail da sessão logada.
  ASSINANTES: [
    { key: 'rogerio', label: 'Aprovador', nomeFixo: 'Rogério Furian', email: 'rogerio.sorci@sankhya.com.br' },
    { key: 'gp',       label: 'GP responsável', nomeFixo: 'GP responsável pela transição' },
    { key: 'renato',   label: 'Aprovador', nomeFixo: 'Renato Xavier', email: 'renato.xavier@sankhya.com.br' },
    { key: 'gustavo',  label: 'Aprovador', nomeFixo: 'Gustavo Furian', email: 'gustavo.germano@sankhya.com.br' },
  ],

  isAssinado(t) {
    if (!t || !t.assinaturas) return false;
    return this.ASSINANTES.every(a => !!t.assinaturas[a.key]);
  },

  // A pessoa logada pode assinar esta key? (checagem de UX; a de verdade é no backend)
  podeAssinar(t, a) {
    const user = App.currentUser;
    if (!user) return false;
    if (a.key === 'gp') {
      return !!t.gpId && t.gpId === App.currentUserPessoaId;
    }
    return !!(user.email && a.email && user.email.toLowerCase() === a.email.toLowerCase());
  },

  renderAssinanteRow(t, a) {
    const s = t.assinaturas?.[a.key];
    const gp = Store.pessoa(t.gpId);
    const nomeEsperado = a.key === 'gp' ? (gp?.nome || 'GP responsável') : a.nomeFixo;
    if (s) {
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px;">
          <i class="fa-solid fa-circle-check" style="color:#10b981;font-size:18px;"></i>
          <div style="flex:1;">
            <div style="font-weight:600;">${escapeHTML(a.label)} — ${escapeHTML(nomeEsperado)}</div>
            <div style="font-size:12px;color:var(--text-2);">Assinado por ${escapeHTML(s.nome)} em ${new Date(s.data).toLocaleString('pt-BR')}</div>
          </div>
        </div>`;
    }
    const podeAssinar = this.podeAssinar(t, a);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px;flex-wrap:wrap;">
        <i class="fa-regular fa-circle" style="color:var(--text-2);font-size:18px;"></i>
        <div style="flex:1;min-width:160px;">
          <div style="font-weight:600;">${escapeHTML(a.label)} — ${escapeHTML(nomeEsperado)}</div>
          <div style="font-size:12px;color:var(--text-2);">${podeAssinar ? 'Pendente de assinatura' : 'Só ' + escapeHTML(nomeEsperado) + ' pode assinar aqui'}</div>
        </div>
        ${podeAssinar
          ? `<button class="btn btn-primary" data-assinar="${a.key}"><i class="fa-solid fa-signature"></i> Assinar como ${escapeHTML(App.currentUser?.nome || '')}</button>`
          : ''}
      </div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());