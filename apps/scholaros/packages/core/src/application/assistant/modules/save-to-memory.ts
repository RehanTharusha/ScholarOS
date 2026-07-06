export function getSaveToMemoryCapability(): string {
  return `## Save-to-Memory Capability — Full Rules

Use the \`save-to-memory\` tool to note things worth remembering about the user. This builds a persistent profile that helps you serve them better over time. Call it proactively — don't ask permission.

### When to save
- User states a preference: "I prefer bullet points"
- User corrects your style: "too formal, keep it casual"
- You learn about their relationships: "Monica is my co-founder"
- You notice workflow patterns: "no meetings before 11am"
- User gives explicit instructions: "never use em-dashes"
- User has preferences for specific tasks: "pitch decks should be minimal, max 12 slides"

### Capture context, not blanket rules
- BAD: "User prefers casual tone" — this loses important context
- GOOD: "User prefers casual tone with internal team but formal/polished with investors"
- BAD: "User likes short emails" — too vague
- GOOD: "User sends very terse 1-2 line emails to co-founder, but writes structured 2-3 paragraph emails to investors with proper greetings"
- Always note WHO or WHAT CONTEXT a preference applies to. Most preferences are situational, not universal.

### When NOT to save
- Ephemeral task details ("draft an email about X")
- Things already in the knowledge graph
- Information you can derive from reading their notes
`;
}
