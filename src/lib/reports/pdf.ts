export type PdfReportSection = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type PdfReport = {
  title: string;
  period: string;
  summary: [string, string][];
  sections: PdfReportSection[];
  fileName: string;
};

const cleanText = (value: string) =>
  value
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\xFF]/g, "")
    .trim();

export async function downloadPdfReport(report: PdfReport) {
  const { default: JsPDF } = await import("jspdf");
  const pdf = new JsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin - 8;
  let y = margin;

  const addPage = () => {
    pdf.addPage();
    y = margin;
  };
  const ensureSpace = (height: number) => {
    if (y + height > bottom) addPage();
  };
  const drawSectionTitle = (title: string) => {
    ensureSpace(12);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(31, 41, 55);
    pdf.text(cleanText(title), margin, y + 4);
    y += 8;
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(17, 24, 39);
  pdf.text(cleanText(report.title), margin, y + 6);
  y += 12;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(75, 85, 99);
  pdf.text(`Period: ${cleanText(report.period)}`, margin, y + 3);
  pdf.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, pageWidth - margin, y + 3, { align: "right" });
  y += 10;

  if (report.summary.length) {
    drawSectionTitle("Summary");
    const columnWidth = contentWidth / 2;
    const rowHeight = 7;
    for (let index = 0; index < report.summary.length; index += 2) {
      ensureSpace(rowHeight);
      for (let column = 0; column < 2; column++) {
        const item = report.summary[index + column];
        if (!item) continue;
        const x = margin + column * columnWidth;
        pdf.setFillColor(248, 250, 252);
        pdf.rect(x, y, columnWidth - 2, rowHeight, "F");
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        pdf.text(cleanText(item[0]), x + 2, y + 4.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(17, 24, 39);
        pdf.text(cleanText(item[1]), x + columnWidth - 6, y + 4.5, { align: "right" });
      }
      y += rowHeight;
    }
    y += 4;
  }

  for (const section of report.sections) {
    if (!section.columns.length) continue;
    drawSectionTitle(section.title);
    const columnWidth = contentWidth / section.columns.length;
    const cellPadding = 2;
    const fontSize = 8;
    const lineHeight = 4;

    const drawHeader = () => {
      ensureSpace(9);
      pdf.setFillColor(226, 232, 240);
      pdf.rect(margin, y, contentWidth, 8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize);
      pdf.setTextColor(31, 41, 55);
      section.columns.forEach((column, index) => {
        pdf.text(cleanText(column), margin + index * columnWidth + cellPadding, y + 5);
      });
      y += 8;
    };

    drawHeader();
    if (!section.rows.length) {
      ensureSpace(8);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize);
      pdf.setTextColor(107, 114, 128);
      pdf.text("No records in this period.", margin + cellPadding, y + 5);
      y += 8;
      continue;
    }

    for (const row of section.rows) {
      const wrapped = section.columns.map((_, index) =>
        pdf.splitTextToSize(cleanText(row[index] ?? ""), columnWidth - cellPadding * 2) as string[],
      );
      const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
      const rowHeight = Math.max(7, lineCount * lineHeight + 3);
      if (y + rowHeight > bottom) {
        addPage();
        drawHeader();
      }

      let lineOffset = 0;
      while (lineOffset < lineCount) {
        const availableLines = Math.floor((bottom - y - 3) / lineHeight);
        if (availableLines < 1) {
          addPage();
          drawHeader();
          continue;
        }

        const renderedLines = Math.min(lineCount - lineOffset, availableLines);
        const fragmentHeight = Math.max(7, renderedLines * lineHeight + 3);
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, y + fragmentHeight, pageWidth - margin, y + fragmentHeight);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(fontSize);
        pdf.setTextColor(31, 41, 55);
        wrapped.forEach((lines, index) => {
          const fragment = lines.slice(lineOffset, lineOffset + renderedLines);
          if (fragment.length) {
            pdf.text(fragment, margin + index * columnWidth + cellPadding, y + 4);
          }
        });
        y += fragmentHeight;
        lineOffset += renderedLines;

        if (lineOffset < lineCount) {
          addPage();
          drawHeader();
        }
      }
    }
    y += 5;
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    pdf.text(cleanText(report.title), margin, pageHeight - 6);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const safeName = report.fileName.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "report";
  pdf.save(`${safeName}.pdf`);
}

export function formatReportAmount(minor: number, currency: string) {
  return `${currency} ${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
