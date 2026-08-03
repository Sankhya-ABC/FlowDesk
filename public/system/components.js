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
  <div class="field"><label>Empresa</label><input name="empresa" value="${escapeHTML(c.empresa||'')}"/></div>
  <div class="field"><label>Contato</label><input name="contato" value="${escapeHTML(c.contato||'')}"/></div>
  <div class="field"><label>Telefone</label><input name="telefone" value="${escapeHTML(c.telefone||'')}"/></div>
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
    <div class="field"><label>Responsável</label>${UI.select('responsavelId',[{value:'',label:'—'},...respOpts], p.responsavelId||'')}</div>
    <div class="field"><label>Data início</label><input type="date" name="inicio" value="${p.inicio?isoDay(p.inicio):''}"/></div>
    <div class="field"><label>Prazo</label><input type="date" name="prazo" value="${p.prazo?isoDay(p.prazo):''}"/></div>
    <div class="field"><label>Status</label>${UI.select('status',stOpts,p.status||'backlog')}</div>
    <div class="field"><label>Prioridade</label>${UI.select('prioridade',prOpts,p.prioridade||'normal')}</div>
    <div class="field full"><label>Descrição</label><textarea name="descricao">${escapeHTML(p.descricao||'')}</textarea></div>
    <div class="field full"><label>Observações</label><textarea name="obs">${escapeHTML(p.obs||'')}</textarea></div>
  </form>`;
};

UI.demandaForm = (d={}) => {
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

  // Empresa atualmente selecionada (a partir do clienteId salvo na demanda, se houver)
  const clienteAtual = d.clienteId ? Store.cliente(d.clienteId) : null;
  const empresaAtual = clienteAtual ? (clienteAtual.empresa||'').trim() : '';
  const contatosDaEmpresa = empresaAtual ? (empresaMap[empresaAtual]||[]) : [];
  const solicOpts = contatosDaEmpresa.map(c => ({ value: c.id, label: c.contato || c.nome }));

  // Guarda o mapa empresa -> contatos no próprio DOM (via data attribute em JSON) para uso no onchange
  const mapaJson = escapeHTML(JSON.stringify(
    Object.fromEntries(empresasUnicas.map(emp => [emp, empresaMap[emp].map(c => ({ id: c.id, label: c.contato || c.nome }))]))
  ));

  return `
  <form id="demandaForm" class="form-grid" data-empresa-map='${mapaJson}'>
    <div class="field full"><label>Título *</label><input name="titulo" required value="${escapeHTML(d.titulo||'')}"/></div>
    <div class="field"><label>Projeto</label>${UI.select('projetoId',[{value:'',label:'—'},...projOpts], d.projetoId||'')}</div>
    <div class="field"><label>Cliente (Empresa)</label>${UI.select('empresaSelecionada',[{value:'',label:'—'},...cliOpts], empresaAtual)}</div>
    <div class="field"><label>Solicitante (Contato)</label>${UI.select('clienteId',[{value:'',label:'—'},...solicOpts], d.clienteId||'')}</div>
    <div class="field"><label>Responsável</label>${UI.select('responsavelId',[{value:'',label:'—'},...respOpts], d.responsavelId||'')}</div>
    <div class="field"><label>Status</label>${UI.select('status',stOpts,d.status||'backlog')}</div>
    <div class="field"><label>Prioridade</label>${UI.select('prioridade',prOpts,d.prioridade||'normal')}</div>
    <div class="field"><label>Prazo</label><input type="date" name="prazo" value="${d.prazo?isoDay(d.prazo):''}"/></div>
    <div class="field"><label>Tempo gasto (h)</label><input type="number" min="0" step="0.5" name="tempoGasto" value="${d.tempoGasto||0}"/></div>
    <div class="field full">
      <label>Tags</label>
      <div class="tag-picker" id="tagPicker">
        ${TAGS.map(t => `<span class="tag-chip${(d.tags||[]).includes(t)?' active':''}" data-tag="${escapeHTML(t)}">${escapeHTML(t)}</span>`).join('')}
      </div>
      <input type="hidden" name="tags" value="${escapeHTML((d.tags||[]).join(', '))}"/>
    </div>
    <div class="field full"><label>Descrição</label><textarea name="descricao">${escapeHTML(d.descricao||'')}</textarea></div>
  </form>`;
};

UI.readForm = (form) => {
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((v,k)=> obj[k] = v);
  return obj;
};