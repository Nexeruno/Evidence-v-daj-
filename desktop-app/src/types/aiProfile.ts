export interface AiProfileFeatures {
  avgExpense3m: number
  avgExpense6m: number
  avgExpense12m: number
  avgIncome3m: number
  avgIncome6m: number
  avgIncome12m: number
  categoryTotals12m: Record<string, number>
  categoryAverages12m: Record<string, number>
  monthOverMonthExpenseTrend: number
  monthOverMonthIncomeTrend: number
  largestExpenseCategory: string | null
  largestIncomeCategory: string | null
  volatilityScore: number
  regularityScore: number
  feedbackCount: number
  avgManualCorrectionFactor: number
  avgAutoCorrectionFactor: number
  avgFinalCorrectionFactor: number
}

export interface AiProfileSummary {
  userId: string
  generatedAt: any
  dataCoverageMonths: number
  transactionCount: number
  expenseCount: number
  incomeCount: number
  avgMonthlyExpense: number
  avgMonthlyIncome: number
  medianMonthlyExpense: number
  medianMonthlyIncome: number
  topExpenseCategories: string[]
  topIncomeCategories: string[]
  expenseVolatility: number
  incomeRegularity: number
  savingsTrend: number
  dominantSpendingPattern: string
  seasonalitySignals: string
  feedbackAdjustedBias: number
  confidenceScore: number
  profileVersion: string
  humanReadableExplanation: string
  feedbackCount?: number
  // Staleness tracking
  sourceDataUpdatedAt?: any
  profileStale?: boolean
  staleReason?: string[]
  lastTransactionAt?: any
  lastFeedbackAt?: any
}

export interface AiProfile extends AiProfileSummary {
  features: AiProfileFeatures
}
