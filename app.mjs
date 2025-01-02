import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs";
import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { PORT, AUTH } = process.env;

const app = express();
let db;

app.locals.pretty = true;
app.set("trust proxy", true);
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable("x-powered-by");

// Connect to the database and start the server
(async () => {
  db = await open({
    filename: path.join(__dirname, "database.sqlite"),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT,
      ip TEXT,
      method TEXT,
      url TEXT,
      headers TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      jobsTrained TEXT,
      totalMinutes INTEGER,
      jobType TEXT,
      laborShares TEXT,
      lastModified TEXT
    );
  `);

  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
})();

function authentication(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.sendStatus(401);
  }
  const auth = new Buffer.from(authHeader.split(" ")[1], "base64")
    .toString()
    .split(":");
  if (auth[1] == AUTH) {
    next();
  } else {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.sendStatus(401);
  }
}

app.get("/", (req, res) => {
  // insert a log into the database
  console.log(req.ip);
  db.run(
    `INSERT INTO logs (time, ip, method, url, headers) VALUES (?, ?, ?, ?, ?)`,
    [
      new Date().toISOString(),
      req.ip,
      req.method,
      req.url,
      JSON.stringify(req.headers),
    ]
  );
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/laborqueue", (req, res) => {
  console.log(req.url, req.ip);
  res.sendFile(__dirname + "/views/laborqueue.html");
});

app.get("/admin", (req, res) => {
  console.log(req.url, req.ip);
  console.log("admin page");
  res.sendFile(__dirname + "/views/admin.html");
});

app.get("/userdata", async (req, res) => {
  try {
    const users = await db.all(`SELECT * FROM users`);
    res.json(users);
    console.log("get user data" + users);
  } catch (error) {
    console.error("Failed to get user data:", error);
    res.status(500).send("Error getting user data.");
  }
});

app.post("/users", async (req, res) => {
  console.log("Users post data:", req.body);
  try {
    const { name, jobsTrained, totalMinutes } = req.body;
    const userExists = await db.get(`SELECT * FROM users WHERE name = ?`, [
      name,
    ]);
    if (userExists) {
      return res
        .status(400)
        .json({ error: "User with this name already exists." });
    }
    const jobsTrainedArray = Array.isArray(jobsTrained)
      ? jobsTrained
      : [jobsTrained].filter(Boolean);
    await db.run(
      `INSERT INTO users (name, jobsTrained, totalMinutes) VALUES (?, ?, ?)`,
      [name, JSON.stringify(jobsTrainedArray), parseInt(totalMinutes, 10)]
    );
    res.json({ message: "User data submitted successfully." });
  } catch (error) {
    console.error("Failed to submit user data:", error);
    res.status(500).json({ error: "Error submitting user data." });
  }
});

app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, jobsTrained, totalMinutes } = req.body;
  try {
    const updateResult = await db.run(
      `UPDATE users SET name = ?, jobsTrained = ?, totalMinutes = ? WHERE id = ?`,
      [name, JSON.stringify(jobsTrained), totalMinutes, id]
    );
    if (updateResult.changes === 0) {
      return res
        .status(404)
        .json({ error: "User not found or no changes made." });
    }
    res.json({ message: "User updated successfully." });
  } catch (error) {
    console.error("Failed to update user:", error);
    res.status(500).json({ error: "Error updating user." });
  }
});

app.delete("/users/:id", async (req, res) => {
  console.log("Delete user data:", req.params);
  try {
    const { id } = req.params;
    const deleteResult = await db.run(`DELETE FROM users WHERE id = ?`, [id]);
    if (deleteResult.changes === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Error deleting user." });
  }
});

app.post("/clear-users", async (req, res) => {
  try {
    await db.run(`DELETE FROM users`);
    res.json({ message: "All user data cleared successfully." });
  } catch (error) {
    console.error("Failed to clear user data:", error);
    res.status(500).json({ error: "Error clearing user data." });
  }
});

app.post("/submit-queue", async (req, res) => {
  console.log("Queue data:", req.body);
  try {
    const users = req.body;

    for (let user of users) {
      const { name, minutesTillEndOfShift, jobType, timestamp } = user;
      const userRecord = await db.get(`SELECT * FROM users WHERE name = ?`, [
        name,
      ]);
      if (!userRecord) {
        console.error("User not found:", name);
        continue;
      }
      const newTotalMinutes =
        (userRecord.totalMinutes || 0) + parseInt(minutesTillEndOfShift, 10);

      await db.run(
        `UPDATE users SET jobType = ?, totalMinutes = ?, laborShares = ?, lastModified = ? WHERE name = ?`,
        [
          jobType,
          newTotalMinutes,
          JSON.stringify([
            ...(JSON.parse(userRecord.laborShares || "[]")),
            { jobType, minutes: minutesTillEndOfShift, timestamp },
          ]),
          new Date().toISOString(),
          name,
        ]
      );
    }
    res.json({ message: "Queue processed successfully." });
  } catch (error) {
    console.error("Failed to process queue:", error);
    res.status(500).send("Failed to process queue.");
  }
});

app.post("/backup-users", async (req, res) => {
  try {
    const users = await db.all(`SELECT * FROM users`);
    const filename = `userBackup-${new Date()
      .toLocaleString("en-US", { timeZone: "America/Chicago" })
      .replace(/[/:]/g, "-")}.json`;
    fs.writeFileSync(
      path.join(__dirname, "backups", filename),
      JSON.stringify(users, null, 2)
    );
    res.status(200).send(`Backup created successfully as ${filename}`);
  } catch (error) {
    console.error("Failed to backup user data:", error);
    res.status(500).send("Error backing up user data.");
  }
});

app.get("/list-backups", (req, res) => {
  const backupDir = path.join(__dirname, "backups");
  fs.readdir(backupDir, (err, files) => {
    if (err) {
      console.error("Failed to list backup files:", err);
      return res.status(500).send("Error listing backup files.");
    }
    const backups = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({
        filename: file,
        timestamp: file.replace("userBackup-", "").replace(".json", ""),
      }));
    res.json(backups);
  });
});

app.post("/restore-users", async (req, res) => {
  try {
    const { filename } = req.body;
    const data = fs.readFileSync(
      path.join(__dirname, "backups", filename),
      "utf8"
    );
    const users = JSON.parse(data);
    await db.run(`DELETE FROM users`);
    for (const user of users) {
      await db.run(
        `INSERT INTO users (id, name, jobsTrained, totalMinutes, jobType, laborShares, lastModified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.name,
          user.jobsTrained,
          user.totalMinutes,
          user.jobType,
          user.laborShares,
          user.lastModified,
        ]
      );
    }
    res.status(200).send("Restore completed successfully from " + filename);
  } catch (error) {
    console.error("Failed to restore user data:", error);
    res.status(500).send("Error restoring user data.");
  }
});

app.delete("/delete-backup", (req, res) => {
  const { filename } = req.body;
  const filePath = path.join(__dirname, "backups", filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Failed to delete backup file:", err);
      return res.status(500).send("Error deleting backup file.");
    }
    res.send("Backup deleted successfully.");
  });
});

app.use("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nDisallow: /");
});
