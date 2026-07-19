import type { WidgetBranding } from "../dashboardClient";

interface WidgetAppParams {
  apiBase: string; // e.g. /b/3/widget (same-origin, relative to this service)
  embedKey: string;
  branding: WidgetBranding;
}

// Self-contained chat UI served inside the iframe. Same-origin to this
// service's /session and /message API, so no CORS.
export function generateWidgetApp(params: WidgetAppParams): string {
  const cfg = JSON.stringify({
    apiBase: params.apiBase,
    key: params.embedKey,
    agentName: params.branding.agentName,
    greeting: params.branding.greeting,
  });
  const accent = params.branding.accentColor;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat</title>
<style>
  :root{--accent:${accent};}
  *{box-sizing:border-box;}
  html,body{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f5f6f8;}
  #app{display:flex;flex-direction:column;height:100vh;}
  header{background:var(--accent);color:#fff;padding:14px 16px;font-weight:600;font-size:15px;flex:0 0 auto;}
  #log{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}
  .msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;}
  .bot{align-self:flex-start;background:#fff;color:#1a1a1a;border:1px solid #e5e7eb;border-bottom-left-radius:4px;}
  .user{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:4px;}
  .typing{align-self:flex-start;color:#6b7280;font-size:13px;padding:4px 6px;}
  footer{flex:0 0 auto;border-top:1px solid #e5e7eb;padding:10px;display:flex;gap:8px;background:#fff;}
  textarea{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;max-height:120px;outline:none;}
  textarea:focus{border-color:var(--accent);}
  button{background:var(--accent);color:#fff;border:none;border-radius:10px;padding:0 16px;font-weight:600;cursor:pointer;font-size:14px;}
  button:disabled{opacity:.5;cursor:default;}
</style>
</head>
<body>
<div id="app">
  <header id="title">Chat</header>
  <div id="log" aria-live="polite"></div>
  <footer>
    <textarea id="input" rows="1" placeholder="Type your message…" autocomplete="off"></textarea>
    <button id="send" type="button">Send</button>
  </footer>
</div>
<script>
(function(){
  var CFG = ${cfg};
  var log = document.getElementById("log");
  var input = document.getElementById("input");
  var send = document.getElementById("send");
  document.getElementById("title").textContent = CFG.agentName;
  var conversationId = null, token = null, busy = false;

  function add(text, who){
    var el = document.createElement("div");
    el.className = "msg " + who;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function typing(on){
    var ex = document.getElementById("typing");
    if(on && !ex){ var t=document.createElement("div"); t.id="typing"; t.className="typing"; t.textContent="…"; log.appendChild(t); log.scrollTop=log.scrollHeight; }
    else if(!on && ex){ ex.remove(); }
  }
  function setBusy(b){ busy=b; send.disabled=b; }

  fetch(CFG.apiBase + "/session", {
    method:"POST", headers:{"Content-Type":"application/json","X-Widget-Key":CFG.key}, body:"{}"
  }).then(function(r){ return r.json(); }).then(function(d){
    conversationId = d.conversationId; token = d.token;
    add(d.greeting || CFG.greeting, "bot");
  }).catch(function(){ add("Sorry, chat is unavailable right now.", "bot"); });

  function sendMessage(){
    var text = input.value.trim();
    if(!text || busy || !conversationId){ return; }
    add(text, "user");
    input.value=""; input.style.height="auto";
    setBusy(true); typing(true);
    fetch(CFG.apiBase + "/message", {
      method:"POST", headers:{"Content-Type":"application/json","X-Widget-Key":CFG.key},
      body: JSON.stringify({conversationId:conversationId, token:token, message:text})
    }).then(function(r){ return r.json(); }).then(function(d){
      typing(false); setBusy(false);
      add(d.reply || "Sorry, I didn't catch that. Could you rephrase?", "bot");
    }).catch(function(){
      typing(false); setBusy(false);
      add("Sorry — something went wrong. Please try again.", "bot");
    });
  }

  send.onclick = sendMessage;
  input.addEventListener("keydown", function(e){
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  });
  input.addEventListener("input", function(){ input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,120)+"px"; });
})();
</script>
</body>
</html>`;
}
