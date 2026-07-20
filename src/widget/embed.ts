import type { WidgetBranding } from "../dashboardClient";

// The loader clients paste on their site:
//   <script src="https://<service-host>/b/<id>/widget/embed.js" data-key="<KEY>" async></script>
//
// Runs on the client page: draws a launcher bubble in an isolated Shadow DOM
// and mounts the chat panel as an <iframe> back to this service's /widget/app.
// businessId + base origin are derived from the script's own src; branding is
// baked in (not secret); the embed KEY comes from data-key.
//
// The iframe's src is set on FIRST OPEN, not page load — otherwise every page
// view would start a conversation server-side before anyone clicked.
export function generateEmbedScript(branding: WidgetBranding): string {
  const accent = JSON.stringify(branding.accentColor || "#2563eb");
  const title = JSON.stringify(branding.agentName);

  return `(function(){
  var script = document.currentScript;
  if(!script){ return; }
  var m = script.src.match(/^(https?:\\/\\/[^/]+)\\/b\\/(\\d+)\\/widget\\/embed\\.js/);
  if(!m){ return; }
  var base = m[1], businessId = m[2];
  var key = script.getAttribute("data-key") || "";
  var ACCENT = ${accent};
  var TITLE = ${title};
  if(window.__aiChatWidgetLoaded){ return; }
  window.__aiChatWidgetLoaded = true;

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:0;right:0;z-index:2147483647;";
  var root = host.attachShadow({mode:"open"});
  document.body.appendChild(host);

  var style = document.createElement("style");
  style.textContent = [
    ".launcher{position:fixed;bottom:22px;right:22px;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;",
      "background:" + ACCENT + ";display:flex;align-items:center;justify-content:center;",
      "box-shadow:0 6px 20px rgba(16,24,40,.22),0 2px 6px rgba(16,24,40,.12);",
      "transition:transform .18s cubic-bezier(.2,.8,.3,1),box-shadow .18s ease;}",
    ".launcher:hover{transform:scale(1.06);box-shadow:0 10px 28px rgba(16,24,40,.28),0 3px 8px rgba(16,24,40,.16);}",
    ".launcher:active{transform:scale(.97);}",
    ".launcher svg{width:26px;height:26px;fill:#fff;transition:transform .2s ease;}",
    ".panel{position:fixed;bottom:92px;right:22px;width:392px;max-width:calc(100vw - 32px);",
      "height:620px;max-height:calc(100vh - 130px);border:none;border-radius:18px;background:#fff;",
      "box-shadow:0 24px 60px rgba(16,24,40,.24),0 4px 12px rgba(16,24,40,.10);overflow:hidden;",
      "opacity:0;visibility:hidden;transform:translateY(14px) scale(.98);transform-origin:bottom right;",
      "transition:opacity .2s ease,transform .22s cubic-bezier(.2,.8,.3,1),visibility .22s;}",
    ".panel.open{opacity:1;visibility:visible;transform:none;}",
    "@media (max-width:480px){",
      ".panel{width:calc(100vw - 20px);right:10px;bottom:88px;height:calc(100vh - 108px);border-radius:16px;}",
      ".launcher{bottom:16px;right:16px;width:54px;height:54px;}",
    "}"
  ].join("");
  root.appendChild(style);

  var iframe = document.createElement("iframe");
  iframe.className = "panel";
  iframe.title = TITLE;
  iframe.setAttribute("allow", "clipboard-write");
  root.appendChild(iframe);

  var btn = document.createElement("button");
  btn.className = "launcher";
  btn.setAttribute("aria-label", "Open chat");
  var openIcon = '<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 5.9 2 10.7c0 2.7 1.4 5.1 3.7 6.7-.1 1-.6 2.4-1.6 3.5 0 0 2.7-.3 4.8-2.1.9.2 1.9.4 3.1.4 5.5 0 10-3.9 10-8.5S17.5 2 12 2z"/></svg>';
  var closeIcon = '<svg viewBox="0 0 24 24"><path d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 4.3 19.7l-1.42-1.41L9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.29-6.3z"/></svg>';
  btn.innerHTML = openIcon;
  root.appendChild(btn);

  var open = false, loaded = false;
  function setOpen(next){
    open = next;
    if (open && !loaded) {
      iframe.src = base + "/b/" + businessId + "/widget/app?key=" + encodeURIComponent(key);
      loaded = true;
    }
    iframe.classList.toggle("open", open);
    btn.innerHTML = open ? closeIcon : openIcon;
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  }
  btn.onclick = function(){ setOpen(!open); };

  // The panel's own header close button lives inside the iframe, so it asks
  // the parent (here) to close. Only trust messages from this service's origin.
  window.addEventListener("message", function(e){
    if (e.origin !== base) { return; }
    if (e.data && e.data.type === "aicw-close") { setOpen(false); }
  });
})();`;
}
