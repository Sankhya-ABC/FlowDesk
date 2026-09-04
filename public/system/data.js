/* ============ FlowDesk — Sample Data & Store ============ */
const DB_KEY = 'flowdesk_db_v1';

const NOMES = ['Ana Lima','Bruno Costa','Carla Souza','Diego Almeida','Elisa Ramos','Felipe Nogueira','Gabriela Duarte','Henrique Sá','Isabela Vieira','João Pedro','Karina Melo','Lucas Braga','Marina Freitas','Nicolas Prado','Olívia Santos','Pedro Henrique','Rafael Torres','Sabrina Alves','Thiago Barros','Vanessa Rocha'];
const EMPRESAS = ['Acme Corp','Globex','Initech','Umbrella','Stark Industries','Wayne Enterprises','Cyberdyne','Wonka','Hooli','Pied Piper','Soylent','Massive Dynamic','Aperture','Tyrell','Oscorp','Duff Co','Vandelay','Los Pollos','Vehement','Prestige Worldwide'];
const CIDADES = ['São Paulo','Rio de Janeiro','Belo Horizonte','Curitiba','Porto Alegre','Salvador','Fortaleza','Recife','Brasília','Florianópolis'];
const TAGS = [];

// Opções especiais do select de Projeto, além dos projetos cadastrados —
// usadas quando a demanda não pertence a nenhum projeto existente.
const PROJETO_ESPECIAIS = [
  { value: '__nova_oportunidade', label: 'Nova oportunidade' },
  { value: '__fora_escopo',       label: 'Fora do escopo' },
];
const TITULOS_PROJ = ['Rebranding','Novo Portal','App Mobile','Dashboard Interno','Landing Page','Integração ERP','Website Institucional','Sistema de CRM','E-commerce','Automação de Marketing','Plataforma de Ensino','Área do Cliente','Blog Corporativo','Loja Virtual','Painel Analytics'];
const TITULOS_DEM = ['Ajustar layout do header','Criar wireframe','Implementar login','Corrigir bug de exportação','Revisar textos','Publicar release','Testar formulário','Otimizar performance','Documentar API','Migrar banco','Criar landing','Reunião de alinhamento','Definir escopo','Aprovar arte','Preparar apresentação','Configurar CI/CD','Escrever testes','Criar mockups','Revisar SEO','Atualizar bibliotecas'];

const rand = (a) => a[Math.floor(Math.random()*a.length)];
const randInt = (min, max) => Math.floor(Math.random()*(max-min+1))+min;
const randDate = (offMin=-60, offMax=90) => addDays(today(), randInt(offMin, offMax));

const EQUIPE_FIXA = [
  { nome: 'Lucas S',        cargo: 'Dev' },
  { nome: 'João H',         cargo: 'Dev' },
  { nome: 'Sidney',         cargo: 'Dev' },
  { nome: 'Gusttavo Froes', cargo: 'Gerente de Desenvolvimento' },
  { nome: 'João C',         cargo: 'Consultor' },
  { nome: 'Denis',          cargo: 'Consultor' },
  { nome: 'Sidneia',        cargo: 'Consultora' },
  { nome: 'Aline',          cargo: 'Consultora' },
  { nome: 'Carlucio',       cargo: 'Squad Lead' },
];

function seed() {
  const equipe = EQUIPE_FIXA.map((p) => ({
    id: uid('u'), nome: p.nome, cargo: p.cargo,
    email: `${p.nome.toLowerCase().replace(/[^a-z]/g,'.')}@empresa.com`
  }));
  /* Geração aleatória de clientes/projetos/demandas removida.
     Adicione seus dados reais pela própria aplicação. */
  const clientes = [];
  const projetos = [];
  const demandas = [];
  const reunioes = [];
  const transicoes = [];
  return { clientes, projetos, demandas, equipe, reunioes, transicoes, notificacoes: gerarNotificacoes(demandas) };
}

function gerarNotificacoes(demandas, anteriores=[]) {
  // Preserva id/estado "lida" das notificações já existentes (chave: demandaId),
  // pra não "ressuscitar" como não lida algo que o usuário já marcou como lido.
  const anterioresPorDemanda = {};
  (anteriores||[]).forEach(n => { if (n.demandaId) anterioresPorDemanda[n.demandaId] = n; });

  const late = demandas.filter(isLate).slice(0,5);
  return late.map(d => {
    const prev = anterioresPorDemanda[d.id];
    return {
      id: prev ? prev.id : uid('n'), tipo:'atraso', demandaId: d.id,
      titulo: `Demanda atrasada: ${d.titulo}`,
      sub: `Prazo: ${fmtDate(d.prazo)}`,
      lida: prev ? prev.lida : false,
      data: prev ? prev.data : new Date().toISOString()
    };
  });
}

/* ------------- Store -------------
 * Fonte de verdade é o Postgres, via /api/bootstrap + /api/:col. O localStorage
 * vira só um cache: se a API não responder (servidor fora do ar), o app entra
 * em modo offline com o último snapshot salvo, em vez de travar. */
const Store = {
  state: null,
  offline: false,

  async load() {
    let remote = null;
    try {
      const res = await fetch('/api/bootstrap', { signal: AbortSignal.timeout(8000) });
      if (res.ok) remote = await res.json();
    } catch { /* sem rede / API fora do ar */ }

    if (remote) {
      this.offline = false;
      this.state = {
        clientes: remote.clientes || [],
        projetos: remote.projetos || [],
        demandas: remote.demandas || [],
        equipe: remote.equipe || [],
        reunioes: remote.reunioes || [],
        transicoes: remote.transicoes || [],
      };

      // Banco vazio (primeira execução): populamos a equipe fixa padrão e já
      // persistimos no servidor, pra não sumir com o time em todo load vazio.
      const isEmpty = !this.state.clientes.length && !this.state.projetos.length &&
        !this.state.demandas.length && !this.state.equipe.length;
      if (isEmpty) {
        this.state.equipe = seed().equipe;
        this.state.equipe.forEach(p => this.upsert('equipe', p));
      }
    } else {
      this.offline = true;
      const cached = storage.get(DB_KEY);
      this.state = cached && cached.clientes ? cached : seed();
      if (typeof UI !== 'undefined') UI.toast('Sem conexão com o servidor — trabalhando offline', 'warn');
    }

    this._derive();
  },

  // Recalcula campos derivados (status "atrasado", notificações) e persiste no cache local.
  _derive() {
    if (!this.state.reunioes) this.state.reunioes = [];
    if (!this.state.transicoes) this.state.transicoes = [];
    this.state.demandas.forEach(d => {
      if (isLate(d) && d.status !== 'concluido' && d.status !== 'cancelado') d._late = true;
      else d._late = false;
    });
    this.state.notificacoes = gerarNotificacoes(this.state.demandas, this.state.notificacoes);
    this.save();
  },

  save() { storage.set(DB_KEY, this.state); },
  reset() { storage.del(DB_KEY); this.state = seed(); this._derive(); },

  clientes: () => Store.state.clientes,
  projetos: () => Store.state.projetos,
  demandas: () => Store.state.demandas,
  equipe:   () => Store.state.equipe,
  reunioes: () => Store.state.reunioes,
  transicoes: () => Store.state.transicoes,
  notificacoes: () => Store.state.notificacoes,

  // Número sequencial e legível da demanda (#1, #2, ...), baseado na ordem de criação.
  // Não é persistido: é recalculado a partir de `criacao`, então some/reordena sozinho
  // se registros forem importados com datas de criação diferentes.
  _demandaSeqMap: null,
  _demandaSeqStamp: null,
  demandaSeqMap() {
    const list = Store.state.demandas;
    if (Store._demandaSeqMap && Store._demandaSeqStamp === list) return Store._demandaSeqMap;
    const ordenadas = list.slice().sort((a,b) => new Date(a.criacao||0) - new Date(b.criacao||0));
    const map = {};
    ordenadas.forEach((d,i) => { map[d.id] = i+1; });
    Store._demandaSeqMap = map;
    Store._demandaSeqStamp = list;
    return map;
  },
  demandaSeq(id) { return Store.demandaSeqMap()[id] || null; },
  demandaByCod(cod) {
    const n = parseInt(String(cod).replace(/\D/g,''), 10);
    if (!n) return null;
    const map = Store.demandaSeqMap();
    const id = Object.keys(map).find(k => map[k] === n);
    return id ? Store.demanda(id) : null;
  },

  cliente:  (id) => Store.state.clientes.find(x=>x.id===id),
  projeto:  (id) => Store.state.projetos.find(x=>x.id===id),
  demanda:  (id) => Store.state.demandas.find(x=>x.id===id),
  pessoa:   (id) => Store.state.equipe.find(x=>x.id===id),
  reuniao:  (id) => Store.state.reunioes.find(x=>x.id===id),
  transicao:(id) => Store.state.transicoes.find(x=>x.id===id),

  upsert(col, row) {
    const arr = Store.state[col];
    const i = arr.findIndex(x=>x.id===row.id);
    const saved = { ...(i>=0 ? arr[i] : {}), ...row, id: row.id || uid(col[0]) };
    if (i>=0) arr[i] = saved; else arr.push(saved);
    Store.save();

    fetch(`/api/${col}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(saved),
    })
      .then(res => { if (!res.ok) throw new Error(`save ${col} failed: ${res.status}`); })
      .catch(err => {
        console.error(err);
        if (typeof UI !== 'undefined') UI.toast('Falha ao salvar no servidor — alteração ficou só local', 'warn');
      });
  },
  // Diferente de upsert(), este é "await-ável" e só atualiza o estado local
  // se o servidor de fato aceitar — importante para assinatura de transição,
  // onde o backend pode recusar (usuário logado não é o aprovador da key) e
  // a UI não pode fingir que salvou.
  async upsertAwait(col, row) {
    const res = await fetch(`/api/${col}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `save ${col} failed: ${res.status}`);
    }
    const saved = await res.json();
    const arr = Store.state[col];
    const i = arr.findIndex(x => x.id === saved.id);
    if (i >= 0) arr[i] = saved; else arr.push(saved);
    Store.save();
    return saved;
  },
  remove(col, id) {
    Store.state[col] = Store.state[col].filter(x=>x.id!==id);
    Store.save();

    fetch(`/api/${col}/${id}`, { method: 'DELETE' })
      .then(res => { if (!res.ok) throw new Error(`delete ${col} failed: ${res.status}`); })
      .catch(err => {
        console.error(err);
        if (typeof UI !== 'undefined') UI.toast('Falha ao excluir no servidor', 'warn');
      });
  },
};

/* ============ Ordens de Serviço — Store local (frontend v1) ============ */
// Nesta primeira etapa as OS ficam somente no navegador. Não há chamada ao Sankhya
// aqui: a estrutura já fica preparada para, futuramente, trocar o método de persistência
// por uma API backend que faça a autenticação e o envio oficial via API Gateway.
const OS_DB_KEY = 'flowdesk_ordens_servico_v1';

const OSStore = {
  state: [],
  loaded: false,

  load() {
    const cached = storage.get(OS_DB_KEY, []);
    this.state = Array.isArray(cached) ? cached : [];
    this.loaded = true;
    return this.state;
  },
  save() { storage.set(OS_DB_KEY, this.state); },
  all() { if (!this.loaded) this.load(); return this.state; },
  get(id) { return this.all().find(x => x.id === id) || null; },
  upsert(row) {
    const arr = this.all();
    const saved = { ...(row || {}), id: row?.id || uid('os') };
    const i = arr.findIndex(x => x.id === saved.id);
    if (i >= 0) arr[i] = saved; else arr.push(saved);
    this.save();
    return saved;
  },
  remove(id) {
    this.state = this.all().filter(x => x.id !== id);
    this.save();
  },
  nextNumber() {
    const max = this.all().reduce((m, os) => Math.max(m, Number(os.numero)||0), 0);
    return max + 1;
  }
};

/* ============ Documentos (anexos de demanda) ============ */
// Não vivem em Store.state (não fazem parte do bootstrap) porque são
// binários — sempre buscados sob demanda direto do servidor.
const Documentos = {
  async listar(demandaId) {
    const res = await fetch(`/api/documentos?demandaId=${encodeURIComponent(demandaId)}`);
    if (!res.ok) throw new Error(`listar documentos falhou: ${res.status}`);
    return res.json();
  },
  async upload(demandaId, file) {
    const form = new FormData();
    form.append('demandaId', demandaId);
    form.append('file', file);
    const res = await fetch('/api/documentos', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `upload falhou: ${res.status}`);
    }
    return res.json();
  },
  async remover(id) {
    const res = await fetch(`/api/documentos/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`excluir documento falhou: ${res.status}`);
    return res.json();
  },
  urlDownload(id) {
    return `/api/documentos/${id}/download`;
  },
  urlZipProjeto(projetoId) {
    return `/api/projetos/${projetoId}/documentos.zip`;
  },
};