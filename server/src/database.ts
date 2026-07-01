import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const databaseDir = path.resolve(process.cwd(), '..', 'database');
fs.mkdirSync(databaseDir, { recursive: true });

const databasePath = path.join(databaseDir, 'farmpro.db');

export const db = new Database(databasePath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cattle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ear_tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    birthday TEXT NOT NULL,
    sire TEXT DEFAULT '',
    dam TEXT DEFAULT '',
    parity INTEGER DEFAULT 0,
    blv_status TEXT DEFAULT '未検査',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const count = db.prepare('SELECT COUNT(*) AS count FROM cattle').get() as { count: number };

if (count.count === 0) {
  const insert = db.prepare(`
    INSERT INTO cattle
      (ear_tag, name, birthday, sire, dam, parity, blv_status, note)
    VALUES
      (@earTag, @name, @birthday, @sire, @dam, @parity, @blvStatus, @note)
  `);

  insert.run({
    earTag: '1234567890',
    name: 'ふじ号',
    birthday: '2022-04-10',
    sire: '勝早桜5',
    dam: 'さくら号',
    parity: 3,
    blvStatus: '陰性',
    note: 'Starter Pack 2 初期データ'
  });

  insert.run({
    earTag: '1234567891',
    name: 'さくら号',
    birthday: '2023-01-20',
    sire: '福之姫',
    dam: 'はな号',
    parity: 1,
    blvStatus: '陰性',
    note: ''
  });

  insert.run({
    earTag: '1234567892',
    name: 'はな号',
    birthday: '2021-09-05',
    sire: '美国桜',
    dam: 'ゆき号',
    parity: 4,
    blvStatus: '未検査',
    note: ''
  });
}
