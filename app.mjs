// SQLite-powered version of your app (replacing MongoDB)
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';
import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { PORT = 3000, AUTH = 'default' } = process.env;
const app = express();

let db;
sqlite3.verbose();

const initDb = async () => {
  db = await open({
    filename: './laborqueue.db',
    driver: sqlite3.Database
  });

  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    jobsTrained TEXT,
    totalMinutes INTEGER DEFAULT 0,
    jobType TEXT,
    lastModified TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT,
    ip TEXT,
    method TEXT,
    url TEXT,
    headers TEXT
  )`);
};

app.set('trust proxy', true);
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable('x-powered-by');

function authentication(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.sendStatus(401);
  }
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  if (auth[1] === AUTH) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.sendStatus(401);
  }
}

app.get('/', async (req, res) => {
  await db.run(
    `INSERT INTO logs (time, ip, method, url, headers) VALUES (?, ?, ?, ?, ?)`,
    [
      new Date().toISOString(),
      req.ip,
      req.method,
      req.url,
      JSON.stringify(req.headers)
    ]
  );
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

app.get('/laborqueue', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/laborqueue.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/admin.html'));
});

app.get('/userdata', async (req, res) => {
  try {
    const users = await db.all(`SELECT * FROM users`);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to get user data');
  }
});

app.post('/users', async (req, res) => {
  const { name, jobsTrained, totalMinutes } = req.body;
  try {
    const existing = await db.get(`SELECT * FROM users WHERE name = ?`, [name]);
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const jobsStr = Array.isArray(jobsTrained) ? jobsTrained.join(',') : jobsTrained;
    await db.run(
      `INSERT INTO users (name, jobsTrained, totalMinutes) VALUES (?, ?, ?)`,
      [name, jobsStr, parseInt(totalMinutes)]
    );
    res.json({ message: 'User added' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to add user');
  }
});

app.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, jobsTrained, totalMinutes } = req.body;
  try {
    const jobsStr = Array.isArray(jobsTrained) ? jobsTrained.join(',') : jobsTrained;
    const result = await db.run(
      `UPDATE users SET name = ?, jobsTrained = ?, totalMinutes = ? WHERE id = ?`,
      [name, jobsStr, totalMinutes, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found or no changes' });
    }
    res.json({ message: 'User updated' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating user');
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const result = await db.run(`DELETE FROM users WHERE id = ?`, [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting user');
  }
});

app.post('/clear-users', async (req, res) => {
  try {
    await db.run(`DELETE FROM users`);
    res.json({ message: 'All users cleared' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error clearing users');
  }
});

app.post('/submit-queue', async (req, res) => {
  try {
    const users = req.body;
    for (const user of users) {
      const { name, minutesTillEndOfShift, jobType, timestamp } = user;
      const userRecord = await db.get(`SELECT * FROM users WHERE name = ?`, [name]);
      if (!userRecord) continue;

      const newTotalMinutes = (userRecord.totalMinutes || 0) + parseInt(minutesTillEndOfShift);
      await db.run(
        `UPDATE users SET jobType = ?, totalMinutes = ?, lastModified = ? WHERE name = ?`,
        [jobType, newTotalMinutes, timestamp, name]
      );
    }
    res.json({ message: 'Queue processed' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing queue');
  }
});

app.post('/backup-users', async (req, res) => {
  try {
    const users = await db.all(`SELECT * FROM users`);
    const filename = `userBackup-${new Date()
      .toLocaleString('en-US', { timeZone: 'America/Chicago' })
      .replace(/[/:]/g, '-')}.json`;
    fs.writeFileSync(
      path.join(__dirname, 'backups', filename),
      JSON.stringify(users, null, 2)
    );
    res.send(`Backup saved as ${filename}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error backing up users');
  }
});

app.get('/list-backups', (req, res) => {
  const backupDir = path.join(__dirname, 'backups');
  fs.readdir(backupDir, (err, files) => {
    if (err) return res.status(500).send('Error listing backups');
    const backups = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        filename: file,
        timestamp: file.replace('userBackup-', '').replace('.json', '')
      }));
    res.json(backups);
  });
});

app.post('/restore-users', async (req, res) => {
  try {
    const { filename } = req.body;
    const data = fs.readFileSync(path.join(__dirname, 'backups', filename), 'utf8');
    const users = JSON.parse(data);
    await db.run(`DELETE FROM users`);
    const insertStmt = db.prepare(
      `INSERT INTO users (id, name, jobsTrained, totalMinutes, jobType, lastModified) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const u of users) {
      await insertStmt.run(
        u.id || null,
        u.name,
        u.jobsTrained,
        u.totalMinutes,
        u.jobType,
        u.lastModified
      );
    }
    await insertStmt.finalize();
    res.send('Users restored from backup');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error restoring users');
  }
});

app.delete('/delete-backup', (req, res) => {
  const { filename } = req.body;
  const filePath = path.join(__dirname, 'backups', filename);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).send('Failed to delete backup');
    res.send('Backup deleted');
  });
});

app.use('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /');
});
