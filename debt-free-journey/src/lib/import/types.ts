export interface ParsedTransaction {
  /** ISO date, yyyy-mm-dd */
  date: string
  description: string
  /** Minor units, always positive */
  amount: number
  direction: 'debit' | 'credit'
}

export interface ParseResult {
  transactions: ParsedTransaction[]
  /** Statement closing balance in minor units, if the parser could find one */
  closingBalance: number | null
  parserName: string
  method: 'rules' | 'ai'
  /** 0..1 — how confident the rule parser is that it read the layout correctly */
  confidence: number
  periodStart: string | null
  periodEnd: string | null
}

export interface RuleParser {
  name: string
  /** Quick check: does this text/rows look like a layout this parser knows? */
  detect(input: ParserInput): boolean
  parse(input: ParserInput): ParseResult
}

export interface ParserInput {
  /** Raw text (PDF-extracted or CSV file contents) */
  text: string
  /** Rows if the source was CSV/XLSX (already split into cells) */
  rows: string[][] | null
  filename: string
  /** Chosen by the user on upload. On a credit-card statement the running
   *  balance rises with spending; on a bank account it falls. */
  statementType?: 'bank_account' | 'credit_card'
}
