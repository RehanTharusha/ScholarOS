import type { PDFAnnotation } from "@scholaros/shared/dist/academic.js";

export interface QuoteBlock {
  markdown: string;
  linkedConcepts: string[];
}

export class AnnotationProcessor {
  toQuoteBlock(annotation: PDFAnnotation): QuoteBlock {
    const sourceLabel = `${annotation.pdfPath} (p.${annotation.page})`;
    const notesLine = annotation.notes ? `\n- note: ${annotation.notes}` : "";
    const markdown = [
      "> [!quote] Source Excerpt",
      `> ${annotation.highlighted.text}`,
      ">",
      `> - source: ${sourceLabel}${notesLine}`,
    ].join("\n");

    return {
      markdown,
      linkedConcepts: annotation.linkedConcepts ?? [],
    };
  }
}
