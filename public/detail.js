const detailJsonFetch = async (url, options = {}) => {
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
    throw new Error(data.error || '取得に失敗しました');
  }
  return data;
};

const yen = (value) => `¥${Number(value || 0).toLocaleString('ja-JP')}`;
const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

const titleEl = document.querySelector('#detailTitle');
const typeEl = document.querySelector('#detailType');
const amountEl = document.querySelector('#detailAmount');
const dateEl = document.querySelector('#detailDate');
const createdEl = document.querySelector('#detailCreated');
const memoEl = document.querySelector('#detailMemo');
const messageEl = document.querySelector('#detailMessage');

const params = new URLSearchParams(window.location.search);
const itemId = params.get('id');

const loadDetail = async () => {
  if (!itemId) {
    messageEl.textContent = 'URLにidクエリが必要です。';
    return;
  }
  try {
    const res = await detailJsonFetch(`/api/items/${itemId}`);
    if (!res) return;
    const item = res.item;
    titleEl.textContent = item.title || '無題';
    typeEl.textContent = item.type === 'income' ? '収入' : '支出';
    typeEl.classList.add(item.type);
    amountEl.textContent = yen(item.amount);
    dateEl.textContent = fmtDate(item.occurredOn);
    createdEl.textContent = fmtDate(item.createdAt);
    memoEl.textContent = item.memo || 'メモなし';
    memoEl.className = item.memo ? '' : 'notice';
    messageEl.textContent = '一覧のカードをクリックするとこのページに飛びます。';
  } catch (err) {
    messageEl.textContent = err.message;
    messageEl.className = 'error';
    titleEl.textContent = '読み込み失敗';
  }
};

loadDetail();
