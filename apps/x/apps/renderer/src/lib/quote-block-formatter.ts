import type { PDFAnnotation } from "@x/shared/dist/academic.js";

export function formatQuoteBlock(annotation: PDFAnnotation): string {
  const sourceLine = `${annotation.pdfPath} (page ${annotation.page})`;
  const notes = annotation.notes ? `\n- note: ${annotation.notes}` : "";
  return [
    "> [!quote] Highlight",
    `> ${annotation.highlighted.text}`,
    ">",
    `> - source: ${sourceLine}${notes}`,
  ].join("\n");
}
