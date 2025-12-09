require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

app.use(express.static(path.join(__dirname, '../public')));

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT 1 as ok');
    res.json({ ok: result.rows[0].ok === 1 });
  } catch (err) {
    res.status(500).json({ error: 'DB connection failed', detail: err.message });
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ user: null });
  }
  res.json({ user: req.session.user });
});

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hashed]
    );

    req.session.user = { id: result.rows[0].id, email: result.rows[0].email };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email=$1', [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.user = { id: user.id, email: user.email };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/items', requireAuth, async (req, res) => {
  const { type = 'all', startDate, endDate } = req.query;
  const conditions = ['user_id=$1'];
  const values = [req.session.user.id];
  let idx = 2;

  if (type === 'income' || type === 'expense') {
    conditions.push(`type=$${idx++}`);
    values.push(type);
  }
  if (startDate) {
    conditions.push(`occurred_on >= $${idx++}`);
    values.push(startDate);
  }
  if (endDate) {
    conditions.push(`occurred_on <= $${idx++}`);
    values.push(endDate);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT id, title, amount, type, memo, occurred_on AS "occurredOn", created_at AS "createdAt"
    FROM entries
    ${whereClause}
    ORDER BY occurred_on DESC, id DESC
  `;

  try {
    const result = await pool.query(query, values);
    const items = result.rows;
    const incomeTotal = items
      .filter((i) => i.type === 'income')
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const expenseTotal = items
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + Number(i.amount), 0);

    res.json({
      items,
      summary: {
        incomeTotal,
        expenseTotal,
        balance: incomeTotal - expenseTotal,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.get('/api/items/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const result = await pool.query(
      `
        SELECT id, title, amount, type, memo, occurred_on AS "occurredOn", created_at AS "createdAt"
        FROM entries
        WHERE id=$1 AND user_id=$2
      `,
      [id, req.session.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

app.post('/api/items', requireAuth, async (req, res) => {
  const { title = '', amount, type, occurredOn, memo = '' } = req.body;
  const valueAmount = Number(amount);
  if (!type || (type !== 'income' && type !== 'expense')) {
    return res.status(400).json({ error: 'Type must be income or expense' });
  }
  if (!Number.isFinite(valueAmount)) {
    return res.status(400).json({ error: 'Amount is required and must be a number' });
  }

  const dateToUse = occurredOn || new Date().toISOString().slice(0, 10);

  try {
    const result = await pool.query(
      `
        INSERT INTO entries (user_id, title, amount, type, memo, occurred_on)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, amount, type, memo, occurred_on AS "occurredOn", created_at AS "createdAt"
      `,
      [req.session.user.id, title.trim(), valueAmount, type, memo.trim(), dateToUse]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

app.put('/api/items/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { title = '', amount, type, occurredOn, memo = '' } = req.body;
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const valueAmount = Number(amount);
  if (!type || (type !== 'income' && type !== 'expense')) {
    return res.status(400).json({ error: 'Type must be income or expense' });
  }
  if (!Number.isFinite(valueAmount)) {
    return res.status(400).json({ error: 'Amount is required and must be a number' });
  }
  const dateToUse = occurredOn || new Date().toISOString().slice(0, 10);

  try {
    const result = await pool.query(
      `
        UPDATE entries
        SET title=$1, amount=$2, type=$3, memo=$4, occurred_on=$5
        WHERE id=$6 AND user_id=$7
        RETURNING id, title, amount, type, memo, occurred_on AS "occurredOn", created_at AS "createdAt"
      `,
      [title.trim(), valueAmount, type, memo.trim(), dateToUse, id, req.session.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

app.delete('/api/items/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const result = await pool.query('DELETE FROM entries WHERE id=$1 AND user_id=$2 RETURNING id', [
      id,
      req.session.user.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`Ledgerly server running on http://localhost:${port}`);
});
