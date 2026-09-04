/* ============ FlowDesk — Reusable UI Components ============ */
const UI = {};

UI.toast = function(msg, type='info', ms=3000) {
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = { success:'check-circle', warn:'triangle-exclamation', error:'circle-xmark', info:'circle-info' }[type] || 'circle-info';
  el.innerHTML = `<i class="fa-solid fa-${icon}"></i><div class="msg">${escapeHTML(msg)}</div>`;
  root.appendChild(el);
  setTimeout(()=> { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='.3s'; }, ms-300);
  setTimeout(()=> el.remove(), ms);
};

UI.confirm = function(title, message, onOk) {
  const root = $('#confirmRoot');
  root.innerHTML = `
  <div class="modal-backdrop">
    <div class="modal sm">
      <div class="modal-head"><h3>${escapeHTML(title)}</h3></div>
      <div class="modal-body"><p style="margin:0;color:var(--text-2)">${escapeHTML(message)}</p></div>
      <div class="modal-foot">
        <button class="btn" data-a="cancel">Cancelar</button>
        <button class="btn btn-danger" data-a="ok"><i class="fa-solid fa-trash"></i> Confirmar</button>
      </div>
    </div>
  </div>`;
  const close = () => root.innerHTML = '';
  root.querySelector('[data-a="cancel"]').onclick = close;
  root.querySelector('.modal-backdrop').onclick = (e) => { if (e.target === e.currentTarget) close(); };
  root.querySelector('[data-a="ok"]').onclick = () => { close(); onOk && onOk(); };
};

UI.modal = function({ title, body, size='', footer, onOpen }) {
  const root = $('#modalRoot');
  const cls = size ? size : '';
  root.innerHTML = `
  <div class="modal-backdrop">
    <div class="modal ${cls}">
      <div class="modal-head">
        <h3>${escapeHTML(title)}</h3>
        <button class="icon-btn" data-close><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  </div>`;
  const close = () => root.innerHTML = '';
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.modal-backdrop').onclick = (e) => { if (e.target === e.currentTarget) close(); };
  document.addEventListener('keydown', function esc(e){ if (e.key==='Escape'){ close(); document.removeEventListener('keydown', esc); } });
  onOpen && onOpen(root, close);
  return { close };
};

UI.drawer = function({ title, body, onOpen }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="drawer-backdrop"></div>
    <aside class="drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3>${escapeHTML(title)}</h3>
        <button class="icon-btn" data-close><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="drawer-body">${body}</div>
    </aside>`;
  const close = () => root.innerHTML = '';
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.drawer-backdrop').onclick = close;
  onOpen && onOpen(root, close);
  return { close };
};

UI.statusPill = (s) => {
  const st = STATUS[s] || STATUS.backlog;
  return `<span class="status ${st.className}"><span class="dot" style="background:${st.color}"></span>${st.label}</span>`;
};
UI.prioPill = (p) => {
  const pr = PRIORIDADE[p] || PRIORIDADE.normal;
  return `<span class="prio"><span class="dot ${p}"></span>${pr.label}</span>`;
};
UI.equipeAreaPill = (e) => {
  if (!e || !EQUIPE_AREA[e]) return '<span style="color:var(--text-2)">—</span>';
  const ea = EQUIPE_AREA[e];
  return `<span class="status" style="background:${ea.color}22;color:${ea.color}"><span class="dot" style="background:${ea.color}"></span>${ea.label}</span>`;
};

UI.select = (name, options, selected, extra='') =>
  `<select name="${name}" ${extra}>${options.map(o =>
    `<option value="${escapeHTML(o.value)}" ${o.value===selected?'selected':''}>${escapeHTML(o.label)}</option>`
  ).join('')}</select>`;

UI.emptyState = (icon='inbox', text='Nada por aqui ainda.') =>
  `<div class="empty"><i class="fa-solid fa-${icon}"></i><div>${escapeHTML(text)}</div></div>`;

UI.skeletonRows = (n=5, cols=6) => {
  let out='';
  for (let i=0;i<n;i++){
    out += '<tr>';
    for (let c=0;c<cols;c++) out += `<td><div class="skeleton" style="height:14px;width:${randInt(40,90)}%"></div></td>`;
    out += '</tr>';
  }
  return out;
};

/* ---------- Forms ---------- */
UI.clienteForm = (c={}) => `
<form id="clienteForm" class="form-grid">
  <div class="field"><label>Nome *</label><input name="nome" required value="${escapeHTML(c.nome||'')}"/></div>
  <div class="field"><label>Empresa *</label><input name="empresa" required value="${escapeHTML(c.empresa||'')}"/></div>
  <div class="field"><label>Contato</label><input name="contato" value="${escapeHTML(c.contato||'')}"/></div>
  <div class="field"><label>Telefone</label><input name="telefone" id="clienteTelefone" placeholder="(11) 91234-5678" maxlength="15" value="${escapeHTML(maskPhone(c.telefone||''))}"/></div>
  <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHTML(c.email||'')}"/></div>
  <div class="field"><label>Cidade</label><input name="cidade" value="${escapeHTML(c.cidade||'')}"/></div>
  <div class="field full"><label>Observações</label><textarea name="obs">${escapeHTML(c.obs||'')}</textarea></div>
</form>`;

UI.projetoForm = (p={}) => {
  const cliOpts = Store.clientes().map(c=>({value:c.id,label:c.empresa+' — '+c.nome}));
  const respOpts = Store.equipe().map(e=>({value:e.id,label:e.nome}));
  const stOpts = STATUS_ORDER.filter(s=>s!=='atrasado').map(s=>({value:s,label:STATUS[s].label}));
  const prOpts = Object.keys(PRIORIDADE).map(k=>({value:k,label:PRIORIDADE[k].label}));
  return `
  <form id="projetoForm" class="form-grid">
    <div class="field full"><label>Nome *</label><input name="nome" required value="${escapeHTML(p.nome||'')}"/></div>
    <div class="field"><label>Cliente *</label>${UI.select('clienteId',[{value:'',label:'Selecione...'},...cliOpts], p.clienteId||'','required')}</div>
    <div class="field"><label>Executante</label>${UI.select('responsavelId',[{value:'',label:'—'},...respOpts], p.responsavelId||'')}</div>
    <div class="field"><label>Data início</label><input type="date" name="inicio" value="${p.inicio?isoDay(p.inicio):''}"/></div>
    <div class="field"><label>Prazo</label><input type="date" name="prazo" value="${p.prazo?isoDay(p.prazo):''}"/></div>
    <div class="field"><label>Status</label>${UI.select('status',stOpts,p.status||'backlog')}</div>
    <div class="field"><label>Prioridade</label>${UI.select('prioridade',prOpts,p.prioridade||'normal')}</div>
    <div class="field full"><label>Descrição</label><textarea name="descricao">${escapeHTML(p.descricao||'')}</textarea></div>
    <div class="field full"><label>Observações</label><textarea name="obs">${escapeHTML(p.obs||'')}</textarea></div>
  </form>`;
};

/* ---------- Ordens de Serviço ---------- */
const OS_STATUS_OPTIONS = [
  {value:'sem_descricao_sla', label:'<SEM DESCRICAO SLA>'},
  {value:'agenda', label:'AGENDA'},
  {value:'aguardando_analise', label:'AGUARDANDO ANÁLISE'},
  {value:'aguardando_aprovacao', label:'AGUARDANDO APROVACAO'},
  {value:'aguardando_atendimento', label:'AGUARDANDO ATENDIMENTO'},
  {value:'aguardando_execucao', label:'AGUARDANDO EXECUÇÃO'},
  {value:'aguardando_resposta_usuario', label:'AGUARDANDO RESPOSTA DO USUÁRIO'},
  {value:'aguardando_validacao', label:'AGUARDANDO VALIDAÇÃO'},
  {value:'cancelado', label:'CANCELADO'},
  {value:'concluido', label:'CONCLUÍDO'},
  {value:'conformidade', label:'CONFORMIDADE'},
  {value:'desenhando_solucao', label:'DESENHANDO SOLUÇÃO'},
  {value:'em_andamento', label:'EM ANDAMENTO'},
  {value:'novo', label:'NOVO'},
  {value:'reprovado', label:'REPROVADO'},
  {value:'solucionado', label:'SOLUCIONADO'}
];

const OS_ORIGEM_OPTIONS = [
  {value:'email', label:'E-MAIL'},
  {value:'telefones', label:'TELEFONES'},
  {value:'whatsapp', label:'WHATSAPP'},
  {value:'whatsapp_base', label:'WHATSAPP BASE'}
];

const OS_CENTRO_RESULTADO_OPTIONS = [
  'ADM/FINANCEIRO','APP','ASIS','BOLT','COMERCIAL','CONSULTORIA/IMPLANTACAO','CUSTOMIZACAO',
  'CYBER SEGURANCA','DHARA','DIRETORIA','EQUIPAMENTOS','ESPRESSO','FIELD SERVICE','FLOWBIZ',
  'GESTAO OPME','GRUPO OPTEC','HORAS NÃO PRODUTIVAS','IMPRESSORAS','INTEGRACAO','LICENÇA DESK MANAGER',
  'LICENÇA VPN','LINCROS','LINK DE INTERNET','MANUTENCAO','MEETIME','MICROSOFT','MINDSIGHT','NEPPO',
  'NOTEBOOKS/DESKTOPS','OPCLOUD','PAINEL DO CLIENTE','PECAS','PLOOMES','PONTOTEL','PORTAL DE PEDIDOS',
  'PORTAL DO CLIENTE','RH/DP','SANKHYA','SERVICE DESK','SERVICE ON SITE','SERVICOS','SI CUSTOMIZACAO',
  'SI GERENCIA DE PROJETO','SI IMPLANTACAO','TABLET','VIXTING'
].map(label => ({value: label, label}));

const OS_PRODUTO_OPTIONS = [
  {value:'implantacao_sankhya', label:'IMPLANTACAO SANKHYA'},
  {value:'gerencia_sankhya', label:'GERENCIA SANKHYA'}
];

const OS_SERVICO_OPTIONS = [
  {value:'consultoria_implantacao', label:'CONSULTORIA DE IMPLANTAÇÃO'},
  {value:'gerencia_projetos', label:'GERENCIA DE PROJETOS'}
];

const OS_CLASSIFICACAO_OPTIONS = [
  {value:'conformidade', label:'CONFORMIDADE'},
  {value:'nao_conformidade', label:'NÃO CONFORMIDADE'},
  {value:'servicos_complementares', label:'SERVIÇOS COMPLEMENTARES'}
];

const OS_APONTAMENTO_STATUS_OPTIONS = [
  {value:'agenda', label:'AGENDA'},
  {value:'em_andamento', label:'EM ANDAMENTO'}
];

const osStatusLabelMap = Object.fromEntries(OS_STATUS_OPTIONS.map(o => [o.value, o.label]));
UI.osStatusPill = (s) => {
  const label = osStatusLabelMap[s] || s || '<SEM DESCRICAO SLA>';
  const cls = s === 'concluido' || s === 'solucionado' ? 'concluido'
    : s === 'cancelado' || s === 'reprovado' ? 'cancelado'
    : s === 'em_andamento' ? 'dev'
    : s === 'novo' || s === 'agenda' ? 'analise'
    : 'cliente';
  return `<span class="os-status ${cls}"><span class="dot"></span>${escapeHTML(label)}</span>`;
};

UI.osForm = (os={}, opts={}) => {
  const demandas = Store.demandas().slice().sort((a,b) =>
    (a.titulo||'').localeCompare(b.titulo||'', 'pt-BR'));
  const demandaOpts = [{ value:'', label:'Selecione a demanda...' }, ...demandas.map(d => ({
    value:d.id,
    label:`#${Store.demandaSeq(d.id)} — ${d.titulo}`
  }))];
  const respOpts = [{ value:'', label:'—' }, ...Store.equipe().map(e => ({ value:e.id, label:e.nome })), { value:'__novo', label:'+ Outro (digitar nome)...' }];
  const statusOpts = OS_STATUS_OPTIONS;
  const origemOpts = [{value:'',label:'—'}, ...OS_ORIGEM_OPTIONS];
  const centroResultadoOpts = [{value:'', label:'—'}, ...OS_CENTRO_RESULTADO_OPTIONS];
  const selectedDemandaId = os.demandaId || opts.demandaId || '';
  const d = selectedDemandaId ? Store.demanda(selectedDemandaId) : null;
  const cli = d?.clienteId ? Store.cliente(d.clienteId) : null;
  const respId = os.responsavelId || d?.responsavelId || '';
  const respNome = os.responsavelNome || nomeResponsavel(d) || '';
  const apontamentos = Array.isArray(os.apontamentos) && os.apontamentos.length ? os.apontamentos : [{}];
  const resumo = (() => {
    const mins = (apontamentos||[]).reduce((total,a) => {
      if (!a.horaInicial || !a.horaFinal) return total;
      const [hi,mi] = a.horaInicial.split(':').map(Number);
      const [hf,mf] = a.horaFinal.split(':').map(Number);
      let dlt = (hf*60+mf) - (hi*60+mi) - Number(a.intervalo||0);
      if (dlt < 0) dlt += 24*60;
      return total + Math.max(0,dlt);
    },0);
    return { mins, count: apontamentos.length };
  })();
  const previsto = Number(os.tempoPrevisto||0);
  const consumo = previsto > 0 ? Math.min(999, (resumo.mins/previsto)*100) : 0;

  const escTab = (id,label,icon,active=false) => `<button type="button" class="os-form-tab ${active?'active':''}" data-os-tab="${id}"><i class="fa-solid fa-${icon}"></i>${label}</button>`;

  return `
  <form id="osForm" class="os-form" data-default-demanda="${escapeHTML(selectedDemandaId)}">
    <div class="os-modal-summary">
      <div class="os-modal-summary-main">
        <div class="os-modal-kicker">${os?.numero ? `OS-${Number(os.numero).toString().padStart(5,'0')}` : 'NOVA OS'}</div>
        <div class="os-modal-title" id="osModalSummaryTitle">${escapeHTML(d?.titulo || 'Vincule uma demanda')}</div>
        <div class="os-modal-subtitle" id="osModalSummaryContext">${escapeHTML(cli?.empresa || 'Cliente será preenchido pela demanda')} · ${escapeHTML(d?.solicitanteNome || cli?.contato || cli?.nome || 'Solicitante será preenchido pela demanda')}</div>
      </div>
      <div class="os-modal-summary-status" id="osModalSummaryStatus">${UI.osStatusPill(os.statusOs||'novo')}</div>
    </div>

    <div class="os-form-tabs" role="tablist" aria-label="Dados da OS">
      ${escTab('geral','Geral','circle-info',true)}
      ${escTab('apontamentos','Apontamentos','clock')}
      ${escTab('historico','Histórico','clock-rotate-left')}
    </div>

    <section class="os-form-tab-panel active" data-os-panel="geral">
      <div class="os-form-section">
        <div class="os-form-section-head"><div><h4>Identificação da OS</h4><span>A OS nasce de uma demanda e herda automaticamente seu contexto.</span></div></div>
        <div class="form-grid">
          <div class="field full"><label>Demanda *</label>${UI.select('demandaId', demandaOpts, selectedDemandaId, 'required')}</div>
          <div class="field"><label>Cliente</label><input id="osCliente" readonly value="${escapeHTML(cli?.empresa||'')}" placeholder="Será preenchido pela demanda"/></div>
          <div class="field"><label>Solicitante / Contato</label><input id="osSolicitante" readonly value="${escapeHTML(d?.solicitanteNome || cli?.contato || cli?.nome || '')}" placeholder="Será preenchido pela demanda"/></div>
          <div class="field"><label>Executante</label>${UI.select('responsavelId', respOpts, respId)}
            <input name="responsavelNomeLivre" id="osResponsavelLivre" placeholder="Nome do executante" style="margin-top:8px;${respId==='__novo'?'':'display:none'}" value="${escapeHTML(respNome)}"/>
          </div>
          <div class="field"><label>Status da OS</label>${UI.select('statusOs', statusOpts, os.statusOs||'novo')}</div>
          <div class="field"><label>Origem</label>${UI.select('origem', origemOpts, os.origem||'')}</div>
          <div class="field"><label>Contrato</label><input name="contrato" value="${escapeHTML(os.contrato||'')}" placeholder="Ex.: Contrato 15"/></div>
          <div class="field"><label>Ambiente</label><input name="ambiente" value="${escapeHTML(os.ambiente||'')}" placeholder="Ex.: Produção / Homologação"/></div>
          <div class="field"><label>Centro de Resultado</label>${UI.select('centroResultado', centroResultadoOpts, os.centroResultado||'')}</div>
          <div class="field"><label>Tempo previsto (min)</label><input type="number" min="0" name="tempoPrevisto" value="${escapeHTML(os.tempoPrevisto ?? '')}"/><small class="field-help">${previsto ? `${(previsto/60).toFixed(1).replace('.',',')} h previstas` : 'Informe para acompanhar o consumo'}</small></div>
          <div class="field"><label>Data limite</label><input type="date" name="dataLimite" value="${os.dataLimite?isoDay(os.dataLimite):''}"/></div>
          <div class="field"><label>Hora limite</label><input type="time" name="horaLimite" value="${escapeHTML(os.horaLimite||'')}"/></div>
          <div class="field"><label>OS relacionada</label><input name="osRelacionada" value="${escapeHTML(os.osRelacionada||'')}" placeholder="Nº da OS relacionada"/></div>
          <div class="field full"><label>Observações</label><textarea name="observacoes" placeholder="Observações gerais da OS">${escapeHTML(os.observacoes||'')}</textarea></div>
        </div>
      </div>
    </section>

    <section class="os-form-tab-panel" data-os-panel="apontamentos">
      <div class="os-live-metrics" id="osLiveMetrics">
        <div class="os-live-metric"><span>Apontamentos</span><strong id="osMetricCount">${resumo.count}</strong></div>
        <div class="os-live-metric"><span>Tempo realizado</span><strong id="osMetricRealizado">${Math.floor(resumo.mins/60)}h ${resumo.mins%60}min</strong></div>
        <div class="os-live-metric"><span>Tempo previsto</span><strong id="osMetricPrevisto">${previsto ? `${Math.floor(previsto/60)}h ${previsto%60}min` : '—'}</strong></div>
        <div class="os-live-metric"><span>Consumo</span><strong id="osMetricConsumo">${previsto ? `${consumo.toFixed(0)}%` : '—'}</strong></div>
      </div>
      <div class="os-progress-wrap" id="osProgressWrap" style="${previsto?'':'display:none'}"><div class="os-progress-track"><span id="osProgressBar" style="width:${Math.min(consumo,100)}%"></span></div></div>
      <div class="os-form-section">
        <div class="os-form-section-head"><div><h4>Registro de trabalho</h4><span>Cada apontamento representa uma sessão de atendimento. O tempo é calculado automaticamente.</span></div>
          <button type="button" class="btn btn-sm btn-primary" id="osAddApontamento"><i class="fa-solid fa-plus"></i> Novo apontamento</button>
        </div>
        <div id="osApontamentos" class="os-apontamentos" data-count="${apontamentos.length}"></div>
      </div>
    </section>

    <section class="os-form-tab-panel" data-os-panel="historico">
      <div class="os-form-section">
        <div class="os-form-section-head"><div><h4>Histórico da OS</h4><span>Resumo dos principais eventos registrados localmente.</span></div></div>
        <div class="os-history-list">
          <div class="os-history-item"><span class="os-history-dot"></span><div><strong>OS criada</strong><small>${os.criadoEm ? new Date(os.criadoEm).toLocaleString('pt-BR') : 'Ao salvar'}</small></div></div>
          <div class="os-history-item"><span class="os-history-dot"></span><div><strong>Última atualização</strong><small>${os.atualizadoEm ? new Date(os.atualizadoEm).toLocaleString('pt-BR') : 'Ainda não salva'}</small></div></div>
          <div class="os-history-item"><span class="os-history-dot"></span><div><strong>Integração Sankhya</strong><small>${os.sankhya?.status === 'enviado' ? `Enviada em ${new Date(os.sankhya.data).toLocaleString('pt-BR')}` : 'Pendente de integração'}</small></div></div>
        </div>
      </div>
    </section>
  </form>`;
};

UI.osApontamentoCard = (a={}, index=0) => {
  const classOpts = OS_CLASSIFICACAO_OPTIONS;
  const statusOpts = OS_APONTAMENTO_STATUS_OPTIONS;
  const priorityOpts = Object.keys(PRIORIDADE).map(k => ({ value:k, label:PRIORIDADE[k].label }));
  const date = a.dataExecucao || isoDay(today());
  const calcMin = (() => {
    if (!a.horaInicial || !a.horaFinal) return 0;
    const [hi,mi] = a.horaInicial.split(':').map(Number);
    const [hf,mf] = a.horaFinal.split(':').map(Number);
    let d = (hf*60+mf) - (hi*60+mi) - Number(a.intervalo||0);
    if (d < 0) d += 24*60;
    return Math.max(0,d);
  })();
  const tempoTxt = calcMin ? `${Math.floor(calcMin/60)}h ${calcMin%60}min` : 'Sem horas registradas';
  const podeIniciar = !a.horaInicial;
  const podeFinalizar = !!a.horaInicial && !a.horaFinal;
  return `
    <div class="os-apontamento" data-os-apontamento="${index}">
      <div class="os-apontamento-head">
        <div><span class="os-apontamento-index">${index+1}</span><div><strong>Sessão de atendimento</strong><div class="os-table-muted">${tempoTxt}</div></div></div>
        <div class="os-apontamento-actions">
          <button type="button" class="btn btn-sm ${podeIniciar?'btn-primary':''}" data-action="${podeIniciar?'start':'finish'}" title="${podeIniciar?'Registrar início agora':'Registrar fim agora'}"><i class="fa-solid fa-${podeIniciar?'play':'stop'}"></i> ${podeIniciar?'Iniciar':'Finalizar'}</button>
          <button type="button" class="icon-btn os-remove-apontamento" title="Remover apontamento" ${index===0?'disabled':''}><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Produto</label>${UI.select(`produto_${index}`, [{value:'',label:'—'},...OS_PRODUTO_OPTIONS], a.produto||'', 'data-key="produto"')}</div>
        <div class="field"><label>Serviço *</label>${UI.select(`servico_${index}`, [{value:'',label:'Selecione...'},...OS_SERVICO_OPTIONS], a.servico||'', 'data-key="servico" required')}</div>
        <div class="field"><label>Data de execução</label><input type="date" data-key="dataExecucao" value="${escapeHTML(date)}"/></div>
        <div class="field"><label>Executante</label><select data-key="executanteId"><option value="">—</option>${Store.equipe().map(e=>`<option value="${escapeHTML(e.id)}" ${e.id===(a.executanteId||'')?'selected':''}>${escapeHTML(e.nome)}</option>`).join('')}</select></div>
        <div class="field"><label>Hora inicial</label><input type="time" data-key="horaInicial" value="${escapeHTML(a.horaInicial||'')}"/></div>
        <div class="field"><label>Hora final</label><input type="time" data-key="horaFinal" value="${escapeHTML(a.horaFinal||'')}"/></div>
        <div class="field"><label>Intervalo (min)</label><input type="number" min="0" data-key="intervalo" value="${escapeHTML(a.intervalo ?? 0)}"/></div>
        <div class="field"><label>Classificação</label>${UI.select(`classificacao_${index}`, [{value:'',label:'—'},...classOpts], a.classificacao||'', 'data-key="classificacao"')}</div>
        <div class="field"><label>Motivo</label><input data-key="motivo" value="${escapeHTML(a.motivo||'')}" placeholder="Ex.: Bonificação, erro, ajuste..."/></div>
        <div class="field"><label>Projeto</label>${UI.select(`projeto_${index}`, [{value:'',label:'—'},...Store.projetos().map(p=>({value:p.id,label:p.nome}))], a.projetoId||'', 'data-key="projetoId"')}</div>
        <div class="field"><label>Status</label>${UI.select(`apstatus_${index}`, statusOpts, a.status||'agenda', 'data-key="status"')}</div>
        <div class="field"><label>Prioridade</label>${UI.select(`prioridade_${index}`, priorityOpts, a.prioridade||'normal', 'data-key="prioridade"')}</div>
        <div class="field"><label>Agendamento</label><input type="datetime-local" data-key="agendamento" value="${escapeHTML(a.agendamento||'')}"/></div>
        <div class="field"><label>Valor</label><input type="number" min="0" step="0.01" data-key="valor" value="${escapeHTML(a.valor ?? '')}" placeholder="0,00"/></div>
        <div class="field"><label>Data limite</label><input type="date" data-key="dataLimite" value="${a.dataLimite?isoDay(a.dataLimite):''}"/></div>
        <div class="field full"><label>Descrição / registro de trabalho</label><textarea data-key="descricao" placeholder="Descreva o que foi realizado...">${escapeHTML(a.descricao||'')}</textarea></div>
      </div>
    </div>`;
};

UI.demandaForm = (d={}, opts={}) => {
  const clientesAll = Store.clientes();
  // Agrupa clientes por empresa (nome exato), removendo duplicatas de empresa no dropdown
  const empresaMap = {};
  clientesAll.forEach(c => {
    const key = (c.empresa||'').trim();
    if (!empresaMap[key]) empresaMap[key] = [];
    empresaMap[key].push(c);
  });
  const empresasUnicas = Object.keys(empresaMap).sort((a,b)=>a.localeCompare(b));
  const cliOpts = empresasUnicas.map(emp => ({ value: emp, label: emp }));

  const projOpts = Store.projetos().map(p=>({value:p.id,label:p.nome}));
  const respOpts = Store.equipe().map(e=>({value:e.id,label:e.nome}));
  const stOpts = STATUS_ORDER.filter(s=>s!=='atrasado').map(s=>({value:s,label:STATUS[s].label}));
  const prOpts = Object.keys(PRIORIDADE).map(k=>({value:k,label:PRIORIDADE[k].label}));

  // Empresa de cada projeto (via projeto.clienteId -> cliente.empresa), para filtro cruzado
  const empresaDoProjeto = {};
  const clienteDoProjeto = {};
  Store.projetos().forEach(p => {
    const c = p.clienteId ? Store.cliente(p.clienteId) : null;
    empresaDoProjeto[p.id] = c ? (c.empresa||'').trim() : '';
    clienteDoProjeto[p.id] = p.clienteId || '';
  });
  // Empresa -> lista de projetos daquela empresa
  const projetosPorEmpresa = {};
  Store.projetos().forEach(p => {
    const emp = empresaDoProjeto[p.id];
    if (!emp) return;
    (projetosPorEmpresa[emp] = projetosPorEmpresa[emp] || []).push({ id: p.id, label: p.nome });
  });

  // Empresa atualmente selecionada: prioriza a empresa do projeto já salvo (se houver);
  // senão cai na empresa do contato (clienteId) salvo na demanda.
  const projetoAtual = d.projetoId ? Store.projeto(d.projetoId) : null;
  const clienteAtual = d.clienteId ? Store.cliente(d.clienteId) : null;
  const empresaAtual = (projetoAtual ? empresaDoProjeto[projetoAtual.id] : '') || (clienteAtual ? (clienteAtual.empresa||'').trim() : '');
  const contatosDaEmpresa = empresaAtual ? (empresaMap[empresaAtual]||[]) : [];
  const solicOpts = contatosDaEmpresa.map(c => ({ value: c.id, label: c.contato || c.nome }));
  // Projetos visíveis inicialmente: só os da empresa selecionada (se houver empresa selecionada)
  const projOptsFiltrados = empresaAtual ? (projetosPorEmpresa[empresaAtual]||[]) : projOpts;

  // Guarda os mapas no próprio DOM (via data attributes em JSON) para uso no onchange
  const mapaJson = escapeHTML(JSON.stringify(
    Object.fromEntries(empresasUnicas.map(emp => [emp, empresaMap[emp].map(c => ({ id: c.id, label: c.contato || c.nome }))]))
  ));
  const projetoEmpresaMapJson = escapeHTML(JSON.stringify(empresaDoProjeto));
  const projetoClienteMapJson = escapeHTML(JSON.stringify(clienteDoProjeto));
  const empresaProjetosMapJson = escapeHTML(JSON.stringify(projetosPorEmpresa));
  const todosProjetosJson = escapeHTML(JSON.stringify(projOpts));

  // "Criado por" (equipe): em edição usa o valor já salvo na demanda; em demanda nova,
  // pré-seleciona o usuário logado (se ele tiver um registro correspondente em equipe).
  const criadoPorId = d.criadoPorId || (!d.id ? (opts.defaultCriadoPorId || '') : '');

  return `
  <form id="demandaForm" class="form-grid" data-empresa-map='${mapaJson}' data-projeto-empresa-map='${projetoEmpresaMapJson}' data-projeto-cliente-map='${projetoClienteMapJson}' data-empresa-projetos-map='${empresaProjetosMapJson}' data-todos-projetos='${todosProjetosJson}'>
    <div class="field full"><label>Título *</label><input name="titulo" required value="${escapeHTML(d.titulo||'')}"/></div>
    <div class="field"><label>Projeto</label>${UI.select('projetoId',[{value:'',label:'—'},...PROJETO_ESPECIAIS,...projOptsFiltrados], d.projetoId||'')}</div>
    <div class="field"><label>Cliente (Empresa)</label>${UI.select('empresaSelecionada',[{value:'',label:'—'},...cliOpts], empresaAtual)}</div>
    <div class="field" id="solicitanteField">
      <label>Solicitante (Contato)</label>
      ${(() => {
        const nomeAtual = d.solicitanteNome || (clienteAtual ? (clienteAtual.contato || clienteAtual.nome || '') : '');
        const idAtual = d.clienteId || '';
        // idBatido: o contato salvo/atual está entre os contatos conhecidos da empresa?
        const idBatido = idAtual && solicOpts.some(o => o.value === idAtual);
        if (solicOpts.length) {
          // Empresa com contatos cadastrados: dropdown no mesmo padrão dos demais campos.
          const opts = [{ value:'', label:'—' }, ...solicOpts, { value:'__novo', label:'+ Novo contato...' }];
          const selecionado = idBatido ? idAtual : (nomeAtual ? '__novo' : '');
          return `${UI.select('solicitanteNome', opts, selecionado)}
            <input name="solicitanteNomeLivre" placeholder="Nome do novo contato" style="margin-top:8px;${selecionado==='__novo'?'':'display:none'}" value="${escapeHTML(selecionado==='__novo' ? nomeAtual : '')}"/>`;
        }
        // Empresa sem contatos cadastrados ainda: só texto livre.
        return `<input name="solicitanteNome" placeholder="Nome do contato" value="${escapeHTML(nomeAtual)}"/>`;
      })()}
      <input type="hidden" name="clienteId" value="${escapeHTML(d.clienteId||'')}"/>
    </div>
    <div class="field" id="executanteField">
      <label>Executante</label>
      ${(() => {
        const idAtual = d.responsavelId || '';
        const nomeAtual = d.responsavelNome || '';
        const opts = [{ value:'', label:'—' }, ...respOpts, { value:'__novo', label:'+ Outro (digitar nome)...' }];
        const selecionado = idAtual ? idAtual : (nomeAtual ? '__novo' : '');
        return `${UI.select('responsavelId', opts, selecionado)}
          <input name="responsavelNomeLivre" placeholder="Nome do executante (ex: terceiro, contato do cliente)" style="margin-top:8px;${selecionado==='__novo'?'':'display:none'}" value="${escapeHTML(selecionado==='__novo' ? nomeAtual : '')}"/>`;
      })()}
    </div>
    <div class="field"><label>Criado por</label>${UI.select('criadoPorId',[{value:'',label:'—'},...respOpts], criadoPorId)}</div>
    <div class="field"><label>Equipe</label>${UI.select('equipeArea',[{value:'',label:'—'},...Object.keys(EQUIPE_AREA).map(k=>({value:k,label:EQUIPE_AREA[k].label}))], d.equipeArea||'')}</div>
    <div class="field"><label>Status</label>${UI.select('status',stOpts,d.status||'backlog')}</div>
    <div class="field"><label>Prioridade</label>${UI.select('prioridade',prOpts,d.prioridade||'normal')}</div>
    <div class="field"><label>Prazo</label><input type="date" name="prazo" value="${d.prazo?isoDay(d.prazo):''}"/></div>
    <div class="field"><label>Tempo gasto (h)</label><input type="number" min="0" step="0.5" name="tempoGasto" value="${d.tempoGasto||0}"/></div>
    <div class="field full"><label>Descrição</label><textarea name="descricao">${escapeHTML(d.descricao||'')}</textarea></div>
    <div class="field full"><label>Próximos passos</label><textarea name="proximosPassos" placeholder="O que vamos fazer">${escapeHTML(d.proximosPassos||'')}</textarea></div>
  </form>`;
};

UI.readForm = (form) => {
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((v,k)=> obj[k] = v);
  return obj;
};