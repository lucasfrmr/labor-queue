import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs";
import express from "express";
import Loki from 'lokijs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { PORT } = process.env;

const app = express();

// Initialize LokiJS database
const dbFile = path.join(__dirname, 'labor-queue-db.json');
const db = new Loki(dbFile, {
  autoload: true,
  autoloadCallback: initializeDb,
  autosave: true,
  autosaveInterval: 4000 // save every 4 seconds
});

// Collection reference
let users;
let config;

function initializeDb() {
  // Initialize collections if they don't exist
  users = db.getCollection('users');
  if (users === null) {
    users = db.addCollection('users', { 
      indices: ['name'],
      unique: ['name']
    });
    console.log('Created users collection');
  }
  
  // Add config collection for app settings
  config = db.getCollection('config');
  if (config === null) {
    config = db.addCollection('config');
    // Initialize with default config
    config.insert({
      id: 'app_config',
      timezone: 'America/Chicago',
      shifts: [
        { name: "Morning", startTime: "07:00", endTime: "15:00", hours: 8 },
        { name: "Evening", startTime: "15:00", endTime: "23:00", hours: 8 },
        { name: "Night", startTime: "23:00", endTime: "07:00", hours: 8 }
      ]
    });
    console.log('Created config collection with default settings');
  }
  
  console.log('✅ LokiJS database initialized!');
}

app.locals.pretty = true;
app.set("trust proxy", true);
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable("x-powered-by");

app.get("/laborqueue", (req, res) => {
  console.log(req.url, req.ip);
  res.sendFile(__dirname + "/views/laborqueue.html");
});

app.get("/admin", (req, res) => {
  console.log(req.url, req.ip);
  res.sendFile(__dirname + "/views/admin.html");
});

app.get("/userdata", async (req, res) => {
  try {
    const allUsers = users.find();
    res.json(allUsers);
    console.log(`Retrieved ${allUsers.length} users from database`);
  } catch (error) {
    console.error("Failed to get user data:", error);
    res.status(500).send("Error getting user data.");
  }
});

app.post("/users", async (req, res) => {
  console.log("Users post data:", req.body);
  try {
    const { name, jobsTrained, totalMinutes, shift } = req.body;
    const userExists = users.findOne({ name });
    if (userExists) {
      return res
        .status(400)
        .json({ error: "User with this name already exists." });
    }
    const jobsTrainedArray = Array.isArray(jobsTrained)
      ? jobsTrained
      : [jobsTrained].filter(Boolean);
    
    users.insert({
      name,
      shift, // Adding the shift field
      jobsTrained: jobsTrainedArray,
      totalMinutes: parseInt(totalMinutes, 10),
    });
    db.saveDatabase(); // Save changes to disk
    res.json({ message: "User data submitted successfully." });
  } catch (error) {
    console.error("Failed to submit user data:", error);
    res.status(500).json({ error: "Error submitting user data." });
  }
});

app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, jobsTrained, totalMinutes, laborShare, shift } = req.body;
  try {
    console.log(`Updating user with ID: ${id}, type: ${typeof id}`);
    
    // Make sure id is treated as an integer for LokiJS
    const lokiId = parseInt(id, 10);
    if (isNaN(lokiId)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    
    const user = users.findOne({ $loki: lokiId });
    
    if (!user) {
      console.error(`User not found with ID ${lokiId}`);
      return res.status(404).json({ error: "User not found." });
    }
    
    console.log("Found user:", user);
    
    user.name = name;
    user.jobsTrained = jobsTrained;
    user.totalMinutes = totalMinutes;
    user.shift = shift; // Add shift field
    
    // If a labor share was provided, add it to the user's labor shares array
    if (laborShare) {
      if (!user.laborShares) {
        user.laborShares = [];
      }
      user.laborShares.push(laborShare);
    }
    
    users.update(user);
    db.saveDatabase(); // Save changes to disk
    
    console.log("User updated successfully:", user);
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
    const user = users.findOne({ $loki: parseInt(id) });
    
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    
    users.remove(user);
    db.saveDatabase(); // Save changes to disk
    
    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Error deleting user." });
  }
});

// New route to clear all users from the database
app.post("/clear-users", async (req, res) => {
  try {
    users.clear();
    db.saveDatabase(); // Save changes to disk
    res.json({ message: "All user data cleared successfully." });
  } catch (error) {
    console.error("Failed to clear user data:", error);
    res.status(500).json({ error: "Error clearing user data." });
  }
});

app.post("/submit-queue", async (req, res) => {
  console.log("Queue data:", req.body);
  try {
    const usersList = req.body; // This should be an array of user data

    for (let userData of usersList) {
      const { name, minutesTillEndOfShift, jobType, timestamp } = userData;
      // Find the user's record in the database
      const userRecord = users.findOne({ name });
      if (!userRecord) {
        console.error("User not found:", name);
        continue; // Skip this user if not found
      }
      
      // Calculate new total minutes
      const newTotalMinutes = 
        (userRecord.totalMinutes || 0) + parseInt(minutesTillEndOfShift, 10);
      
      // Initialize laborShares if it doesn't exist
      if (!userRecord.laborShares) {
        userRecord.laborShares = [];
      }
      
      // Update the user's record
      userRecord.jobType = jobType;
      userRecord.totalMinutes = newTotalMinutes;
      userRecord.laborShares.push({
        jobType,
        minutes: minutesTillEndOfShift,
        timestamp
      });
      userRecord.lastModified = new Date();
      
      users.update(userRecord);
    }
    
    db.saveDatabase(); // Save changes to disk
    res.json({ message: "Queue processed successfully." });
  } catch (error) {
    console.error("Failed to process queue:", error);
    res.status(500).send("Failed to process queue.");
  }
});

app.post("/backup-users", async (req, res) => {
  try {
    const allUsers = users.find();
    const filename = `userBackup-${new Date()
      .toLocaleString("en-US", { timeZone: "America/Chicago" })
      .replace(/[/:]/g, "-")}.json`;
    
    const backupDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(backupDir, filename),
      JSON.stringify(allUsers, null, 2)
    );
    res.status(200).send(`Backup created successfully as ${filename}`);
  } catch (error) {
    console.error("Failed to backup user data:", error);
    res.status(500).send("Error backing up user data.");
  }
});

app.get("/list-backups", (req, res) => {
  const backupDir = path.join(__dirname, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    return res.json([]);
  }
  
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
    const backupUsers = JSON.parse(data);
    
    // Clear current users
    users.clear();
    
    // Insert users from backup (without MongoDB ObjectId)
    backupUsers.forEach(user => {
      // Remove MongoDB specific _id if it exists
      if (user._id) {
        delete user._id;
      }
      // Also remove LokiJS metadata if present
      if (user.$loki) {
        delete user.$loki;
      }
      if (user.meta) {
        delete user.meta;
      }
      users.insert(user);
    });
    
    db.saveDatabase(); // Save changes to disk
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

app.get("/config", async (req, res) => {
  try {
    // Get the app configuration (there should be only one document)
    const appConfig = config.findOne({ id: 'app_config' });
    if (!appConfig) {
      // Create default config if not found
      const defaultConfig = {
        id: 'app_config',
        timezone: 'America/Chicago',
        shifts: [
          { name: "Morning", startTime: "07:00", endTime: "15:00", hours: 8 },
          { name: "Evening", startTime: "15:00", endTime: "23:00", hours: 8 },
          { name: "Night", startTime: "23:00", endTime: "07:00", hours: 8 }
        ]
      };
      config.insert(defaultConfig);
      db.saveDatabase();
      res.json(defaultConfig);
    } else {
      res.json(appConfig);
    }
  } catch (error) {
    console.error("Failed to get configuration:", error);
    res.status(500).json({ error: "Error getting configuration" });
  }
});

app.post("/config", async (req, res) => {
  try {
    const { timezone, shifts } = req.body;
    
    // Validate input
    if (!timezone) {
      return res.status(400).json({ error: "Timezone is required" });
    }
    
    if (!Array.isArray(shifts)) {
      return res.status(400).json({ error: "Shifts must be an array" });
    }
    
    // Get existing config or create a new one
    let appConfig = config.findOne({ id: 'app_config' });
    if (!appConfig) {
      appConfig = {
        id: 'app_config',
        timezone,
        shifts
      };
      config.insert(appConfig);
    } else {
      appConfig.timezone = timezone;
      appConfig.shifts = shifts;
      config.update(appConfig);
    }
    
    db.saveDatabase();
    res.json({ message: "Configuration saved successfully", config: appConfig });
  } catch (error) {
    console.error("Failed to save configuration:", error);
    res.status(500).json({ error: "Error saving configuration" });
  }
});

// Route to serve config.html page
app.get("/config-page", (req, res) => {
  console.log(req.url, req.ip);
  res.sendFile(__dirname + "/public/config.html");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.use("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nDisallow: /");
});
