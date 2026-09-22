/* ============ FlowDesk — Utilities ============ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

// Converte string "YYYY-MM-DD" em Date local (evita o bug de -1 dia causado por interpretação UTC)
const parseLocalDate = (d) => {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, mo, day] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, mo - 1, day);
  }
  return new Date(d);
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = parseLocalDate(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('pt-BR');
};
const isoDay = (d) => {
  const dt = parseLocalDate(d);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${mo}-${day}`;
};
const daysBetween = (a, b) => Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
const fmtBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes), i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (d, n) => { const x = parseLocalDate(d); x.setDate(x.getDate()+n); return x; };


const STATUS = {
  // Paleta semântica global de status. O mesmo status usa a mesma cor em
  // tabela, drawer, formulário, dashboard, Kanban e relatórios.
  backlog:      { label:'Backlog',             className:'backlog',   color:'#64748b' },
  analise:      { label:'Em análise',          className:'analise',   color:'#2563eb' },
  dev:          { label:'Em desenvolvimento',  className:'dev',       color:'#7c3aed' },
  revisao:      { label:'Em revisão',          className:'revisao',   color:'#a855f7' },
  cliente:      { label:'Aguardando cliente',  className:'cliente',   color:'#d97706' },
  concluido:    { label:'Concluído',           className:'concluido', color:'#16a34a' },
  cancelado:    { label:'Cancelado',           className:'cancelado', color:'#64748b' },
  atrasado:     { label:'Atrasado',            className:'atrasado',  color:'#dc2626' },
};
const STATUS_ORDER = ['backlog','analise','dev','revisao','cliente','concluido','cancelado','atrasado'];

const PRIORIDADE = {
  baixa:    { label:'Baixa',    color:'#22c55e' },
  normal:   { label:'Normal',   color:'#3b82f6' },
  alta:     { label:'Alta',     color:'#f59e0b' },
  urgente:  { label:'Urgente',  color:'#ef4444' },
};

const EQUIPE_AREA = {
  gp:              { label:'GP',              color:'#6366f1' },
  cs:              { label:'CS',              color:'#0ea5e9' },
  desenvolvimento: { label:'Dev', color:'#a855f7' },
  consultores:     { label:'Consultores',     color:'#f59e0b' },
  cliente:         { label:'Cliente',         color:'#10b981' },
};

// Nome de exibição do Executante: usa o cadastro em equipe quando responsavelId
// aponta pra alguém interno; senão cai no texto livre (terceiros / contato do cliente).
function nomeResponsavel(d) {
  const p = d && d.responsavelId ? Store.pessoa(d.responsavelId) : null;
  if (p) return p.nome;
  return (d && d.responsavelNome) ? d.responsavelNome : '';
}

// Nome de exibição do Projeto de uma demanda: cobre tanto projetos reais
// quanto as opções especiais "Nova oportunidade" / "Fora do escopo".
function nomeProjeto(d) {
  if (!d || !d.projetoId) return '';
  const especial = PROJETO_ESPECIAIS.find(o => o.value === d.projetoId);
  if (especial) return especial.label;
  const p = Store.projeto(d.projetoId);
  return p ? p.nome : '';
}

const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

function debounce(fn, ms=200) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

function download(filename, content, mime='text/plain') {
  // O BOM faz o Excel no Windows reconhecer o arquivo como UTF-8 e manter acentos.
  const isCSV = mime.toLowerCase().startsWith('text/csv');
  const csvContent = isCSV && !content.startsWith('\uFEFF') ? `\uFEFF${content}` : content;
  const contentType = isCSV ? 'text/csv;charset=utf-8' : mime;
  const blob = new Blob([csvContent], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  return [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\n');
}

function parseCSV(text) {
  // Parser char-a-char (não faz split por linha antes de tratar aspas), então
  // campos com quebra de linha, ';', ',' ou '"' escapados dentro de aspas funcionam corretamente.
  if (!text) return [];
  // CSVs exportados para Excel podem conter BOM no primeiro cabeçalho.
  text = text.replace(/^\uFEFF/, '');
  const sep = text.slice(0, text.indexOf('\n') > -1 ? text.indexOf('\n') : text.length).includes(';') ? ';' : ',';
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i+1] === '"') { cur += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      cur += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === sep) { row.push(cur); cur = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += c; i++;
  }
  // última célula/linha, caso o arquivo não termine com quebra de linha
  if (cur.length || row.length) { row.push(cur); rows.push(row); }

  const nonEmptyRows = rows.filter(r => !(r.length === 1 && r[0] === ''));
  if (!nonEmptyRows.length) return [];
  const headers = nonEmptyRows[0].map(h => h.trim());
  return nonEmptyRows.slice(1).map(cells => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (cells[idx] || '').trim());
    return obj;
  });
}

function exportPDF(title, htmlBody, hideHeading=false) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHTML(title)}</title>
  <style>
    body{font-family: Inter, Arial, sans-serif; padding: 30px; color:#111;}
    h1{font-size:20px; margin-bottom:16px;}
    table{width:100%; border-collapse:collapse; font-size:12px;}
    th,td{border:1px solid #ddd; padding:6px 8px; text-align:left;}
    th{background:#f5f5f5;}
    @media print { .no-print{ display:none } }
  </style></head><body>
    ${hideHeading ? '' : `<h1>${escapeHTML(title)}</h1>`}
    ${htmlBody}
    <p class="no-print" style="margin-top:20px"><button onclick="window.print()">Imprimir / Salvar PDF</button></p>
  </body></html>`);
  w.document.close();
  setTimeout(()=> w.print(), 400);
}

const storage = {
  get(key, fallback=null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} }
};

// Aplica máscara de telefone BR conforme o usuário digita: (99) 99999-9999 ou (99) 9999-9999
function maskPhone(value) {
  let v = String(value ?? '').replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
  } else if (v.length > 5) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  } else if (v.length > 0) {
    v = v.replace(/^(\d{0,2})/, '($1');
  }
  return v;
}

function attachPhoneMask(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const before = input.value.length;
    input.value = maskPhone(input.value);
    const after = input.value.length;
    const diff = after - before;
    input.selectionStart = input.selectionEnd = Math.max(0, pos + diff);
  });
}

function initials(name='') {
  return name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

// Quebra um label longo em várias linhas (array), respeitando palavras inteiras.
// Usado nos eixos de gráficos Chart.js horizontais para evitar texto cortado.
function wrapLabel(text, maxLen = 20, maxLines = 2) {
  const words = String(text ?? '').split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > maxLen && cur) { lines.push(cur); cur = w; }
    else cur = test;
  });
  if (cur) lines.push(cur);
  if (!lines.length) return [String(text ?? '')];
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    if (last.length > maxLen - 1) last = last.slice(0, maxLen - 1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

function isLate(demand) {
  if (!demand.prazo) return false;
  if (demand.status === 'concluido' || demand.status === 'cancelado' || demand.status === 'cliente') return false;
  return new Date(demand.prazo) < today();
}

// Monta a URL do Google Calendar já preenchida (título, horário, convidados, descrição).
// O Google Calendar oferece a opção "Adicionar Google Meet" automaticamente ao salvar
// um evento com convidados — não é possível pré-selecionar isso via URL sem OAuth.
function buildGoogleCalendarLink({ titulo, dataISO, horaInicio, horaFim, convidados=[], detalhes='' }) {
  const fmt = (dia, hora) => {
    const [y,mo,d] = dia.split('-');
    const [h,mi] = (hora||'00:00').split(':');
    return `${y}${mo}${d}T${h.padStart(2,'0')}${mi.padStart(2,'0')}00`;
  };
  const dates = `${fmt(dataISO, horaInicio)}/${fmt(dataISO, horaFim)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo || 'Reunião',
    dates,
    details: detalhes,
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) params.set('ctz', tz);
  if (convidados.length) params.set('add', convidados.join(','));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
