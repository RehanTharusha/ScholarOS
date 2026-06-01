import { generateText } from "ai";
import { createProvider } from "../models/models.js";
import { getDefaultModelAndProvider, resolveProviderConfig } from "../models/defaults.js";
import { searchDuckDuckGo } from "./search-provider.js";
import type { SearchResult } from "./search-provider.js";
import { getCategoryReportPrompt } from "./academic-categories.js";
import type { AcademicCategoryId } from "./academic-categories.js";
import type { ResearchProgress, ResearchSource, ResearchFinding } from "@x/shared/dist/research.js";

const RESEARCH_PLAN_PROMPT = `You are a research strategist. Before searching, analyze this question and create a research plan.

**Question:** {question}

Break this question down:
1. What key sub-topics need to be covered for a comprehensive answer?
2. What specific data points, facts, or perspectives should we look for?
3. What would a complete, high-quality answer include?

Return a JSON object with:
- "sub_questions": Array of 3-6 specific sub-questions to investigate
- "key_topics": Array of key topics/angles to cover
- "success_criteria": One sentence describing what a complete answer looks like

Example:
{{
  "sub_questions": ["What is the cost of living in X?", "How is the healthcare system?"],
  "key_topics": ["economy", "healthcare", "safety", "culture"],
  "success_criteria": "A balanced comparison covering cost, quality of life, and practical considerations."
}}`;

const QUERY_GEN_PROMPT = `You are a research assistant planning web searches.

**Original question:** {question}

**Research plan:**
{researchPlan}

**What we know so far:**
{report}

**Round:** {roundNum}

Generate {numQueries} focused search queries that will help answer the question.
{roundInstruction}

Return ONLY a JSON array of query strings, nothing else.
Example: ["query one", "query two", "query three"]`;

const EXTRACTOR_PROMPT = `You are extracting relevant information from a web page to answer a research question.

**Research question:** {question}

**Current sub-questions being investigated:**
{subQuestions}

**Page URL:** {url}
**Page title:** {title}
**Page content:**
{content}

Extract any information relevant to the research question. If the page is not relevant, return "NO_RELEVANT_INFO".
Otherwise, return a concise summary of the relevant information (2-5 sentences).`;

const SYNTHESIZE_PROMPT = `You are updating an evolving research report.

**Original question:** {question}

**Current report:**
{report}

**New findings from this round:**
{newFindings}

Integrate the new findings into the existing report. Produce an updated, well-organized report that answers the original question as completely as possible given all evidence so far. Remove redundancy, resolve contradictions, and maintain logical flow. Keep source URLs as inline citations where relevant.

Write only the updated report — no preamble or meta-commentary.`;

const STOP_PROMPT = `You are deciding whether a research report is comprehensive enough.

**Original question:** {question}

**Current report:**
{report}

**Rounds completed:** {roundNum}

Based on the report so far, do we have enough information to answer the question comprehensively? Consider:
- Are the key aspects of the question addressed?
- Are there obvious gaps or unanswered sub-questions?
- Has the report stopped producing meaningful new information?

Respond with ONLY "YES" or "NO".`;

const FINAL_REPORT_PROMPT = `You are writing a final research report.

**Original question:** {question}

**Research findings:**
{report}

**Category-specific instructions:**
{categoryPrompt}

Write a polished, well-structured final report. Requirements:
- Minimum 1000 words
- Executive summary at the top
- Clear section headings
- Include inline citations with source URLs
- Professional academic tone
- No meta-commentary (don't say "based on my research")
- Write the report directly as if you are an expert

Write only the report — no preamble.`;

export interface DeepResearcherOptions {
  model?: string;
  provider?: string;
  maxRounds?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ResearchProgress) => void;
}

export interface DeepResearchResult {
  result: string;
  sources: ResearchSource[];
  findings: ResearchFinding[];
  stats: {
    duration: number;
    rounds: number;
    queries: number;
    urls: number;
    model: string;
    searchProvider: string;
    category: string;
  };
}

export class DeepResearcher {
  private query: string;
  private category: AcademicCategoryId;
  private maxRounds: number;
  private modelName: string;
  private providerName: string;
  private abortSignal?: AbortSignal;
  private onProgress?: (progress: ResearchProgress) => void;

  private plan: string = "";
  private report: string = "";
  private allSources: ResearchSource[] = [];
  private allFindings: ResearchFinding[] = [];
  private queriesUsed = new Set<string>();
  private consecutiveEmptyRounds = 0;
  private totalQueries = 0;
  private totalUrls = 0;

  constructor(
    query: string,
    category: AcademicCategoryId,
    options: DeepResearcherOptions = {},
  ) {
    this.query = query;
    this.category = category;
    this.maxRounds = options.maxRounds ?? 6;
    this.modelName = options.model ?? "";
    this.providerName = options.provider ?? "";
    this.abortSignal = options.abortSignal;
    this.onProgress = options.onProgress;
  }

  private _progress(phase: ResearchProgress["phase"], round: number, extra?: Partial<ResearchProgress>): void {
    this.onProgress?.({
      phase,
      round,
      totalRounds: this.maxRounds,
      queriesFound: this.totalQueries,
      sourcesFound: this.totalUrls,
      findingsCount: this.allFindings.length,
      ...extra,
    });
  }

  private async _llm(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    // Resolve model + provider
    let model: string;
    let providerConfig: any;

    if (this.modelName && this.providerName) {
      model = this.modelName;
      providerConfig = await resolveProviderConfig(this.providerName);
    } else {
      const defaults = await getDefaultModelAndProvider();
      model = this.modelName || defaults.model;
      providerConfig = await resolveProviderConfig(this.providerName || defaults.provider);
    }

    this.modelName = model;
    this.providerName = providerConfig.flavor || "unknown";

    const provider = createProvider(providerConfig);
    const languageModel = provider.languageModel(model);

    const result = await generateText({
      model: languageModel,
      system: systemPrompt,
      messages: [
        { role: "user" as const, content: userPrompt },
      ],
      abortSignal: this.abortSignal,
    });

    return result.text;
  }

  private async _llmWithRetry(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
        return await this._llm(systemPrompt, userPrompt, maxTokens);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (this.abortSignal?.aborted) throw lastError;
      }
    }
    throw lastError;
  }

  private async _createPlan(): Promise<string> {
    const response = await this._llmWithRetry(
      "You are a research strategist. Always return valid JSON.",
      RESEARCH_PLAN_PROMPT.replace("{question}", this.query),
    );
    this.plan = response;
    return response;
  }

  private async _generateQueries(roundNum: number): Promise<string[]> {
    const isFirstRound = roundNum === 1;
    const numQueries = isFirstRound ? 4 : 3;
    const roundInstruction = isFirstRound
      ? "Make these broad searches covering different aspects of the question."
      : "Focus on filling gaps in the current report. Target specific areas that need more evidence.";

    const prompt = QUERY_GEN_PROMPT
      .replace("{question}", this.query)
      .replace("{researchPlan}", this.plan)
      .replace("{report}", this.report || "No information yet.")
      .replace("{roundNum}", String(roundNum))
      .replace("{numQueries}", String(numQueries))
      .replace("{roundInstruction}", roundInstruction);

    const response = await this._llmWithRetry(
      "You are a research assistant. Always return valid JSON.",
      prompt,
    );

    try {
      const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const queries = JSON.parse(cleaned) as string[];
      return queries.filter(q => !this.queriesUsed.has(q.toLowerCase().trim()));
    } catch {
      return [];
    }
  }

  private async _searchAndExtract(queries: string[], roundNum: number): Promise<void> {
    // Search
    this._progress("searching", roundNum, { message: "Searching..." });
    const allResults: SearchResult[] = [];
    const seenUrls = new Set(this.allSources.map(s => s.url));

    const searchPromises = queries.map(q => searchDuckDuckGo(q, 5, this.abortSignal));
    const results = await Promise.allSettled(searchPromises);

    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const sr of r.value) {
          if (!seenUrls.has(sr.url)) {
            seenUrls.add(sr.url);
            allResults.push(sr);
            this.allSources.push({ url: sr.url, title: sr.title, snippet: sr.snippet });
            this.totalUrls++;
          }
        }
      }
    }

    this.totalQueries += queries.length;

    // Extract
    this._progress("extracting", roundNum, { message: "Extracting content from sources...", sourcesFound: this.totalUrls });
    const topUrls = allResults.slice(0, 6);
    const extractPromises = topUrls.map(result =>
      this._extractFromUrl(result, roundNum)
    );
    const findings = await Promise.allSettled(extractPromises);
    let newFindingsCount = 0;
    for (const f of findings) {
      if (f.status === "fulfilled" && f.value) {
        this.allFindings.push(f.value);
        newFindingsCount++;
      }
    }

    this._progress("synthesizing", roundNum, { message: `${newFindingsCount} new findings`, findingsCount: this.allFindings.length });

    // Track empty rounds
    if (newFindingsCount === 0 && allResults.length === 0) {
      this.consecutiveEmptyRounds++;
    } else {
      this.consecutiveEmptyRounds = 0;
    }
  }

  private async _extractFromUrl(result: SearchResult, _roundNum: number): Promise<ResearchFinding | null> {
    try {
      const response = await fetch(result.url, {
        signal: this.abortSignal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html",
        },
      });

      if (!response.ok) return null;
      const html = await response.text();

      // Simple text extraction
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length < 200) return null;

      const content = text.substring(0, 4000);

      const summary = await this._llmWithRetry(
        "You are extracting relevant information for a research project.",
        EXTRACTOR_PROMPT
          .replace("{question}", this.query)
          .replace("{subQuestions}", this.plan)
          .replace("{url}", result.url)
          .replace("{title}", result.title)
          .replace("{content}", content),
        512,
      );

      const trimmed = summary.trim();
      if (trimmed === "NO_RELEVANT_INFO" || trimmed.length < 20) return null;

      return { url: result.url, title: result.title, summary: trimmed };
    } catch {
      return null;
    }
  }

  private async _synthesize(roundNum: number): Promise<void> {
    // Sliding window: only last 3 findings
    const recentFindings = this.allFindings.slice(-3);
    const findingsText = recentFindings
      .map(f => `Source: ${f.url}\nTitle: ${f.title}\nSummary: ${f.summary}`)
      .join("\n\n---\n\n");

    if (!findingsText) return;

    const prompt = SYNTHESIZE_PROMPT
      .replace("{question}", this.query)
      .replace("{report}", this.report || "No information yet.")
      .replace("{newFindings}", findingsText);

    this.report = await this._llmWithRetry(
      "You are writing a research report. Be thorough and well-organized.",
      prompt,
      4096,
    );

    // Truncate report to last 4000 chars for next round's context
    if (this.report.length > 4000) {
      this.report = this.report.slice(-4000);
    }
  }

  private async _shouldStop(roundNum: number): Promise<boolean> {
    if (this.consecutiveEmptyRounds >= 2) return true;

    this._progress("deciding", roundNum, { message: "Evaluating completeness..." });
    const prompt = STOP_PROMPT
      .replace("{question}", this.query)
      .replace("{report}", this.report)
      .replace("{roundNum}", String(roundNum));

    const response = await this._llmWithRetry(
      "You decide when research is complete. Answer only YES or NO.",
      prompt,
      10,
    );

    return response.trim().toUpperCase() === "YES";
  }

  private async _finalReport(): Promise<string> {
    this._progress("finalizing", this.maxRounds, { message: "Writing final report..." });
    const categoryPrompt = getCategoryReportPrompt(this.category);

    const prompt = FINAL_REPORT_PROMPT
      .replace("{question}", this.query)
      .replace("{report}", this.report)
      .replace("{categoryPrompt}", categoryPrompt);

    const fullReport = await this._llmWithRetry(
      "You are writing a final academic research report. Be thorough.",
      prompt,
      8192,
    );

    // If report is too short, ask for expansion
    if (fullReport.split(/\s+/).length < 400) {
      const expandPrompt = `The following report is too brief. Please expand it to be more comprehensive (minimum 1000 words) while keeping the same structure and citations.\n\n---\n\n${fullReport}`;
      return await this._llmWithRetry(
        "Expand this report to be more comprehensive.",
        expandPrompt,
        8192,
      );
    }

    return fullReport;
  }

  async research(): Promise<DeepResearchResult> {
    const startedAt = Date.now();

    // Phase 1: Plan
    this._progress("planning", 0, { message: "Creating research plan..." });
    await this._createPlan();

    // Phases 2-4: Iterative rounds
    for (let round = 1; round <= this.maxRounds; round++) {
      if (this.abortSignal?.aborted) throw new Error("Research cancelled");

      // THINK
      this._progress("searching", round, { message: "Generating search queries..." });
      const queries = await this._generateQueries(round);
      for (const q of queries) {
        this.queriesUsed.add(q.toLowerCase().trim());
      }

      // SEARCH + EXTRACT
      await this._searchAndExtract(queries, round);

      // SYNTHESIZE
      this._progress("synthesizing", round, { message: "Synthesizing findings..." });
      await this._synthesize(round);

      // DECIDE (only after round 2)
      if (round >= 2) {
        const shouldStop = await this._shouldStop(round);
        if (shouldStop) break;
      }

      if (this.consecutiveEmptyRounds >= 2) break;
    }

    // Phase 5: Final report
    const result = await this._finalReport();

    const duration = ((Date.now() - startedAt) / 1000).toFixed(0);
    this._progress("finalizing", this.maxRounds, { message: `Done in ${duration}s`, findingsCount: this.allFindings.length });

    return {
      result,
      sources: this.allSources,
      findings: this.allFindings,
      stats: {
        duration: Math.round((Date.now() - startedAt) / 1000),
        rounds: Math.min(this.maxRounds, this.maxRounds),
        queries: this.totalQueries,
        urls: this.totalUrls,
        model: this.modelName,
        searchProvider: "duckduckgo",
        category: this.category,
      },
    };
  }
}
