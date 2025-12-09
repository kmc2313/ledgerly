const state = {
  editingId: null,
  justAddedId: null,
  filters: {
    type: 'all',
    startDate: '',
    endDate: '',
  },
};

const yen = (value) => `¥${Number(value || 0).toLocaleString('ja-JP')}`;
const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

const jsonFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/login.html';
    return null;
  }
  if (!res.ok) {
    throw new Error(data.error || '処理に失敗しました');
  }
  return data;
};

const toastContainer = (() => {
  const el = document.createElement('div');
  el.className = 'toast-container';
  document.body.appendChild(el);
  return el;
})();

const showToast = (text, type = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 180);
  }, 2400);
};

const elements = {
  userEmail: document.querySelector('#userEmail'),
  logoutBtn: document.querySelector('#logoutBtn'),
  summaryIncome: document.querySelector('#summaryIncome'),
  summaryExpense: document.querySelector('#summaryExpense'),
  summaryBalance: document.querySelector('#summaryBalance'),
  activeFilterLabel: document.querySelector('#activeFilterLabel'),
  filterType: document.querySelector('#filterType'),
  startDate: document.querySelector('#startDate'),
  endDate: document.querySelector('#endDate'),
  applyFilter: document.querySelector('#applyFilter'),
  clearFilter: document.querySelector('#clearFilter'),
  form: document.querySelector('#entryForm'),
  formTitle: document.querySelector('#formTitle'),
  formStatus: document.querySelector('#formStatus'),
  titleInput: document.querySelector('#titleInput'),
  amountInput: document.querySelector('#amountInput'),
  typeInput: document.querySelector('#typeInput'),
  dateInput: document.querySelector('#dateInput'),
  memoInput: document.querySelector('#memoInput'),
  submitBtn: document.querySelector('#submitBtn'),
  cancelEdit: document.querySelector('#cancelEdit'),
  formMessage: document.querySelector('#formMessage'),
  listMeta: document.querySelector('#listMeta'),
  entriesList: document.querySelector('#entriesList'),
};

const setToday = () => {
  const today = new Date().toISOString().slice(0, 10);
  elements.dateInput.value = today;
};

const loadUser = async () => {
  const res = await jsonFetch('/api/me');
  if (res?.user) {
    elements.userEmail.textContent = res.user.email;
  }
};

const resetForm = () => {
  state.editingId = null;
  elements.formTitle.textContent = '新規追加';
  elements.submitBtn.textContent = '保存';
  elements.formStatus.textContent = 'amountと区分は必須';
  elements.formMessage.textContent = '';
  elements.titleInput.value = '';
  elements.amountInput.value = '';
  elements.typeInput.value = '';
  elements.memoInput.value = '';
  setToday();
};

const buildFilterLabel = () => {
  const { type, startDate, endDate } = state.filters;
  const parts = [];
  if (type === 'income') parts.push('収入のみ');
  else if (type === 'expense') parts.push('支出のみ');
  else parts.push('すべて');
  if (startDate || endDate) {
    parts.push(`期間: ${startDate || '指定なし'} 〜 ${endDate || '指定なし'}`);
  }
  return parts.join(' / ');
};

const renderSummary = (summary) => {
  elements.summaryIncome.textContent = yen(summary?.incomeTotal || 0);
  elements.summaryExpense.textContent = yen(summary?.expenseTotal || 0);
  elements.summaryBalance.textContent = yen(summary?.balance || 0);
};

const renderEmptyState = () => {
  elements.entriesList.innerHTML = `
    <div class="notice">表示できる項目がありません。フィルターを変えるか、項目を追加してください。</div>
  `;
  elements.listMeta.textContent = '0件';
};

const renderEntries = (items = []) => {
  if (!items.length) {
    renderEmptyState();
    return;
  }
  elements.entriesList.innerHTML = '';
  items.forEach((item, index) => {
    const article = document.createElement('article');
    article.className = 'entry';
    article.dataset.id = item.id;
    article.style.setProperty('--delay', index);
    if (state.justAddedId === item.id) {
      article.classList.add('is-new');
    }
    article.innerHTML = `
      <div class="entry-top">
        <div class="entry-title">${item.title || '無題'}</div>
        <div class="entry-meta">
          <span class="pill ${item.type}">${item.type === 'income' ? '収入' : '支出'}</span>
          <span>${fmtDate(item.occurredon || item.occurredOn)}</span>
        </div>
      </div>
      <div class="entry-meta">
        <strong>${yen(item.amount)}</strong>
        <span class="muted">|</span>
        <span class="muted">${(item.memo || '').slice(0, 40) || 'メモなし'}</span>
      </div>
      <div class="entry-actions">
        <button class="btn secondary btn-edit">編集</button>
        <button class="btn danger btn-delete">削除</button>
      </div>
    `;

    article.addEventListener('click', () => {
      window.location.href = `/detail.html?id=${item.id}`;
    });

    article.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      startEdit(item);
    });

    article.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('削除しますか？')) return;
      try {
        await jsonFetch(`/api/items/${item.id}`, { method: 'DELETE' });
        loadItems();
      } catch (err) {
        elements.formMessage.textContent = err.message;
        elements.formMessage.className = 'error';
        showToast('削除に失敗しました', 'error');
      }
    });

    elements.entriesList.appendChild(article);
  });
  elements.listMeta.textContent = `${items.length}件`;
  state.justAddedId = null;
};

const loadItems = async () => {
  const params = new URLSearchParams();
  const { type, startDate, endDate } = state.filters;
  if (type) params.set('type', type);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  try {
    const res = await jsonFetch(`/api/items?${params.toString()}`);
    if (!res) return;
    elements.activeFilterLabel.textContent = buildFilterLabel();
    renderSummary(res.summary);
    renderEntries(res.items);
  } catch (err) {
    elements.entriesList.innerHTML = `<div class="error">${err.message}</div>`;
    showToast('一覧の取得に失敗しました', 'error');
  }
};

const startEdit = (item) => {
  state.editingId = item.id;
  elements.formTitle.textContent = '編集モード';
  elements.submitBtn.textContent = '更新する';
  elements.formStatus.textContent = `ID ${item.id} を編集中`;
  elements.titleInput.value = item.title || '';
  elements.amountInput.value = item.amount;
  elements.typeInput.value = item.type;
  elements.dateInput.value = item.occurredon || item.occurredOn;
  elements.memoInput.value = item.memo || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleSubmit = async (e) => {
  e.preventDefault();
  const payload = {
    title: elements.titleInput.value,
    amount: elements.amountInput.value,
    type: elements.typeInput.value,
    occurredOn: elements.dateInput.value,
    memo: elements.memoInput.value,
  };

  const method = state.editingId ? 'PUT' : 'POST';
  const url = state.editingId ? `/api/items/${state.editingId}` : '/api/items';

  try {
    const res = await jsonFetch(url, { method, body: JSON.stringify(payload) });
    if (!state.editingId && res?.item) {
      state.justAddedId = res.item.id;
    }
    elements.formMessage.textContent = '保存しました';
    elements.formMessage.className = 'success';
    showToast(state.editingId ? '更新しました' : '追加しました', 'success');
    resetForm();
    loadItems();
  } catch (err) {
    elements.formMessage.textContent = err.message;
    elements.formMessage.className = 'error';
    showToast('保存に失敗しました', 'error');
  }
};

const wireEvents = () => {
  elements.logoutBtn?.addEventListener('click', async () => {
    await jsonFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  elements.applyFilter.addEventListener('click', () => {
    state.filters.type = elements.filterType.value;
    state.filters.startDate = elements.startDate.value;
    state.filters.endDate = elements.endDate.value;
    showToast('フィルターを適用しました', 'info');
    loadItems();
  });

  elements.clearFilter.addEventListener('click', () => {
    elements.filterType.value = 'all';
    elements.startDate.value = '';
    elements.endDate.value = '';
    state.filters = { type: 'all', startDate: '', endDate: '' };
    showToast('フィルターをリセットしました', 'info');
    loadItems();
  });

  elements.form.addEventListener('submit', handleSubmit);
  elements.cancelEdit.addEventListener('click', () => {
    resetForm();
    showToast('編集をキャンセルしました', 'info');
  });
};

const init = async () => {
  setToday();
  wireEvents();
  await loadUser();
  await loadItems();
};

init();
