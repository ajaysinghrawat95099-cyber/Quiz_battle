# Quiz Battle — Brain vs Brain

A responsive real-time multiplayer quiz party game for 2–8 players. Players create a room, share a six-character code, answer 10 multiple-choice questions with a 10-second timer, and compete on a live leaderboard.

## Features
- Room creation and room-code joining
- Nicknames and lobby ready status
- Host-only start, minimum 2 players, maximum 8
- Server-authoritative question timer and scoring
- Mixed general knowledge, science, technology, movies, and fun facts
- Speed-based points: 1000 / 800 / 600 / 400 for correct answers; 0 for incorrect or missed
- Live scores, answer reveal, fun facts, final podium
- Mobile-responsive layout
- Brief 45-second disconnected-player grace period

## Run locally

Requires Node.js 18 or newer.

1. Extract the ZIP.
2. Open a terminal in the extracted `quiz_battle` folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000` in your browser.

To test multiple players on one computer, open multiple browser tabs. For real devices on the same Wi-Fi, use the computer's local network IP and port 3000 (firewall permitting).

## Put it online for friends

Deploy this Node.js project to a host that supports persistent Node processes and WebSockets, such as Render, Railway, or a VPS. Set the start command to `npm start`. Use the public HTTPS URL on each device. Free-tier behavior and pricing can change, and some hosts may sleep when idle.

## Important notes
- Rooms are held in server memory. Restarting the server ends all current rooms.
- This starter has no account system or database; room codes are intended for casual private play.
- Questions are bundled in `server.js`; edit the `QUESTIONS` array to add or replace questions.
- The 10-question match uses a randomized selection from the built-in question bank.
- Scores are calculated on the server; clients cannot choose their own points.
- This is a working starter project, not yet a production-hardened service. Before a public launch, add persistent storage, rate limiting, moderation/reporting, robust reconnect identity, and automated tests.
