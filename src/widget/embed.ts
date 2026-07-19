import type { WidgetBranding } from "../dashboardClient";

// The loader clients paste on their site:
//   <script src="https://<service-host>/b/<id>/widget/embed.js" data-key="<KEY>" async></script>
//
// Runs on the client page: draws a launcher bubble in an isolated Shadow DOM
// and lazily mounts the chat panel as an <iframe> back to this service's
// /widget/app. businessId + base origin are derived from the script's own src;
// branding is baked in (not secret); the embed KEY comes from data-key.
export function generateEmbedScript(branding: WidgetBranding): string {
  const accent = JSON.stringify(branding.accentColor);
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
    ".launcher{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);background:"+ACCENT+";display:flex;align-items:center;justify-content:center;transition:transform .15s ease;}",
    ".launcher:hover{transform:scale(1.05);}",
    ".launcher svg{width:28px;height:28px;fill:#fff;}",
    ".panel{position:fixed;bottom:92px;right:20px;width:380px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100vh - 120px);border:none;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;background:#fff;overflow:hidden;}",
    ".panel.open{display:block;}",
    "@media (max-width:480px){.panel{width:calc(100vw - 24px);right:12px;bottom:84px;height:calc(100vh - 100px);}.launcher{bottom:16px;right:16px;}}"
  ].join("");
  root.appendChild(style);

  var iframe = document.createElement("iframe");
  iframe.className = "panel";
  iframe.title = TITLE;
  iframe.src = base + "/b/" + businessId + "/widget/app?key=" + encodeURIComponent(key);
  root.appendChild(iframe);

  var btn = document.createElement("button");
  btn.className = "launcher";
  btn.setAttribute("aria-label", "Open chat");
  var openIcon = '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>';
  var closeIcon = '<svg viewBox="0 0 24 24"><path d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 4.3 19.7l-1.42-1.41L9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.29-6.3z"/></svg>';
  btn.innerHTML = openIcon;
  root.appendChild(btn);

  var open = false;
  btn.onclick = function(){
    open = !open;
    iframe.classList.toggle("open", open);
    btn.innerHTML = open ? closeIcon : openIcon;
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  };
})();`;
}
