import type { WidgetBranding } from "../dashboardClient";

interface WidgetAppParams {
  apiBase: string; // e.g. /b/3/widget (same-origin, relative to this service)
  embedKey: string;
  branding: WidgetBranding;
  quickPrompts: string[];
}

// Derives a lighter/darker variant of the business's accent colour so the UI
// gets a full palette from the single colour they pick. Computed here rather
// than with CSS color-mix() so it works regardless of browser support, and
// falls back to the input on anything unparseable.
function shade(hex: string, percent: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = parseInt(h, 16);
  // percent > 0 mixes toward white, < 0 toward black — a true tint/shade.
  // (Adding a flat amount to each channel instead turns a saturated colour
  // into neon: #0ea5e9 became #83ffff, which is unusable as a background.)
  const mix = (c: number) => (percent >= 0 ? c + (255 - c) * percent : c * (1 + percent));
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(mix((num >> 16) & 255));
  const g = clamp(mix((num >> 8) & 255));
  const b = clamp(mix(num & 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Self-contained chat UI served inside the iframe. Same-origin to this
// service's /session and /message API, so no CORS. All model output is
// rendered with textContent (never innerHTML) so a reply can't inject markup.
export function generateWidgetApp(params: WidgetAppParams): string {
  const cfg = JSON.stringify({
    apiBase: params.apiBase,
    key: params.embedKey,
    agentName: params.branding.agentName,
    greeting: params.branding.greeting,
    tagline: params.branding.tagline,
    logoUrl: params.branding.logoUrl,
    quickPrompts: params.quickPrompts.slice(0, 6),
  });
  const accent = params.branding.accentColor || "#2563eb";
  const accentDark = shade(accent, -0.14); // gradient end / text on tint
  const accentSoft = shade(accent, 0.62); // chip borders
  const accentTint = shade(accent, 0.88); // pale backgrounds + focus ring

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat</title>
<style>
  :root{
    --accent:${accent};
    --accent-dark:${accentDark};
    --accent-soft:${accentSoft};
    --accent-tint:${accentTint};
    --ink:#0f172a;
    --muted:#64748b;
    --line:#e6e8ec;
    --bg:#f6f7f9;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;height:100%;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
    background:#fff;color:var(--ink);
    -webkit-font-smoothing:antialiased;
  }
  #app{display:flex;flex-direction:column;height:100vh;overflow:hidden;}

  /* ── Header ─────────────────────────────────────────── */
  .accentbar{height:3px;flex:0 0 auto;background:linear-gradient(90deg,var(--accent),var(--accent-dark));}
  header{
    flex:0 0 auto;display:flex;align-items:center;gap:12px;
    padding:14px 16px;background:#fff;border-bottom:1px solid var(--line);
  }
  .brand{display:flex;align-items:center;gap:11px;min-width:0;flex:1;}
  .logo{
    width:38px;height:38px;border-radius:11px;flex:0 0 auto;overflow:hidden;
    display:flex;align-items:center;justify-content:center;
    background:var(--accent-tint);color:var(--accent-dark);
    font-weight:700;font-size:16px;letter-spacing:-.02em;
  }
  .logo img{width:100%;height:100%;object-fit:contain;background:#fff;}
  .titles{min-width:0;}
  .name{font-weight:650;font-size:15px;line-height:1.25;letter-spacing:-.01em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .tag{font-size:12px;color:var(--muted);line-height:1.35;display:flex;align-items:center;gap:5px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex:0 0 auto;}
  .iconbtn{
    border:none;background:transparent;color:var(--muted);cursor:pointer;
    width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;
    transition:background .15s ease,color .15s ease;flex:0 0 auto;
  }
  .iconbtn:hover{background:#f1f3f5;color:var(--ink);}
  .iconbtn svg{width:17px;height:17px;}

  /* ── Message log ────────────────────────────────────── */
  #log{
    flex:1 1 auto;overflow-y:auto;padding:18px 16px 8px;background:var(--bg);
    display:flex;flex-direction:column;gap:4px;
  }
  #log::-webkit-scrollbar{width:8px;}
  #log::-webkit-scrollbar-thumb{background:#d7dbe0;border-radius:99px;border:2px solid var(--bg);}
  #log::-webkit-scrollbar-track{background:transparent;}

  .row{display:flex;gap:8px;align-items:flex-end;margin-bottom:10px;animation:pop .28s cubic-bezier(.2,.8,.3,1);}
  .row.me{flex-direction:row-reverse;}
  @keyframes pop{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

  .av{
    width:26px;height:26px;border-radius:50%;flex:0 0 auto;overflow:hidden;
    display:flex;align-items:center;justify-content:center;
    background:var(--accent-tint);color:var(--accent-dark);font-size:11px;font-weight:700;
  }
  .av img{width:100%;height:100%;object-fit:contain;background:#fff;}
  .row.me .av{display:none;}

  .stack{display:flex;flex-direction:column;max-width:78%;min-width:0;}
  .row.me .stack{align-items:flex-end;}

  .msg{
    padding:10px 13px;font-size:14px;line-height:1.5;white-space:pre-wrap;
    word-wrap:break-word;overflow-wrap:anywhere;
  }
  .bot .msg{
    background:#fff;color:var(--ink);border:1px solid var(--line);
    border-radius:15px 15px 15px 5px;box-shadow:0 1px 2px rgba(16,24,40,.04);
  }
  .me .msg{
    background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:#fff;
    border-radius:15px 15px 5px 15px;box-shadow:0 2px 6px rgba(16,24,40,.10);
  }
  .time{font-size:10px;color:#94a3b8;margin:4px 4px 0;}

  /* ── Quick prompts ──────────────────────────────────── */
  #chips{display:flex;flex-wrap:wrap;gap:7px;padding:2px 0 10px 34px;}
  .chip{
    border:1px solid var(--accent-soft);background:#fff;color:var(--accent-dark);
    font:inherit;font-size:13px;font-weight:550;padding:8px 13px;border-radius:999px;cursor:pointer;
    transition:transform .12s ease,background .15s ease,box-shadow .15s ease;
    box-shadow:0 1px 2px rgba(16,24,40,.04);
  }
  .chip:hover{background:var(--accent-tint);transform:translateY(-1px);box-shadow:0 3px 8px rgba(16,24,40,.09);}
  .chip:active{transform:translateY(0);}

  /* ── Typing ─────────────────────────────────────────── */
  .typing{display:flex;gap:4px;padding:13px;background:#fff;border:1px solid var(--line);
    border-radius:15px 15px 15px 5px;}
  .typing i{width:6px;height:6px;border-radius:50%;background:#c3c9d2;animation:blink 1.3s infinite;}
  .typing i:nth-child(2){animation-delay:.18s;}
  .typing i:nth-child(3){animation-delay:.36s;}
  @keyframes blink{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-3px);}}

  /* ── Composer ───────────────────────────────────────── */
  footer{flex:0 0 auto;background:#fff;border-top:1px solid var(--line);padding:10px 12px 8px;}
  .box{
    display:flex;align-items:flex-end;gap:8px;background:#fff;
    border:1.5px solid var(--line);border-radius:14px;padding:6px 6px 6px 12px;
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  .box:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint);}
  textarea{
    flex:1;resize:none;border:none;outline:none;font:inherit;font-size:14px;line-height:1.45;
    padding:6px 0;max-height:110px;background:transparent;color:var(--ink);
  }
  textarea::placeholder{color:#9aa3af;}
  #send{
    flex:0 0 auto;width:34px;height:34px;border-radius:10px;border:none;cursor:pointer;
    background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:#fff;
    display:flex;align-items:center;justify-content:center;
    transition:opacity .15s ease,transform .12s ease;
  }
  #send:hover:not(:disabled){transform:translateY(-1px);}
  #send:disabled{opacity:.4;cursor:default;}
  #send svg{width:16px;height:16px;}
  .legal{text-align:center;font-size:10.5px;color:#a0a8b4;margin-top:7px;}

  @media (max-width:420px){ .stack{max-width:85%;} }
</style>
</head>
<body>
<div id="app">
  <div class="accentbar"></div>
  <header>
    <div class="brand">
      <div class="logo" id="brandLogo"></div>
      <div class="titles">
        <div class="name" id="brandName"></div>
        <div class="tag" id="brandTag"></div>
      </div>
    </div>
    <button class="iconbtn" id="close" aria-label="Close chat" title="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>
  </header>

  <div id="log" aria-live="polite"></div>

  <footer>
    <div class="box">
      <textarea id="input" rows="1" placeholder="Type your message…" autocomplete="off"></textarea>
      <button id="send" type="button" aria-label="Send message" disabled>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>
      </button>
    </div>
    <div class="legal" id="legal"></div>
  </footer>
</div>
<script>
(function(){
  var CFG = ${cfg};
  var log = document.getElementById("log");
  var input = document.getElementById("input");
  var send = document.getElementById("send");
  var chipsEl = null;
  var conversationId = null, token = null, busy = false, started = false;

  /* Branding */
  document.getElementById("brandName").textContent = CFG.agentName;
  var tagEl = document.getElementById("brandTag");
  if (CFG.tagline) {
    var d = document.createElement("span"); d.className = "dot";
    tagEl.appendChild(d);
    tagEl.appendChild(document.createTextNode(CFG.tagline));
  } else {
    tagEl.style.display = "none";
  }
  document.getElementById("legal").textContent = "AI assistant • responses may need confirming";
  function fillAvatar(el, size){
    if (CFG.logoUrl) {
      var img = document.createElement("img");
      img.src = CFG.logoUrl; img.alt = "";
      img.onerror = function(){ el.textContent = (CFG.agentName||"A").charAt(0).toUpperCase(); };
      el.appendChild(img);
    } else {
      el.textContent = (CFG.agentName||"A").charAt(0).toUpperCase();
    }
  }
  fillAvatar(document.getElementById("brandLogo"));

  function now(){
    try { return new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}); }
    catch(e){ return ""; }
  }

  function add(text, who){
    var row = document.createElement("div");
    row.className = "row " + (who === "me" ? "me" : "bot");
    if (who !== "me") {
      var av = document.createElement("div"); av.className = "av";
      fillAvatar(av); row.appendChild(av);
    }
    var stack = document.createElement("div"); stack.className = "stack";
    var msg = document.createElement("div"); msg.className = "msg";
    msg.textContent = text;                       /* never innerHTML */
    var t = document.createElement("div"); t.className = "time"; t.textContent = now();
    stack.appendChild(msg); stack.appendChild(t);
    row.appendChild(stack);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function showChips(){
    if (!CFG.quickPrompts || !CFG.quickPrompts.length) return;
    chipsEl = document.createElement("div");
    chipsEl.id = "chips";
    CFG.quickPrompts.forEach(function(p){
      var b = document.createElement("button");
      b.className = "chip"; b.type = "button"; b.textContent = p;
      b.onclick = function(){ sendMessage(p); };
      chipsEl.appendChild(b);
    });
    log.appendChild(chipsEl);
    log.scrollTop = log.scrollHeight;
  }
  function hideChips(){
    if (chipsEl && chipsEl.parentNode) { chipsEl.parentNode.removeChild(chipsEl); chipsEl = null; }
  }

  function typing(on){
    var ex = document.getElementById("typingRow");
    if (on && !ex) {
      var row = document.createElement("div");
      row.className = "row bot"; row.id = "typingRow";
      var av = document.createElement("div"); av.className = "av"; fillAvatar(av);
      var t = document.createElement("div"); t.className = "typing";
      t.appendChild(document.createElement("i"));
      t.appendChild(document.createElement("i"));
      t.appendChild(document.createElement("i"));
      row.appendChild(av); row.appendChild(t);
      log.appendChild(row); log.scrollTop = log.scrollHeight;
    } else if (!on && ex) { ex.parentNode.removeChild(ex); }
  }

  function setBusy(b){ busy = b; syncSend(); }
  function syncSend(){ send.disabled = busy || !input.value.trim() || !conversationId; }

  /* Start the session */
  fetch(CFG.apiBase + "/session", {
    method:"POST", headers:{"Content-Type":"application/json","X-Widget-Key":CFG.key}, body:"{}"
  }).then(function(r){ return r.json(); }).then(function(d){
    conversationId = d.conversationId; token = d.token;
    add(d.greeting || CFG.greeting, "bot");
    showChips();
    syncSend();
  }).catch(function(){ add("Sorry, chat is unavailable right now.", "bot"); });

  function sendMessage(preset){
    var text = (preset != null ? preset : input.value).trim();
    if (!text || busy || !conversationId) return;
    if (!started) { started = true; hideChips(); }
    add(text, "me");
    if (preset == null) { input.value = ""; input.style.height = "auto"; }
    setBusy(true); typing(true);
    fetch(CFG.apiBase + "/message", {
      method:"POST", headers:{"Content-Type":"application/json","X-Widget-Key":CFG.key},
      body: JSON.stringify({conversationId:conversationId, token:token, message:text})
    }).then(function(r){ return r.json(); }).then(function(d){
      typing(false); setBusy(false);
      add(d.reply || "Sorry, I didn't catch that. Could you rephrase?", "bot");
    }).catch(function(){
      typing(false); setBusy(false);
      add("Sorry, something went wrong. Please try again.", "bot");
    });
  }

  send.onclick = function(){ sendMessage(); };
  input.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener("input", function(){
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
    syncSend();
  });

  /* The panel is an iframe, so closing is the parent's job (embed.js). */
  document.getElementById("close").onclick = function(){
    try { window.parent.postMessage({ type: "aicw-close" }, "*"); } catch(e){}
  };
})();
</script>
</body>
</html>`;
}
