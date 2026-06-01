export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

const DDG_HTML = "https://html.duckduckgo.com/html";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function searchDuckDuckGo(
  query: string,
  maxResults: number = 10,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  // Step 1: Get vqd token from main DDG page
  const vqd = await getVqdToken(query, signal);
  if (!vqd) {
    throw new Error("Failed to obtain DuckDuckGo vqd token");
  }

  // Step 2: Use vqd token to get search results
  const params = new URLSearchParams();
  params.append("q", query);
  params.append("vqd", vqd);

  const response = await fetch(DDG_HTML, {
    method: "POST",
    signal,
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml",
    },
    body: params,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`);
  }

  const html = await response.text();
  return parseDdgResults(html, maxResults);
}

async function getVqdToken(query: string, signal?: AbortSignal): Promise<string | null> {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) return null;

  const html = await response.text();

  // Try multiple patterns for vqd extraction
  const patterns = [
    /vqd=([^"&]+)/,
    /"vqd":"([^"]+)"/,
    /vqd['"]?\s*[:=]\s*['"]([^'"]+)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function parseDdgResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  // Split on result__body class (may have other classes before it)
  const resultBlocks = html.split(/<div[^>]*class="[^"]*\bresult__body\b[^"]*"[^>]*>/);

  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (!urlMatch) continue;

    let url = urlMatch[1];
    const redirectMatch = url.match(/uddg=([^&]+)/);
    if (redirectMatch) {
      url = decodeURIComponent(redirectMatch[1]);
    }

    const title = titleMatch
      ? stripHtml(titleMatch[1]).trim()
      : `Result ${i}`;

    const snippet = snippetMatch
      ? stripHtml(snippetMatch[1]).trim()
      : "";

    if (url) {
      results.push({ url, title, snippet });
    }
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .trim();
}
