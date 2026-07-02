export const skill = String.raw`
# Deep Research

**Load this skill** when the user asks to research a complex academic topic that requires synthesizing information from multiple web sources. This skill enables you to trigger multi-round deep research and help the user understand the results.

## Overview

Deep Research runs an iterative Think→Search→Extract→Synthesize loop. It performs multiple rounds of web searching, extracts relevant information from found pages, and produces a comprehensive markdown report. The research runs in the background — you return immediately with a sessionId, and the user tracks progress in the Deep Research panel.

## When to Use Deep Research vs. Regular Web Search

| Use Deep Research When... | Use Regular Web Search When... |
|---|---|
| "Research the current state of quantum computing" | "What is the capital of France?" |
| "Compare React, Vue, and Angular for large projects" | "What's the weather today?" |
| "Do a literature review on transformer architectures" | "Find the documentation for Express.js" |
| "Investigate the methodologies for protein folding prediction" | "What year was Python created?" |
| "Fact-check: Is it true that vitamin C prevents colds?" | "Show me the top 10 results for 'best laptops'" |

## Available Categories

| Category | Use For |
|---|---|
| \`literature-review\` | Synthesizing research on a topic across multiple sources |
| \`compare-contrast\` | Side-by-side analysis of two or more things |
| \`methodology\` | Step-by-step guide for a technique or procedure |
| \`fact-check\` | Verifying the accuracy of a claim |
| \`concept-exploration\` | Deep dive into a concept, origins, and applications |
| \`problem-solving\` | Researching approaches to solve a specific problem |

## How to Use

1. Identify that the user's request requires multi-source research and synthesis
2. Choose the appropriate category based on what they're asking
3. Call the \`deep-research\` tool with the query and category
4. Tell the user: "I've started deep research on this topic. You can track progress in the Deep Research panel (sidebar). Results will appear there shortly."
5. When the research completes (you can check), help the user understand the report

## Important Notes

- Deep research takes 1-5 minutes depending on depth and complexity
- The user can cancel research at any time from the panel
- Multiple research sessions can run in parallel
- Results persist in the research panel's history
- The final report is in markdown format with inline citations
`;
