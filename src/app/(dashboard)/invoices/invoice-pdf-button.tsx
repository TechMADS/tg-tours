"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { InvoiceAttachment } from "@/types/models";

export function InvoicePdfButton({
  invoiceNo,
  className,
  invoiceId,
  attachments = [],
  localAttachmentFiles = {},
}: {
  invoiceNo: string;
  className?: string;
  invoiceId?: string;
  attachments?: InvoiceAttachment[];
  localAttachmentFiles?: Record<string, File>;
}) {
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    const invoice = document.getElementById("invoice-preview");
    if (!invoice) {
      toast.error("Invoice preview is not available");
      return;
    }

    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: JsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pdf = new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const invoicePages = Array.from(
        invoice.querySelectorAll<HTMLElement>("[data-pdf-page]"),
      );
      if (invoicePages.length !== 2) {
        throw new Error("Invoice PDF requires exactly two invoice pages");
      }

      for (const [index, invoicePage] of invoicePages.entries()) {
        if (index > 0) pdf.addPage();
        const canvas = await html2canvas(invoicePage, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
          onclone: (clonedDocument) => {
            const clonedPage = clonedDocument.querySelectorAll<HTMLElement>(
              "#invoice-preview [data-pdf-page]",
            )[index];
            if (!clonedPage) return;
            const elements = [
              clonedPage,
              ...clonedPage.querySelectorAll<HTMLElement>("*"),
            ];
            for (const element of elements) {
              const color = element.classList.contains("text-primary")
                ? "#681c35"
                : element.classList.contains("text-red-600")
                  ? "#dc2626"
                  : element.classList.contains("text-slate-600")
                    ? "#475569"
                    : element.classList.contains("text-slate-500")
                      ? "#64748b"
                      : "#111827";
              element.style.setProperty("color", color, "important");
              element.style.setProperty(
                "background-color",
                "transparent",
                "important",
              );
              element.style.setProperty(
                "background-image",
                "none",
                "important",
              );
              element.style.setProperty("border-color", "#cbd5e1", "important");
              element.style.setProperty(
                "outline-color",
                "transparent",
                "important",
              );
              element.style.setProperty("box-shadow", "none", "important");
              element.style.setProperty("text-shadow", "none", "important");
              if (element.tagName === "TH") {
                const background = element.classList.contains("bg-primary/5")
                  ? "#f8e9ed"
                  : "#f8fafc";
                element.style.setProperty(
                  "background-color",
                  background,
                  "important",
                );
              } else if (element.classList.contains("bg-slate-100")) {
                element.style.setProperty(
                  "background-color",
                  "#f1f5f9",
                  "important",
                );
              }
            }
            clonedPage.style.setProperty(
              "background-color",
              "#ffffff",
              "important",
            );
          },
        });

        const scale = Math.min(
          contentWidth / canvas.width,
          contentHeight / canvas.height,
        );
        const width = canvas.width * scale;
        const height = canvas.height * scale;
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          (pageWidth - width) / 2,
          (pageHeight - height) / 2,
          width,
          height,
          undefined,
          "FAST",
        );
      }

      const screenshots = attachments.filter((attachment) =>
        attachment.contentType.startsWith("image/"),
      );
      for (const screenshot of screenshots) {
        const localFile = localAttachmentFiles[screenshot.id];
        const response = localFile
          ? null
          : invoiceId
            ? await fetch(
                `/api/invoices/${invoiceId}/attachments/${screenshot.id}`,
              )
            : null;
        if (!localFile && !response) {
          throw new Error(
            `Screenshot "${screenshot.name}" is not available for PDF export`,
          );
        }
        if (response && !response.ok) {
          throw new Error(
            `Could not load screenshot "${screenshot.name}" for PDF export`,
          );
        }

        const blob = localFile ?? (await response!.blob());
        const bitmap = await createImageBitmap(blob);
        try {
          const imageCanvas = document.createElement("canvas");
          imageCanvas.width = bitmap.width;
          imageCanvas.height = bitmap.height;
          const context = imageCanvas.getContext("2d");
          if (!context)
            throw new Error(
              `Could not prepare screenshot "${screenshot.name}" for PDF export`,
            );
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
          context.drawImage(bitmap, 0, 0);

          pdf.addPage();
          const imageScale = Math.min(
            contentWidth / imageCanvas.width,
            (pageHeight - margin * 2) / imageCanvas.height,
          );
          const imageWidth = imageCanvas.width * imageScale;
          const imageHeight = imageCanvas.height * imageScale;
          pdf.addImage(
            imageCanvas.toDataURL("image/png"),
            "PNG",
            (pageWidth - imageWidth) / 2,
            (pageHeight - imageHeight) / 2,
            imageWidth,
            imageHeight,
            undefined,
            "FAST",
          );
        } finally {
          bitmap.close();
        }
      }

      const safeInvoiceNo =
        invoiceNo.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "invoice";
      pdf.save(`${safeInvoiceNo}.pdf`);
    } catch (error) {
      console.error("Invoice PDF download failed:", error);
      toast.error("Could not download the invoice PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={downloading}
      onClick={downloadPdf}
    >
      <Download className="mr-2 size-4" />
      {downloading ? "Preparing PDF…" : "Download PDF"}
    </Button>
  );
}
