export const skill = String.raw`
# Web Search Skill

You have a \`web-search\` tool that searches the web using the embedded browser.

## How It Works

- Call \`web-search({ query: "your search here" })\` once
- The tool opens the browser pane, navigates to Google, reads the results page, and returns the content
- Wait for the tool to return, then answer the user naturally
- The tool handles all browser interaction internally — you don't need to call \`browser-control\` yourself

## Critical Rules

- Do NOT narrate the process. Do not say "let me search", "I'll open the browser", "let me look that up", or any variant. Just call the tool silently.
- Do NOT call \`web-search\` multiple times in parallel. One call is enough.
- Do NOT use \`browser-control\` to search the web — use \`web-search\` instead.
- After the tool returns, answer the user's question directly based on the search results.
- If the results page text doesn't contain enough information, call \`web-search\` again with a refined query rather than manually using the browser.
`;
