// scripts/init-db.js
// サーバーのテーブル仕様（users.password_hash / entries.*）に合わせて初期化＋デモ投入
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const demoEmail = 'demo@ledgerly.test';
const demoPassword = 'password123';

async function main() {
  console.log('--- DB初期化とデモユーザー投入を開始 ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // データを消してよい場合: 旧テーブル/型を丸ごと削除してから作成し直す
    await client.query(`
      DROP TABLE IF EXISTS entries CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS "User" CASCADE;
      DROP TYPE IF EXISTS "EntryType" CASCADE;
    `);

    // テーブル作成（存在しない場合のみ）
    // 既存テーブルがあっても期待スキーマに揃える
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income','expense')),
        memo TEXT DEFAULT '',
        occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 足りない列を追加
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE entries
        ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS memo TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // Prisma 旧スキーマからの移行: password -> password_hash, event_name -> title, note -> memo, date -> occurred_on
    await client.query(`
      -- users.password -> password_hash
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'password'
        ) THEN
          BEGIN
            ALTER TABLE users RENAME COLUMN password TO password_hash;
          EXCEPTION WHEN duplicate_column THEN NULL;
          END;
        END IF;
      END $$;

      -- entries: event_name -> title, note -> memo, date -> occurred_on
      DO $$
      DECLARE
        has_title BOOLEAN;
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='entries' AND column_name='title'
        ) INTO has_title;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='entries' AND column_name='event_name') THEN
          IF has_title THEN
            -- title が既にある場合は event_name を削除して衝突回避
            BEGIN
              ALTER TABLE entries DROP COLUMN event_name;
            EXCEPTION WHEN undefined_column THEN NULL;
            END;
          ELSE
            -- title が無ければリネーム
            BEGIN
              ALTER TABLE entries RENAME COLUMN event_name TO title;
            EXCEPTION WHEN duplicate_column THEN
              ALTER TABLE entries DROP COLUMN event_name;
            END;
          END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='entries' AND column_name='note') THEN
          BEGIN
            ALTER TABLE entries RENAME COLUMN note TO memo;
          EXCEPTION WHEN duplicate_column THEN NULL;
          END;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='entries' AND column_name='date') THEN
          BEGIN
            ALTER TABLE entries RENAME COLUMN date TO occurred_on;
          EXCEPTION WHEN duplicate_column THEN NULL;
          END;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, occurred_on DESC);
      CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
    `);

    // デモユーザー upsert（password_hash で保存）
    const hashed = await bcrypt.hash(demoPassword, 10);
    const demoUser = await client.query(
      `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id, email
      `,
      [demoEmail, hashed]
    );

    const demoUserId = demoUser.rows[0].id;
    console.log(`✅ デモユーザー: ${demoEmail} (ID: ${demoUserId})`);

    // 既にデモデータがある場合はスキップ
    const { rows } = await client.query('SELECT COUNT(*) AS count FROM entries WHERE user_id=$1', [
      demoUserId,
    ]);
    if (Number(rows[0].count) === 0) {
      await client.query(
        `
          INSERT INTO entries (user_id, title, amount, type, memo, occurred_on)
          VALUES
            ($1, 'Freelance', 120000, 'income', 'Website launch payout', CURRENT_DATE - INTERVAL '5 days'),
            ($1, 'Coffee', 450, 'expense', 'Afternoon pick-me-up', CURRENT_DATE - INTERVAL '4 days'),
            ($1, 'Groceries', 5400, 'expense', 'Veggies and pasta', CURRENT_DATE - INTERVAL '3 days'),
            ($1, 'Salary', 280000, 'income', 'Monthly paycheck', CURRENT_DATE - INTERVAL '15 days'),
            ($1, 'Gym', 9800, 'expense', '3-month membership', CURRENT_DATE - INTERVAL '10 days')
        `,
        [demoUserId]
      );
      console.log('✅ デモ用の収支データを追加しました');
    } else {
      console.log('ℹ️ 既存の収支データがあるためスキップしました');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 初期化中にエラーが発生しました:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('--- データベース初期化完了 ---');
  }
}

main();
