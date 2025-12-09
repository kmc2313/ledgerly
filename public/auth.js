const authFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '認証に失敗しました');
  }
  return data;
};

const checkSession = async () => {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (res.status === 200) {
      const data = await res.json();
      if (data.user) {
        window.location.href = '/';
      }
    }
  } catch (_) {
    // ignore
  }
};

const loginForm = document.querySelector('#loginForm');
const registerForm = document.querySelector('#registerForm');
const loginMessage = document.querySelector('#loginMessage');
const registerMessage = document.querySelector('#registerMessage');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginMessage.textContent = '';
    try {
      await authFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.querySelector('#loginEmail').value,
          password: document.querySelector('#loginPassword').value,
        }),
      });
      window.location.href = '/';
    } catch (err) {
      loginMessage.textContent = err.message;
      loginMessage.className = 'error';
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerMessage.textContent = '';
    try {
      await authFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          email: document.querySelector('#registerEmail').value,
          password: document.querySelector('#registerPassword').value,
        }),
      });
      window.location.href = '/';
    } catch (err) {
      registerMessage.textContent = err.message;
      registerMessage.className = 'error';
    }
  });
}

checkSession();
