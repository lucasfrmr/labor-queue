import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs";
import express from "express";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { PORT, MONGODB, AUTH } = process.env;

const app = express();
const mongo = new MongoClient(MONGODB, { serverApi: ServerApiVersion.v1 });

const db = mongo.db("labor-queue");

app.locals.pretty = true;
app.set("trust proxy", true);
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable("x-powered-by");

// Connect to the database and start the server
mongo.connect().then(() => {
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
});

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
  db.collection("logs").insertOne({
    time: new Date().toISOString(),
    ip: req.ip,
    method: req.method,
    url: req.url,
    headers: req.headers,
  });
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
    const users = await db.collection("users").find().toArray();
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
    const userExists = await db.collection("users").findOne({ name });
    if (userExists) {
      return res
        .status(400)
        .json({ error: "User with this name already exists." });
    }
    const jobsTrainedArray = Array.isArray(jobsTrained)
      ? jobsTrained
      : [jobsTrained].filter(Boolean);
    await db.collection("users").insertOne({
      name,
      jobsTrained: jobsTrainedArray,
      totalMinutes: parseInt(totalMinutes, 10), // Ensure totalMinutes is stored as an integer
    });
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
    const updateResult = await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { name, jobsTrained, totalMinutes } }
      );
    if (updateResult.modifiedCount === 0) {
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

// Adjust this to your actual ID field name and database setup
app.delete("/users/:id", async (req, res) => {
  console.log("Delete user data:", req.params);
  try {
    const { id } = req.params;
    const deleteResult = await db
      .collection("users")
      .deleteOne({ _id: new ObjectId(id) }); // Ensure you're using ObjectId if MongoDB
    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Error deleting user." });
  }
});

// New route to clear all users from the database
app.post("/clear-users", async (req, res) => {
  try {
    await db.collection("users").deleteMany({});
    res.json({ message: "All user data cleared successfully." });
  } catch (error) {
    console.error("Failed to clear user data:", error);
    res.status(500).json({ error: "Error clearing user data." });
  }
});

app.post("/submit-queue", async (req, res) => {
  console.log("Queue data:", req.body);
  try {
    const users = req.body; // This should be an array of user data

    for (let user of users) {
      const { name, minutesTillEndOfShift, jobType, timestamp } = user;
      // Find the user's record in the database
      const userRecord = await db.collection("users").findOne({ name });
      if (!userRecord) {
        console.error("User not found:", name);
        continue; // Skip this user if not found
      }
      // Calculate new total minutes
      const newTotalMinutes =
        (userRecord.totalMinutes || 0) + parseInt(minutesTillEndOfShift, 10);

      // Update the user's record with new minutes and job type
      await db.collection("users").updateOne(
        { name },
        {
          $set: { jobType, totalMinutes: newTotalMinutes },
          $push: {
            laborShares: {
              jobType,
              minutes: minutesTillEndOfShift,
              timestamp,
            },
          },
          $currentDate: { lastModified: true },
        }
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
    const users = await db.collection("users").find().toArray();
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

// app.post('/backup-users', async (req, res) => {
//   try {
//       const users = await db.collection('users').find().toArray();
//       fs.writeFileSync(path.join(__dirname, 'backups', 'userBackup.json'), JSON.stringify(users, null, 2));
//       res.status(200).send("Backup completed successfully.");
//   } catch (error) {
//       console.error("Failed to backup user data:", error);
//       res.status(500).send("Error backing up user data.");
//   }
// });

app.post("/restore-users", async (req, res) => {
  try {
    const { filename } = req.body;
    const data = fs.readFileSync(
      path.join(__dirname, "backups", filename),
      "utf8"
    );
    const users = JSON.parse(data);
    const usersWithObjectId = users.map((user) => ({
      ...user,
      _id: new ObjectId(user._id),
    }));
    // console.log('restored userData', data);
    await db.collection("users").deleteMany({});
    await db.collection("users").insertMany(usersWithObjectId);
    res.status(200).send("Restore completed successfully from " + filename);
  } catch (error) {
    console.error("Failed to restore user data:", error);
    res.status(500).send("Error restoring user data.");
  }
});

// app.post('/restore-users', async (req, res) => {
//   try {
//       const data = fs.readFileSync(path.join(__dirname, 'backups', 'userBackup.json'), 'utf8');
//       const users = JSON.parse(data);

//       // Convert _id from string to ObjectId
//       const usersWithObjectId = users.map(user => ({
//           ...user,
//           _id: new ObjectId(user._id) // Ensure _id is an ObjectId
//       }));

//       await db.collection('users').deleteMany({}); // Clear current data
//       await db.collection('users').insertMany(usersWithObjectId);
//       res.status(200).send("Restore completed successfully.");
//   } catch (error) {
//       console.error("Failed to restore user data:", error);
//       res.status(500).send("Error restoring user data.");
//   }
// });

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
