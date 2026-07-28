import { z } from 'zod'

export const debtSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['credit_card', 'personal_loan', 'islamic_financing', 'staff_welfare', 'other']),
  principal: z.number().int().positive(),
  startingBalance: z.number().int().nonnegative(),
  ratePercent: z.number().min(0).max(100),
  ratePeriod: z.enum(['per_month', 'per_year']),
  interestMethod: z.enum(['reducing_balance', 'fixed_profit', 'zero_interest']),
  ibraAvailable: z.boolean().optional().default(false),
  totalPayable: z.number().int().positive().nullable().optional(),
  minPayment: z.number().int().positive(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  matchPatterns: z.string().optional().default(''),
  sortOrder: z.number().int().optional(),
})
