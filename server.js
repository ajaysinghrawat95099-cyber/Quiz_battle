const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const TOTAL_QUESTIONS = 10;
const QUESTION_MS = 10_000;
const REVEAL_MS = 2_200;
const rooms = new Map();

const QUESTIONS = [
  {category:"Science", q:"Which planet is known as the Red Planet?", options:["Venus","Mars","Jupiter","Mercury"], answer:1, fact:"Iron-rich dust gives Mars its reddish appearance."},
  {category:"Technology", q:"What does CPU stand for?", options:["Central Processing Unit","Computer Power Utility","Core Program Upload","Central Performance User"], answer:0, fact:"The CPU executes instructions and coordinates computer operations."},
  {category:"Movies", q:"Which movie features the fictional kingdom of Arendelle?", options:["Moana","Coco","Frozen","Tangled"], answer:2, fact:"Arendelle is the kingdom in Disney's Frozen."},
  {category:"General Knowledge", q:"What is the largest ocean on Earth?", options:["Atlantic","Indian","Arctic","Pacific"], answer:3, fact:"The Pacific Ocean is the largest and deepest ocean."},
  {category:"Fun Facts", q:"How many hearts does an octopus have?", options:["One","Two","Three","Four"], answer:2, fact:"An octopus has three hearts."},
  {category:"Science", q:"Which gas do plants absorb during photosynthesis?", options:["Oxygen","Carbon dioxide","Nitrogen","Hydrogen"], answer:1, fact:"Plants use carbon dioxide, water and light to make sugars."},
  {category:"Technology", q:"Which of these is a web browser?", options:["Linux","Python","Firefox","Bluetooth"], answer:2, fact:"Firefox is a web browser developed by Mozilla."},
  {category:"Movies", q:"In the Toy Story films, what kind of toy is Woody?", options:["Astronaut","Cowboy","Robot","Pirate"], answer:1, fact:"Woody is a pull-string cowboy toy."},
  {category:"General Knowledge", q:"How many sides does a hexagon have?", options:["Five","Six","Seven","Eight"], answer:1, fact:"The prefix 'hexa-' means six."},
  {category:"Fun Facts", q:"Which animal is famous for having black-and-white stripes?", options:["Zebra","Tiger","Leopard","Cheetah"], answer:0, fact:"Each zebra has a unique stripe pattern."},
  {category:"Science", q:"What is the closest star to Earth?", options:["Sirius","The Sun","Proxima Centauri","Polaris"], answer:1, fact:"The Sun is our nearest star."},
  {category:"Technology", q:"What does 'www' commonly stand for in a web address?", options:["World Wide Web","Web World Window","Wide Web Wire","World Web Works"], answer:0, fact:"WWW stands for World Wide Web."},
  {category:"Movies", q:"Which superhero is also known as the Dark Knight?", options:["Spider-Man","Iron Man","Batman","Thor"], answer:2, fact:"Batman protects Gotham City."},
  {category:"General Knowledge", q:"What is the capital city of Japan?", options:["Kyoto","Tokyo","Osaka","Sapporo"], answer:1, fact:"Tokyo is Japan's capital and largest metropolitan area."},
  {category:"Fun Facts", q:"What is a group of flamingos commonly called?", options:["A parade","A flamboyance","A school","A tower"], answer:1, fact:"A group of flamingos is often called a flamboyance."},
  {category:"Science", q:"At sea level, water boils at what temperature in Celsius?", options:["50°C","90°C","100°C","120°C"], answer:2, fact:"Pure water boils at 100°C at standard atmospheric pressure."},
  {category:"Technology", q:"Which company created the Android operating system initially?", options:["Apple","Google","Microsoft","Nokia"], answer:1, fact:"Google acquired Android Inc. in 2005."},
  {category:"Movies", q:"Which animated film features a clownfish named Marlin?", options:["Finding Nemo","Shrek","Up","Cars"], answer:0, fact:"Marlin searches the ocean for his son Nemo."},
  {category:"General Knowledge", q:"How many days are there in a leap year?", options:["364","365","366","367"], answer:2, fact:"A leap year has 366 days."},
  {category:"Fun Facts", q:"Which of these mammals can truly fly?", options:["Flying squirrel","Bat","Sugar glider","Colugo"], answer:1, fact:"Bats are the only mammals capable of sustained powered flight."}
];

function cleanName(s) { return String(s || "").trim().replace(/[<>]/g, "").slice(0, 18); }
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:6}, () => chars[crypto.randomInt(chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function publicRoom(room) {
  const players = [...room.players.values()].map(p => ({
    id:p.id, name:p.name, score:p.score, ready:p.ready, isHost:p.id===room.hostId,
    connected:p.connected
  }));
  return {
    code:room.code, phase:room.phase, players, hostId:room.hostId,
    questionNumber:room.questionIndex + 1, totalQuestions:TOTAL_QUESTIONS,
    question: room.phase === "question" ? {
      category: room.currentQuestion.category, q:room.currentQuestion.q,
      options:room.currentQuestion.options, endsAt:room.endsAt
    } : null,
    reveal: room.phase === "reveal" ? {
      correct:room.currentQuestion.answer, fact:room.currentQuestion.fact,
      lastScores:room.lastScores || {}
    } : null,
    finalRanking: room.phase === "finished" ? ranking(room) : null
  };
}
function ranking(room) {
  return [...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score}))
    .sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
}
function emitRoom(room) { io.to(room.code).emit("state", publicRoom(room)); }
function errorTo(socket, message) { socket.emit("gameError", message); }
function clearTimer(room) { if (room.timer) clearTimeout(room.timer); room.timer = null; }
function nextQuestion(room) {
  clearTimer(room);
  room.questionIndex++;
  if (room.questionIndex >= TOTAL_QUESTIONS) {
    room.phase = "finished"; room.currentQuestion = null; emitRoom(room); return;
  }
  room.phase = "question";
  room.currentQuestion = room.questions[room.questionIndex];
  room.answers = new Map();
  room.lastScores = {};
  room.endsAt = Date.now() + QUESTION_MS;
  emitRoom(room);
  room.timer = setTimeout(() => finishQuestion(room), QUESTION_MS);
}
function finishQuestion(room) {
  if (!room || room.phase !== "question") return;
  clearTimer(room);
  room.phase = "reveal";
  room.lastScores = {};
  for (const p of room.players.values()) {
    const a = room.answers.get(p.id);
    room.lastScores[p.id] = a ? a.points : 0;
  }
  emitRoom(room);
  room.timer = setTimeout(() => {
    if (rooms.get(room.code) === room && room.phase === "reveal") nextQuestion(room);
  }, REVEAL_MS);
}
function removeSocketFromRoom(socket) {
  const code = socket.data.roomCode;
  if (!code || !rooms.has(code)) return;
  const room = rooms.get(code);
  const player = room.players.get(socket.id);
  if (player) {
    player.connected = false;
    emitRoom(room);
    setTimeout(() => {
      if (!rooms.has(code)) return;
      const latest = rooms.get(code);
      const p = latest.players.get(socket.id);
      if (p && !p.connected) {
        latest.players.delete(socket.id);
        if (latest.hostId === socket.id) {
          const nextHost = latest.players.values().next().value;
          latest.hostId = nextHost ? nextHost.id : null;
        }
        if (latest.players.size === 0) {
          clearTimer(latest); rooms.delete(code);
        } else emitRoom(latest);
      }
    }, 45_000);
  }
  socket.leave(code);
  socket.data.roomCode = null;
}
io.on("connection", socket => {
  socket.on("createRoom", ({name} = {}) => {
    const playerName = cleanName(name);
    if (!playerName) return errorTo(socket, "Enter a nickname first.");
    const code = makeCode();
    const room = {
      code, phase:"lobby", hostId:socket.id, players:new Map(), questionIndex:-1,
      questions:QUESTIONS.slice().sort(()=>Math.random()-.5).slice(0,TOTAL_QUESTIONS),
      currentQuestion:null, answers:new Map(), timer:null, endsAt:null, lastScores:{}
    };
    room.players.set(socket.id, {id:socket.id,name:playerName,score:0,ready:true,connected:true});
    rooms.set(code, room);
    socket.join(code); socket.data.roomCode=code;
    emitRoom(room);
  });
  socket.on("joinRoom", ({code,name} = {}) => {
    const roomCode = String(code||"").trim().toUpperCase();
    const playerName = cleanName(name);
    if (!playerName) return errorTo(socket, "Enter a nickname first.");
    const room = rooms.get(roomCode);
    if (!room) return errorTo(socket, "Room not found. Check the code and try again.");
    if (room.phase !== "lobby") return errorTo(socket, "This game has already started.");
    if (room.players.size >= MAX_PLAYERS) return errorTo(socket, "This room is full (8 players maximum).");
    if ([...room.players.values()].some(p=>p.name.toLowerCase()===playerName.toLowerCase()))
      return errorTo(socket, "That nickname is already in use in this room.");
    if (socket.data.roomCode) removeSocketFromRoom(socket);
    room.players.set(socket.id,{id:socket.id,name:playerName,score:0,ready:true,connected:true});
    socket.join(roomCode); socket.data.roomCode=roomCode;
    emitRoom(room);
  });
  socket.on("setReady", ({ready} = {}) => {
    const room = rooms.get(socket.data.roomCode); if (!room || room.phase!=="lobby") return;
    const p=room.players.get(socket.id); if (!p) return;
    p.ready=!!ready; emitRoom(room);
  });
  socket.on("startGame", () => {
    const room=rooms.get(socket.data.roomCode);
    if (!room) return errorTo(socket,"Join a room first.");
    if (room.hostId!==socket.id) return errorTo(socket,"Only the host can start the game.");
    if (room.phase!=="lobby") return errorTo(socket,"The game has already started.");
    const players=[...room.players.values()];
    if (players.length<MIN_PLAYERS) return errorTo(socket,"At least 2 players are required.");
    if (!players.every(p=>p.ready && p.connected)) return errorTo(socket,"Everyone must be ready and connected.");
    for (const p of players) p.score=0;
    room.questionIndex=-1;
    nextQuestion(room);
  });
  socket.on("answer", ({choice} = {}) => {
    const room=rooms.get(socket.data.roomCode);
    if (!room || room.phase!=="question") return;
    const p=room.players.get(socket.id);
    if (!p || room.answers.has(socket.id)) return;
    const now=Date.now();
    if (now>room.endsAt) return;
    const idx=Number(choice);
    if (!Number.isInteger(idx) || idx<0 || idx>3) return;
    const correct=idx===room.currentQuestion.answer;
    const elapsed=now-(room.endsAt-QUESTION_MS);
    let points=0;
    if (correct) points=elapsed<=2000?1000:elapsed<=5000?800:elapsed<=8000?600:400;
    p.score+=points;
    room.answers.set(socket.id,{choice:idx,correct,points,at:now});
    io.to(room.code).emit("answerProgress",{answered:room.answers.size,total:room.players.size});
    if (room.answers.size>=room.players.size) finishQuestion(room);
  });
  socket.on("leaveRoom", () => removeSocketFromRoom(socket));
  socket.on("disconnect", () => removeSocketFromRoom(socket));
});

// Fixed console.log line with backticks
server.listen(PORT, () => console.log(Quiz Battle running at http://localhost:${PORT}));
