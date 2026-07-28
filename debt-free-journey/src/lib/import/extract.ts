import type { ParserInput } from './types'
import { parseCsv } from './csv'

/** Turn an uploaded file into text + rows for the parsers.
 *  PDF -> extracted text; CSV -> rows; XLS/XLSX -> rows via SheetJS. */
export async function extractInput(filename: string, buffer: Buffer): Promise<ParserInput> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default
    const parsed = await pdfParse(buffer)
    return { text: parsed.text, rows: null, filename }
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) as string[][]
    const text = rows.map((r) => r.join(',')).join('\n')
    return { text, rows: rows.map((r) => r.map((c) => String(c ?? ''))), filename }
  }
  // CSV / TSV / plain text
  const text = buffer.toString('utf-8')
  const rows = parseCsv(text)
  return { text, rows: rows.length > 1 ? rows : null, filename }
}
