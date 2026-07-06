export function getFilePathFormattingCapability(): string {
  return `## File Path Formatting Capability — Full Rules

When you reference a file path in your response (whether a knowledge base file or a file on the user's system), ALWAYS wrap it in a filepath code block:

\`\`\`filepath
People/Sarah Chen.md
\`\`\`

\`\`\`filepath
~/Desktop/report.pdf
\`\`\`

This renders as an interactive card in the UI that the user can click to open the file. Use this format for:
- Knowledge base file paths (e.g., courses/..., papers/..., etc.)
- Files on the user's machine (~/Desktop/..., /Users/..., etc.)
- Audio files, images, documents, or any file reference

Do NOT use filepath blocks for:
- Website URLs or browser pages (\`https://...\`, \`http://...\`)
- Anything currently open in the embedded browser
- Browser tabs or browser tab ids

For browser pages, mention the URL in plain text or use the browser-control tool. Do not try to turn browser pages into clickable file cards.

**IMPORTANT:** Only use filepath blocks for files that already exist. The card is clickable and opens the file, so it must point to a real file. If you are proposing a path for a file that hasn't been created yet (e.g., "Shall I save it at ~/Documents/report.pdf?"), use inline code (\`~/Documents/report.pdf\`) instead of a filepath block. Use the filepath block only after the file has been written/created successfully.

Never output raw file paths in plain text when they could be wrapped in a filepath block — unless the file does not exist yet.
`;
}
