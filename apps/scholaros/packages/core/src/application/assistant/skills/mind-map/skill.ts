export const skill = String.raw`
# Mind Map Generator

**Load this skill** when the user asks to create a mind map, concept map, visual diagram, or brainstorm map from their course materials or notes. Produces a visual hierarchical map for revision and big-picture understanding.

## When to Load Instead

| User says | Load this |
|---|---|
| "make a mind map of X" | mind-map |
| "concept map for X" | mind-map |
| "visualize the topics in X" | mind-map |
| "diagram the relationships in X" | mind-map |
| "brainstorm map" | mind-map |
| "revision guide for X" | revision-guide (includes diagrams within a full guide) |
| "flowchart for X" | revision-guide or web-artifacts-builder |

## Output Options (in priority order)

### 1. Inline Mermaid (preferred for most cases)
Render the mind map directly in the chat as a Mermaid code block:

\`\`\`mermaid
mindmap
  root((Biology))
    Cell Biology
      Prokaryotic vs Eukaryotic
      Organelles
        Nucleus
        Mitochondria
        Ribosomes
    Genetics
      DNA Structure
        Double helix
        Base pairs
      Gene Expression
        Transcription
        Translation
    Ecology
      Food Chains
      Nutrient Cycles
\`\`\`

The UI renders Mermaid blocks automatically — no extra work needed.

### 2. Self-contained HTML artifact (for complex maps with styling/interactivity)
Use the web-artifacts-builder for maps that need:
- Clickable nodes that expand/collapse
- Custom colors and icons per branch
- Multiple root nodes
- Integration with other UI elements

## Workflow

### Phase 1: Identify the source material
1. Ask which course or topic the mind map should cover (if not specified)
2. Identify source material:
   - Course folder under \`courses/\` in the workspace
   - Specific notes or lecture pages the user mentions
   - Concept pages from the knowledge base
   - Or the user can paste content directly

### Phase 2: Read and extract structure
1. Read relevant course materials using \`workspace-grep\` and \`workspace-readFile\`
2. Extract the hierarchical structure:
   - **Central topic** — the root of the mind map (the course name or main subject)
   - **Major branches** — main subtopics (2-7 branches ideally)
   - **Sub-branches** — specific concepts within each branch
   - **Leaves** — details, definitions, key facts, examples
3. Identify cross-branch relationships (optional, for advanced maps)

### Phase 3: Generate the mind map
Structure the content using Mermaid \`mindmap\` syntax:

\`\`\`
mindmap
  root((Central Topic))
    Branch 1
      Sub-branch A
        Detail 1
        Detail 2
      Sub-branch B
    Branch 2
      Sub-branch C
    Branch 3
\`\`\`

**Mermaid mindmap syntax rules:**
- Use \`root((text))\` for the central node (round nodes)
- Use \`((text))\` for sub-nodes (circles) — useful for key concepts
- Use \`[text]\` for square/bracket nodes — good for details
- Indentation determines hierarchy (2 spaces per level)
- Keep node text short (1-5 words per node)
- Max 3-4 levels deep for readability
- Max 20-30 total nodes per map
- Use \`icon:\` prefix to add FontAwesome icons to nodes (e.g., \`icon:fa-book Reading\`)

### Phase 4: Render and deliver
1. Present the Mermaid code block in the chat
2. Give a brief tour: "The main branches are X, Y, and Z. Your strongest area is X, and Y has the most detail."
3. Offer follow-ups:
   - "Want me to expand any branch?"
   - "Should I create a revision guide with this material?"
   - "Want me to generate flashcards for the topics in this map?"

### Phase 5: Save as a file (if the user wants to keep it)
When the user says "save it" or the mind map is meant to be kept, save it to the workspace:

1. Create a self-contained HTML file with Mermaid CDN rendering:
   - File path: \`mindmaps/<topic>-mindmap.html\` (relative to workspace root)
   - The HTML file embeds the full Mermaid mindmap syntax and includes the Mermaid CDN script so it renders as an SVG diagram when opened in a browser
   - Use \`workspace-writeFile\` with \`mkdirp: true\`

2. HTML template for the file:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mind Map — Topic Name</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true, theme: "default", securityLevel: "loose" });</script>
  <style>
    body { background: #fff; display: flex; justify-content: center; padding: 2rem; margin: 0; font-family: sans-serif; }
    .mermaid { max-width: 100%; }
  </style>
</head>
<body>
  <pre class="mermaid">
mindmap
  root((Topic))
    Branch 1
      Sub A
      Sub B
    Branch 2
      Sub C
      Sub D
  </pre>
</body>
</html>
\`\`\`

3. Confirm to the user: "Saved to \`mindmaps/<topic>-mindmap.html\`. Open it in your browser to view and right-click → Save as image if you want a PNG."

4. If the user wants a specific format (PNG, SVG), explain:
   - Open the saved HTML file in a browser, then right-click the diagram → Save as image (PNG)
   - Or print to PDF from the browser
   - The Mermaid diagram renders as scalable SVG in the browser, so screenshot quality is excellent

## Multi-Source Maps

When the user asks to combine multiple courses or sources:

1. Read all source materials
2. Identify common themes and connections
3. Create a unified mind map with cross-branch links
4. Note which source each branch comes from

## Example

User: "Create a mind map of CS50 Week 3 - Algorithms"

Agent reads the lecture notes and concept pages, then:

Here's a mind map of Algorithms (Week 3):

\`\`\`mermaid
mindmap
  root((Algorithms))
    Sorting
      Selection Sort
        O(n²)
        In-place
      Bubble Sort
        O(n²)
        Stable
      Merge Sort
        O(n log n)
        Stable
        Divide and Conquer
      Quick Sort
        O(n log n) avg
        O(n²) worst
        In-place
    Searching
      Linear Search
        O(n)
      Binary Search
        O(log n)
        Sorted array only
    Analysis
      Big O
        Upper bound
      Big Omega
        Lower bound
      Big Theta
        Tight bound
\`\`\`

**The main branches are Sorting, Searching, and Analysis.** You've already studied Merge Sort in detail — your weak spot is Quick Sort's worst-case behavior. Want me to expand that branch or generate flashcards?

## Pitfalls to Avoid
- Don't make the map too deep (max 3-4 levels)
- Don't use long text in nodes — keep it to keywords
- Don't put every single fact — mind maps are for big-picture structure
- Don't render a Mermaid block with 50+ nodes — split into multiple maps
- For large topics, create one overview map + separate detail maps per branch
`;
