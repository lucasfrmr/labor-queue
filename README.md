# dev.lucasfarmer.com

## Labor Queue Application

This application manages a labor queue system with an in-memory database (LokiJS) that persists data to disk.

### Tech Stack
- Node.js with Express
- LokiJS (in-memory database with persistence)
- Vanilla JavaScript for front-end

### Setup
1. Install dependencies: `npm install`
2. Run the development server: `npm run dev`
3. For production: `npm start`

### Database
This application uses LokiJS, a lightweight in-memory document database with persistence. The database automatically saves to `labor-queue-db.json` every 4 seconds.

### Features
- User management
- Job tracking
- Labor share calculations
- Automated backups
- Backup/restore functionality
