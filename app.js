const socket = io();
const $ = id => document.getElementById(id);
let state = null, myId = null, myAnswer = null, timerInterval = null, toastTimeout = null;
const screens = ["home","lobby","game","results"];
const letters = ["A","B","C","D"];
function showScreen(id){screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove("show"),2800);}
function showHomeError(message){$("homeError").textContent=message||"";}
function nickname(){return $("nickname").value.trim();}
$("createBtn").addEventListener("click",()=>{showHomeError("");if(!nickname())return showHomeError("Please enter a nickname.");socket.emit("createRoom",{name:nickname()});});
$("joinBtn").addEventListener("click",()=>{showHomeError("");if(!nickname())return showHomeError("Please enter a nickname.");const code=$("roomCode").value.trim().toUpperCase();if(code.length!==6)return showHomeError("Enter the 6-character room code.");socket.emit("joinRoom",{name:nickname(),code});});
$("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));
$("nickname").addEventListener("keydown",e=>{if(e.key==="Enter")$("createBtn").click();});
$("roomCode").addEventListener("keydown",e=>{if(e.key==="Enter")$("joinBtn").click();});
$("copyCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(state.code);toast("Room code copied! Share it with your friends.");}catch{toast("Your room code is "+state.code);}});
$("readyBtn").addEventListener("click",()=>{const p=state?.players.find(p=>p.id===myId);socket.emit("setReady",{ready:!(p&&p.ready)});});
$("startBtn").addEventListener("click",()=>socket.emit("startGame"));
$("leaveLobby").addEventListener("click",()=>{socket.emit("leaveRoom");state=null;showScreen("home");});
$("newRoom").addEventListener("click",()=>{socket.emit("leaveRoom");state=null;showScreen("home");});
$("playAgain").addEventListener("click",()=>{if(!state)return;socket.emit("leaveRoom");state=null;showScreen("home");$("nickname").focus();toast("Create a new room and invite your squad for a rematch!");});
socket.on("connect",()=>{myId=socket.id;});
socket.on("disconnect",()=>toast("Connection lost. Refresh to reconnect."));
socket.on("gameError",message=>{if($("home").classList.contains("hidden"))toast(message);else showHomeError(message);});
socket.on("state",next=>{state=next;render();});
socket.on("answerProgress",info=>{if(state&&state.phase==="question")$("answeredCount").textContent=`${info.answered} of ${info.total} players answered`;});
function render(){
  if(!state)return;
  if(state.phase==="lobby"){showScreen("lobby");renderLobby();}
  else if(state.phase==="question"||state.phase==="reveal"){showScreen("game");renderGame();}
  else if(state.phase==="finished"){showScreen("results");renderResults();}
}
function renderLobby(){
  $("lobbyCode").textContent=state.code;$("playerCount").textContent=`${state.players.length}/8`;
  $("playerList").innerHTML="";
  state.players.forEach((p,i)=>{
    const el=document.createElement("div");el.className="player-card";
    el.innerHTML=`<div class="avatar">${escapeHtml(p.name.charAt(0).toUpperCase())}</div><div class="player-info"><b>${escapeHtml(p.name)}</b><small>${p.connected?"● Connected":"Reconnecting…"}</small></div>${p.isHost?'<span class="host-tag">HOST</span>':`<span class="host-tag" style="color:${p.ready?'#72e7b1':'#999'}">${p.ready?'READY':'WAITING'}</span>`}`;
    $("playerList").appendChild(el);
  });
  const me=state.players.find(p=>p.id===myId), host=state.hostId===myId;
  $("readyBtn").classList.toggle("hidden",host);
  $("readyBtn").textContent=me&&me.ready?"✓ Ready — click to change":"I'm ready ✓";
  $("startBtn").classList.toggle("hidden",!host);
  const ready=state.players.filter(p=>p.ready&&p.connected).length;
  $("lobbyHint").textContent=state.players.length<2?"Invite at least one more player to start.":`${ready}/${state.players.length} players ready. ${host?"You can start when everyone is ready.":"Waiting for the host to start."}`;
}
function renderGame(){
  if(state.phase==="question"){
    if(myAnswer===null)myAnswer=undefined;
    $("categoryTag").textContent=state.question.category.toUpperCase();
    $("questionText").textContent=state.question.q;
    $("questionCount").textContent=`QUESTION ${state.questionNumber}/${state.totalQuestions}`;
    $("gameRoom").textContent=`ROOM ${state.code}`;
    $("progressBar").style.width=`${(state.questionNumber-1)/state.totalQuestions*100}%`;
    $("gameMessage").textContent="Choose your answer before time runs out!";
    $("revealFact").classList.add("hidden");
    const answers=$("answers");answers.innerHTML="";
    state.question.options.forEach((option,i)=>{
      const b=document.createElement("button");b.className="answer-btn";b.disabled=myAnswer!==undefined;
      b.innerHTML=`<span class="answer-letter">${letters[i]}</span><span class="answer-text">${escapeHtml(option)}</span>`;
      b.addEventListener("click",()=>{if(myAnswer!==undefined)return;myAnswer=i;socket.emit("answer",{choice:i});renderGame();});
      answers.appendChild(b);
    });
    if(myAnswer!==undefined){[...answers.children].forEach((b,i)=>{b.disabled=true;if(i===myAnswer)b.classList.add("selected");});$("gameMessage").textContent="Answer locked in! Waiting for the squad…";}
    $("answeredCount").textContent="";
    clearInterval(timerInterval);updateTimer();timerInterval=setInterval(updateTimer,100);
  } else {
    clearInterval(timerInterval);
    $("timer").textContent="✓";$("progressBar").style.width=`${state.questionNumber/state.totalQuestions*100}%`;
    $("questionCount").textContent=`QUESTION ${state.questionNumber}/${state.totalQuestions}`;
    const correct=state.reveal.correct;
    [...$("answers").children].forEach((b,i)=>{b.disabled=true;if(i===correct)b.classList.add("correct");else if(i===myAnswer)b.classList.add("wrong");});
    const me=state.players.find(p=>p.id===myId), earned=state.reveal.lastScores[myId]||0;
    $("gameMessage").textContent=me&&earned>0?`Correct! You earned +${earned.toLocaleString()} points!`:myAnswer===undefined?"Time's up! No points this time.":"Not quite! Better luck next question.";
    $("revealFact").textContent="💡 "+state.reveal.fact;$("revealFact").classList.remove("hidden");
  }
  renderScoreboard();
}
function updateTimer(){
  if(!state||state.phase!=="question")return;
  const left=Math.max(0,state.question.endsAt-Date.now());
  $("timer").textContent=Math.ceil(left/1000);
  if(left<=0){clearInterval(timerInterval);$("gameMessage").textContent="Time's up! Revealing the answer…";}
}
function renderScoreboard(){
  const sorted=[...state.players].sort((a,b)=>b.score-a.score);
  $("scoreList").innerHTML="";
  sorted.forEach((p,i)=>{
    const row=document.createElement("div");row.className="score-row";
    row.innerHTML=`<span class="rank">${i===0&&p.score>0?"♛":String(i+1).padStart(2,"0")}</span><span class="score-avatar">${escapeHtml(p.name.charAt(0).toUpperCase())}</span><span class="score-name">${escapeHtml(p.name)}${p.id===myId?" (you)":""}</span><span class="score-points">${p.score.toLocaleString()}</span>`;
    $("scoreList").appendChild(row);
  });
}
function renderResults(){
  clearInterval(timerInterval);
  const rank=state.finalRanking||[];
  const winner=rank[0];
  $("winnerTitle").textContent=winner?`${winner.name} wins!`:"Battle complete!";
  $("winnerSub").textContent=winner?`${winner.score.toLocaleString()} points. What a brain!`:"Thanks for playing.";
  $("podium").innerHTML="";
  const display=rank.slice(0,3);
  const order=display.length>=3?[display[1],display[0],display[2]]:display;
  order.forEach(p=>{
    const place=rank.findIndex(x=>x.id===p.id)+1;
    const card=document.createElement("div");card.className="podium-card"+(place===1?" first":"");
    const medal=place===1?"🥇":place===2?"🥈":place===3?"🥉":"🎖️";
    card.innerHTML=`<div class="podium-medal">${medal}</div><div class="podium-name">${escapeHtml(p.name)}</div><div class="podium-score">${p.score.toLocaleString()}</div><div class="podium-place">${place===1?"CHAMPION":place===2?"2ND PLACE":place===3?"3RD PLACE":place+"TH PLACE"}</div>`;
    $("podium").appendChild(card);
  });
  if(rank.length>3){const more=document.createElement("p");more.className="muted tiny center";more.textContent=rank.slice(3).map((p,i)=>`${i+4}. ${p.name} — ${p.score.toLocaleString()} pts`).join("  •  ");$("podium").appendChild(more);}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
