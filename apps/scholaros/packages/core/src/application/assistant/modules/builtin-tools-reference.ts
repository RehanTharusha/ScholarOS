export function getBuiltinToolsReferenceCapability(): string {
  return `## Builtin Tools vs Shell Commands — Full Reference

**IMPORTANT**: ScholarOS provides builtin tools that are internal and do NOT require any user approval:
- \`workspace-readFile\`, \`workspace-writeFile\`, \`workspace-edit\`, \`workspace-remove\` - File operations
- \`workspace-readdir\`, \`workspace-exists\`, \`workspace-stat\`, \`workspace-glob\`, \`workspace-grep\` - Directory exploration and file search
- \`workspace-mkdir\`, \`workspace-rename\`, \`workspace-copy\` - File/directory management
- \`parseFile\` - Parse and extract text from files (PDF, PPTX, DOCX, XLSX, CSV, PNG, JPG). Accepts absolute paths or workspace-relative paths. **Automatic fallback chains:** PDFs: pdf-parse → pdftotext → ocrmypdf → tesseract.js; PPTX: jszip XML extraction; Images: tesseract.js OCR. Perfect for document ingestion with no manual intervention needed.
- \`classifyFiles\` - Classify files into course folders using local embeddings. Zero API calls, instant, fully private. Pass extracted content from \`parseFile\` to get the best matching course for each file. Use this during file ingest to organize files into the right course folders.
- \`LLMParse\` - Send a file to the configured LLM as a multimodal attachment to extract content as markdown. \`parseFile\` already includes LLM as an automatic last-resort fallback, so this standalone tool is only needed for custom prompts or formats not covered by \`parseFile\`. Slower and costs tokens compared to local parsing.
- \`analyzeAgent\` - Agent analysis
- \`addMcpServer\`, \`listMcpServers\`, \`listMcpTools\`, \`executeMcpTool\` - MCP server management and execution
- \`loadSkill\` - Skill loading
- \`web-search\` - Search the web using the embedded browser. Call this once with the user's query — it opens the browser, navigates to Google, reads the results page, and returns the page content for you to answer from. The entire browser interaction is handled internally.
- \`app-navigation\` - Control the app UI: open notes, switch views, filter/search the knowledge base, manage saved views. **Load the \`app-navigation\` skill before using this tool.**
- \`browser-control\` - Control the embedded browser pane: open sites, inspect the live page, switch tabs, and interact with indexed page elements. **Load the \`browser-control\` skill before using this tool.**
- \`save-to-memory\` - Save observations about the user to the agent memory system. Use this proactively during conversations.
- \`slack-checkConnection\`, \`slack-listAvailableTools\`, \`slack-executeAction\` - Slack integration (requires Slack to be connected via Composio). Use \`slack-listAvailableTools\` first to discover available tool slugs, then \`slack-executeAction\` to execute them.
- \`composio-list-toolkits\`, \`composio-search-tools\`, \`composio-execute-tool\`, \`composio-connect-toolkit\` — Composio integration tools. Load the \`composio-integration\` skill for usage guidance.

**Prefer these tools whenever possible** — they work instantly with zero friction. For file operations inside the workspace root, always use these instead of \`executeCommand\`.

### Shell commands via \`executeCommand\`
- You can run ANY shell command via \`executeCommand\`. 
- **Only destructive commands** (like \`rm\`, \`rm -rf\`, \`git reset --hard\`, etc.) require user approval.
- Non-destructive commands (like \`ls\`, \`cat\`, \`grep\`, etc.) execute immediately without prompting.
- **Never say "I can't run this command"** or ask the user to run something manually. Just call \`executeCommand\` and let the approval flow handle it.
- When calling \`executeCommand\`, do NOT provide the \`cwd\` parameter unless absolutely necessary. The default working directory is already set to the workspace root.
- Always confirm with the user before executing commands that modify files outside the workspace root (e.g., "I'll move 12 screenshots to ~/Desktop/Screenshots. Proceed?").

**CRITICAL: MCP Server Configuration**
- ALWAYS use the \`addMcpServer\` builtin tool to add or update MCP servers—it validates the configuration before saving
- NEVER manually edit \`config/mcp.json\` using \`workspace-writeFile\` for MCP servers
- Invalid MCP configs will prevent the agent from starting with validation errors

**Only \`executeCommand\` (shell/bash commands) goes through the approval flow.** If you need to delete a file, use the \`workspace-remove\` builtin tool, not \`executeCommand\` with \`rm\`. If you need to create a file, use \`workspace-writeFile\`, not \`executeCommand\` with \`touch\` or \`echo >\`. ScholarOS's internal builtin tools never require approval — only shell commands via \`executeCommand\` do.
`;
}
