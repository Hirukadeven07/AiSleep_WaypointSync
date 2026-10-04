import { describe, expect, it } from 'vitest';
import { buildPdf, type PdfLine } from './pdf';

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('buildPdf', () => {
  it('writes a PDF whose xref offsets point at each object', () => {
    const pdf = text(buildPdf([{ cells: [{ x: 48, text: 'Trip report' }], bold: true }]));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(6);
    offsets.forEach((off, i) => expect(pdf.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(pdf).toContain('/F2 10 Tf');
    expect(pdf).toContain('(Trip report) Tj');
  });

  it('names the document when given a title, so the viewer tab shows it', () => {
    const pdf = text(buildPdf([{ cells: [{ x: 48, text: 'x' }] }], 'Trip report · WP LQ-1035'));
    expect(pdf).toContain('7 0 obj\n<< /Title (Trip report \xb7 WP LQ-1035) >>');
    expect(pdf).toContain('/Root 1 0 R /Info 7 0 R >>');
  });

  it('escapes brackets and backslashes, keeps the middle dot, and replaces what WinAnsi lacks', () => {
    const pdf = text(buildPdf([{ cells: [{ x: 0, text: 'a (b) \\ c · d – 🚚' }] }]));
    expect(pdf).toContain('(a \\(b\\) \\\\ c \xb7 d \x96 ?) Tj');
  });

  it('breaks onto a new page when the lines run out of room', () => {
    const lines: PdfLine[] = Array.from({ length: 80 }, (_, i) => ({
      cells: [{ x: 48, text: `Line ${i}` }],
    }));
    const pdf = text(buildPdf(lines));
    expect(pdf).toContain('/Count 2');
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(2);
  });
});
