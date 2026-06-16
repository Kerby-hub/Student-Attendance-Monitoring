// Client-only export helpers. CSV, XLSX, PDF.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type Row = Record<string, string | number | null | undefined>;

export function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows
    .map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))
    .join("\n");
  return head + "\n" + body;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, rows: Row[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}

export function downloadXlsx(filename: string, rows: Row[], sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload(new Blob([out], { type: "application/octet-stream" }), filename);
}

export function downloadPdf(
  filename: string,
  title: string,
  rows: Row[],
  opts: { subtitle?: string; orientation?: "p" | "l" } = {},
) {
  const doc = new jsPDF({ orientation: opts.orientation ?? "l", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(opts.subtitle, 40, 58);
    doc.setTextColor(0);
  }
  const cols = rows.length ? Object.keys(rows[0]) : [];
  autoTable(doc, {
    startY: opts.subtitle ? 72 : 56,
    head: [cols],
    body: rows.map((r) => cols.map((c) => String(r[c] ?? ""))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(filename);
}
