/**
 * A tiny text-only PDF writer (A4, Helvetica), so a report can be downloaded without a PDF library.
 * Lines flow down the page and break onto a new page when they run out of room.
 */

export interface PdfCell {
  /** Points from the left edge of the page. */
  x: number;
  text: string;
}

export interface PdfLine {
  cells: PdfCell[];
  size?: number;
  bold?: boolean;
  /** Extra space above the line, in points. */
  gap?: number;
  /** Draw a thin rule under the line. */
  rule?: boolean;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

/** Unicode characters outside Latin-1 that WinAnsiEncoding still has. */
const WIN_ANSI: Record<string, number> = {
  '–': 0x96,
  '—': 0x97,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '…': 0x85,
};

/** A PDF string literal: WinAnsi bytes with ( ) \ escaped; anything it can't show becomes "?". */
function pdfString(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = WIN_ANSI[ch] ?? ch.codePointAt(0) ?? 63;
    const c =
      code < 32 || code > 255 || (code >= 127 && code < 160 && !WIN_ANSI[ch])
        ? '?'
        : String.fromCharCode(code);
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return `(${out})`;
}

function layout(lines: PdfLine[]): string[] {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const size = line.size ?? 10;
    const step = (line.gap ?? 0) + size * 1.4;
    if (y - step < MARGIN && ops.length > 0) {
      pages.push(ops.join('\n'));
      ops = [];
      y = PAGE_H - MARGIN;
    }
    y -= step;
    const font = line.bold ? 'F2' : 'F1';
    for (const cell of line.cells) {
      ops.push(`BT /${font} ${size} Tf ${cell.x} ${y.toFixed(1)} Td ${pdfString(cell.text)} Tj ET`);
    }
    if (line.rule) {
      const ry = (y - size * 0.45).toFixed(1);
      ops.push(`0.8 G 0.5 w ${MARGIN} ${ry} m ${PAGE_W - MARGIN} ${ry} l S 0 G`);
    }
  }
  pages.push(ops.join('\n'));
  return pages;
}

/** The PDF file's bytes. Every character is one byte, so string offsets are byte offsets. */
export function buildPdf(lines: PdfLine[], title?: string): Uint8Array {
  const pages = layout(lines);
  // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then a page and its content stream per page,
  // then the document info (title) when there is one.
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  pages.forEach((content, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  // The title a PDF viewer shows in its tab and toolbar.
  if (title) objects.push(`<< /Title ${pdfString(title)} >>`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${title ? ` /Info ${objects.length} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i);
  return bytes;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Saves the bytes as a file through a temporary link. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens the PDF in a new tab to read first, with a Download button that saves it under `filename`.
 * The file's URL is made in the new tab, so it keeps working after this page moves on.
 * If a pop-up blocker stops the tab, the file downloads instead.
 */
export function openPdf(bytes: Uint8Array, filename: string, title: string): void {
  const win = window.open('', '_blank') as (Window & typeof globalThis) | null;
  if (!win) {
    downloadPdf(bytes, filename);
    return;
  }
  win.opener = null;
  const doc = win.document;
  doc.open();
  doc.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: #f3f4f6; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111827; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #e5e7eb; }
  h1 { flex: 1; min-width: 0; margin: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a { flex-shrink: 0; padding: 9px 18px; border-radius: 999px; background: #111827; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
  iframe { flex: 1; width: 100%; border: 0; }
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1><a id="download" download="${escapeHtml(filename)}">Download PDF</a></header>
<iframe id="pdf" title="${escapeHtml(title)}"></iframe>
</body>
</html>`);
  doc.close();
  const url = win.URL.createObjectURL(
    new win.Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
  );
  (doc.getElementById('download') as HTMLAnchorElement).href = url;
  (doc.getElementById('pdf') as HTMLIFrameElement).src = url;
}
