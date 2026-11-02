"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadPdfReport, type PdfReport } from "@/lib/reports/pdf";

export function ReportPdfButton({ report }: { report: PdfReport }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      await downloadPdfReport(report);
    } catch (error) {
      console.error("Report PDF download failed:", error);
      toast.error("Could not download the report PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={downloading} onClick={download}>
      <Download className="mr-2 size-4" />
      {downloading ? "Preparing report…" : "Download report"}
    </Button>
  );
}
