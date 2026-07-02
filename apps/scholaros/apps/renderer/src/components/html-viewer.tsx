"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

const HASH_NAV_SCRIPT = `<script>
document.addEventListener("click",function(e){
  var a=e.target.closest("a");
  if(!a||!a.getAttribute("href"))return;
  var h=a.getAttribute("href");
  if(h[0]==="#"){
    e.preventDefault();
    var id=h.slice(1);
    var el=document.getElementById(id)||document.getElementsByName(id)[0];
    if(el)el.scrollIntoView({behavior:"smooth"});
  }
});
<\/script>`;

function injectHashNav(html: string): string {
  const headEnd = html.indexOf("</head>");
  if (headEnd !== -1) {
    return html.slice(0, headEnd) + HASH_NAV_SCRIPT + html.slice(headEnd);
  }
  // No <head> — inject before <body> or at the start
  const bodyStart = html.indexOf("<body");
  if (bodyStart !== -1) {
    const bodyClose = html.indexOf(">", bodyStart);
    return html.slice(0, bodyClose + 1) + HASH_NAV_SCRIPT + html.slice(bodyClose + 1);
  }
  // No <body> either — inject at the very start (browser will parse it)
  return HASH_NAV_SCRIPT + html;
}

export function HtmlViewer({ htmlContent, fileName }: { htmlContent: string; fileName?: string }) {
  const [key, setKey] = React.useState(0);
  const injectedHtml = React.useMemo(() => injectHashNav(htmlContent), [htmlContent]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-center gap-3 border-b border-border px-4 py-1.5 text-sm text-muted-foreground shrink-0">
        <span className="text-xs font-medium">{fileName ?? "HTML Preview"}</span>
        <span className="w-px h-4 bg-border" />
        <button
          type="button"
          onClick={() => setKey((k) => k + 1)}
          className="hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        <iframe
          key={key}
          srcDoc={injectedHtml}
          className="size-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="HTML preview"
        />
      </div>
    </div>
  );
}
