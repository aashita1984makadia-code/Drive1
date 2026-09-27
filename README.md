# Jeel Cloud Drive

## Requirements
Node.js 18+ is recommended.

## Start
1. Open a terminal in this folder.
2. Run:
   npm install
3. Run:
   npm start
4. Open:
   http://localhost:3000

Default login:
- Username: jeel
- Password: 1234

## Data
Uploaded files are stored in `data/uploads`.
The SQLite database is `data/cloud.db`.

## Change login
Set environment variables before starting:

Windows CMD:
set CLOUD_USER=myuser
set CLOUD_PASSWORD=mypassword
npm start

Termux/Linux:
export CLOUD_USER=myuser
export CLOUD_PASSWORD=mypassword
npm start

For a real Internet-facing deployment, change SESSION_SECRET and use HTTPS/reverse proxy.
