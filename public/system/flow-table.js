/* ==========================================================
 * FlowTable — padrão universal de tabelas do FlowDesk
 * ==========================================================
 * API vanilla JS para padronizar as capacidades das tabelas sem
 * obrigar cada tela a reimplementar ordenação, seleção, paginação,
 * exportação, loading e estados vazios.
 *
 * Principais métodos:
 *   FlowTable.enhance(table, options)
 *   FlowTable.create({ mount, columns, rows, renderRow, ... })
 *   instance.refresh()
 *   instance.setLoading(...)
 *   instance.setEmpty(...)
 *   instance.setPage(...)
 *   instance.getSelected()
 *   FlowTable.exportCSV(table, options)
 *
 * A gestão avançada de colunas (resize, auto-fit, hide e pin) continua
 * centralizada no TableResizer existente e é acionada de forma preguiçosa.
 * ========================================================== */

(function () {
  const instances = new WeakMap();
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  const cssEscapeValue = (value) => {
    try { return CSS.escape(String(value)); } catch { return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  };

  const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const csvEscape = (value) => {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const getRows = (table) => Array.from(table.querySelectorAll('tbody > tr'))
    .filter(row => !row.classList.contains('is-empty-row') && !row.dataset.flowtableLoading);

  const getDataRows = (table) => getRows(table).filter(row => row.children.length === table.querySelectorAll('thead th').length);

  const visibleColumnIndexes = (table) => Array.from(table.querySelectorAll('thead th'))
    .map((th, index) => ({ th, index }))
    .filter(({ th }) => !th.classList.contains('table-column-hidden'))
    .map(({ index }) => index);

  const ensurePager = (table) => {
    const wrapper = table.closest('.table-wrap') || table.parentElement;
    if (!wrapper) return null;
    let pager = wrapper.querySelector(':scope > .flowtable-pagination');
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'flowtable-pagination';
      pager.innerHTML = `
        <div class="flowtable-pagination-info"></div>
        <div class="flowtable-pagination-actions">
          <button type="button" class="flowtable-page-btn" data-page="prev" aria-label="Página anterior"><i class="fa-solid fa-chevron-left"></i></button>
          <span class="flowtable-page-current"></span>
          <button type="button" class="flowtable-page-btn" data-page="next" aria-label="Próxima página"><i class="fa-solid fa-chevron-right"></i></button>
        </div>`;
      wrapper.appendChild(pager);
    }
    return pager;
  };

  const ensureLoadingRows = (table, count = 6) => {
    const tbody = table.tBodies[0] || table.createTBody();
    const cols = table.tHead?.rows[0]?.cells?.length || 1;
    const skeleton = typeof UI !== 'undefined' && UI.skeletonRows
      ? UI.skeletonRows(count, cols)
      : Array.from({ length: count }, () => `<tr data-flowtable-loading="true">${'<td><div class="skeleton" style="height:14px;width:70%"></div></td>'.repeat(cols)}</tr>`).join('');
    tbody.innerHTML = skeleton;
    tbody.querySelectorAll('tr').forEach(row => row.dataset.flowtableLoading = 'true');
    table.classList.add('is-loading');
    return table;
  };

  const ensureEmptyRow = (table, options = {}) => {
    const tbody = table.tBodies[0] || table.createTBody();
    const cols = table.tHead?.rows[0]?.cells?.length || 1;
    const icon = options.icon || 'inbox';
    const title = options.title || 'Nenhum registro encontrado';
    const description = options.description || 'Não há dados para exibir.';
    const action = options.action || null;
    let content = '';
    if (typeof UI !== 'undefined' && UI.emptyState) {
      content = UI.emptyState(icon, title, { description, action });
    } else {
      content = `<div class="empty"><i class="fa-solid fa-${icon}"></i><div><strong>${typeof escapeHTML === 'function' ? escapeHTML(title) : title}</strong><div>${typeof escapeHTML === 'function' ? escapeHTML(description) : description}</div></div></div>`;
    }
    tbody.innerHTML = `<tr class="is-empty-row"><td colspan="${cols}">${content}</td></tr>`;
    table.classList.remove('is-loading');
    return table;
  };

  const buildHeaderCheckbox = (table) => {
    const th = table.querySelector('thead th[data-flowtable-select-all]');
    if (!th) return null;
    let input = th.querySelector('input.flowtable-select-all');
    if (!input) {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'flowtable-select-all';
      input.setAttribute('aria-label', 'Selecionar todos');
      th.appendChild(input);
    }
    return input;
  };

  const enhance = (table, options = {}) => {
    if (!(table instanceof HTMLTableElement)) return null;

    let state = instances.get(table);
    if (state) {
      state.options = { ...state.options, ...options };
      state.refresh();
      return state.api;
    }

    state = {
      table,
      options: { selection: false, pagination: false, ...options },
      page: 1,
      selected: new Set(),
      searchTerm: '',
      filterFn: null,
      api: null,
      bound: false
    };

    table.classList.add('flow-table');
    if (state.options.key) table.dataset.flowTableKey = state.options.key;

    const syncSelection = () => {
      const selection = state.options.selection;
      if (!selection) return;
      getRows(table).forEach(row => {
        const id = selection.getId ? selection.getId(row) : row.dataset.selectionId || row.dataset.id;
        if (!id) return;
        const selected = selection.isSelected ? !!selection.isSelected(id) : state.selected.has(String(id));
        row.classList.toggle('is-selected', selected);
        const checkbox = row.querySelector('.table-row-checkbox');
        if (checkbox) checkbox.checked = selected;
      });

      if (selection.headerCheckbox) {
        const allCheckbox = buildHeaderCheckbox(table);
        const rows = getRows(table);
        const selectable = rows.filter(row => {
          const id = selection.getId ? selection.getId(row) : row.dataset.selectionId || row.dataset.id;
          return !!id;
        });
        const selectedCount = selectable.filter(row => {
          const id = selection.getId ? selection.getId(row) : row.dataset.selectionId || row.dataset.id;
          return selection.isSelected ? !!selection.isSelected(id) : state.selected.has(String(id));
        }).length;
        if (allCheckbox) {
          allCheckbox.checked = selectable.length > 0 && selectedCount === selectable.length;
          allCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
        }
      }
    };

    const setPage = (page) => {
      const pagination = state.options.pagination;
      const pageSize = Number(pagination?.pageSize || 0);
      if (!pageSize) return;
      const rows = getRows(table);
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      state.page = Math.min(Math.max(1, Number(page) || 1), totalPages);
      rows.forEach((row, index) => {
        const first = (state.page - 1) * pageSize;
        row.hidden = index < first || index >= first + pageSize;
      });
      const pager = ensurePager(table);
      if (pager) {
        const first = rows.length ? (state.page - 1) * pageSize + 1 : 0;
        const last = Math.min(state.page * pageSize, rows.length);
        const info = pager.querySelector('.flowtable-pagination-info');
        const current = pager.querySelector('.flowtable-page-current');
        const prev = pager.querySelector('[data-page="prev"]');
        const next = pager.querySelector('[data-page="next"]');
        if (info) info.textContent = rows.length ? `${first}–${last} de ${rows.length}` : '0 registros';
        if (current) current.textContent = `${state.page} / ${totalPages}`;
        if (prev) prev.disabled = state.page <= 1;
        if (next) next.disabled = state.page >= totalPages;
        pager.hidden = rows.length <= pageSize;
      }
    };

    const bindPagination = () => {
      const pager = ensurePager(table);
      if (!pager || pager.dataset.flowtableBound === 'true') return;
      pager.dataset.flowtableBound = 'true';
      pager.addEventListener('click', event => {
        const btn = event.target.closest('[data-page]');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        setPage(state.page + (btn.dataset.page === 'next' ? 1 : -1));
      });
    };

    const bindSelection = () => {
      const selection = state.options.selection;
      if (!selection || state.bound) return;
      state.bound = true;

      table.addEventListener('change', event => {
        const checkbox = event.target.closest('.table-row-checkbox');
        if (checkbox) {
          const row = checkbox.closest('tr');
          if (!row) return;
          const id = selection.getId ? selection.getId(row) : row.dataset.selectionId || row.dataset.id;
          if (id == null || id === '') return;
          const stringId = String(id);
          if (checkbox.checked) state.selected.add(stringId);
          else state.selected.delete(stringId);
          row.classList.toggle('is-selected', checkbox.checked);
          if (typeof selection.onToggle === 'function') selection.onToggle(stringId, checkbox.checked, api);
          syncSelection();
          return;
        }

        if (event.target.matches('.flowtable-select-all')) {
          const checked = event.target.checked;
          getRows(table).forEach(row => {
            const id = selection.getId ? selection.getId(row) : row.dataset.selectionId || row.dataset.id;
            if (!id) return;
            const stringId = String(id);
            if (checked) state.selected.add(stringId);
            else state.selected.delete(stringId);
          });
          if (typeof selection.onSelectAll === 'function') selection.onSelectAll(checked, Array.from(state.selected), api);
          syncSelection();
        }
      });
    };

    const applyFilter = () => {
      if (!state.options.pagination) return;
      state.page = 1;
      setPage(1);
    };

    const exportCSV = (exportOptions = {}) => {
      const headers = visibleColumnIndexes(table).map(index => cleanText(table.querySelectorAll('thead th')[index]?.textContent));
      const rows = getRows(table).filter(row => !row.hidden);
      const indexes = visibleColumnIndexes(table);
      const lines = [headers.map(csvEscape).join(';')];
      rows.forEach(row => {
        const values = indexes.map(index => cleanText(row.children[index]?.textContent || ''));
        lines.push(values.map(csvEscape).join(';'));
      });
      const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportOptions.filename || `${state.options.key || 'flowtable'}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      return lines.join('\n');
    };

    const refresh = () => {
      table.classList.remove('is-loading');
      if (state.options.pagination?.pageSize) {
        bindPagination();
        setPage(state.page);
      }
      if (state.options.selection) {
        bindSelection();
        syncSelection();
      }
      // O gerenciador de colunas atual continua sendo a fonte única para
      // resize, auto-fit, ocultação e fixação de colunas.
      if (typeof TableResizer !== 'undefined' && TableResizer.refresh) TableResizer.refresh(table.parentElement || table);
      return api;
    };

    const api = {
      table,
      refresh,
      setPage,
      getPage: () => state.page,
      setLoading: count => { ensureLoadingRows(table, count); return api; },
      setEmpty: opts => { ensureEmptyRow(table, opts); return api; },
      getSelected: () => Array.from(state.selected),
      setSelected: ids => { state.selected = new Set((ids || []).map(String)); syncSelection(); return api; },
      clearSelection: () => { state.selected.clear(); syncSelection(); return api; },
      exportCSV,
      getRows: () => getRows(table),
      applyFilter: predicate => {
        state.filterFn = typeof predicate === 'function' ? predicate : null;
        getRows(table).forEach(row => { row.hidden = state.filterFn ? !state.filterFn(row) : false; });
        applyFilter();
        return api;
      },
      sortDom: (columnIndex, direction = 1) => {
        const tbody = table.tBodies[0];
        if (!tbody) return api;
        const rows = getDataRows(table);
        rows.sort((a, b) => collator.compare(cleanText(a.children[columnIndex]?.textContent), cleanText(b.children[columnIndex]?.textContent)) * direction);
        rows.forEach(row => tbody.appendChild(row));
        state.page = 1;
        refresh();
        return api;
      }
    };

    state.api = api;
    instances.set(table, state);
    // O setup do TableResizer acontece no MutationObserver existente; caso a
    // tabela já esteja no DOM, garantimos o upgrade imediatamente quando possível.
    if (typeof TableResizer !== 'undefined' && TableResizer.setup) TableResizer.setup(table);
    bindSelection();
    refresh();
    return api;
  };

  const create = (config = {}) => {
    const mount = config.mount instanceof Element ? config.mount : document.querySelector(config.mount);
    if (!mount) return null;
    const columns = Array.isArray(config.columns) ? config.columns : [];
    const tableClass = config.className || '';
    const key = config.key || `flowtable-${Date.now()}`;
    const head = columns.map(column => {
      const attrs = [];
      if (column.sort) attrs.push(`data-sort="${typeof escapeHTML === 'function' ? escapeHTML(column.sort) : column.sort}"`);
      if (column.noMenu) attrs.push('data-no-menu="true"');
      if (column.noResize) attrs.push('data-no-resize="true"');
      return `<th ${attrs.join(' ')}>${typeof escapeHTML === 'function' ? escapeHTML(column.label || '') : (column.label || '')}</th>`;
    }).join('');
    mount.innerHTML = `<div class="table-wrap"><table class="${tableClass}" data-flow-table="${cssEscapeValue(key)}"><thead><tr>${head}</tr></thead><tbody></tbody></table></div>`;
    const table = mount.querySelector('table');
    const api = enhance(table, { ...config, key });
    if (typeof config.renderRow === 'function') {
      const tbody = table.tBodies[0];
      tbody.innerHTML = (config.rows || []).map((row, index) => config.renderRow(row, index)).join('');
      api.refresh();
    }
    return api;
  };

  const refreshAll = (root = document) => {
    root.querySelectorAll?.('table').forEach(table => enhance(table));
  };

  const init = () => {
    refreshAll(document);
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('table')) enhance(node);
        node.querySelectorAll?.('table').forEach(table => enhance(table));
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const api = { create, enhance, init, refreshAll, exportCSV };
  window.FlowTable = api;
})();
