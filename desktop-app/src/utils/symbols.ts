// Unicode symbols and emojis - centralized for consistency
export const SYMBOLS = {
  // Status indicators
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  LOADING: '⏳',
  INFO: 'ℹ️',
  PENDING: '⏳',
  CHECK: '✓',
  GEAR: '⚙️',

  // User types
  MANUAL: '👤',
  AUTO: '🤖',

  // Training types
  INCOME: '💰',
  EXPENSE: '💸',
  CATEGORY: '🏷️',
  QUESTION: '❓',
  TARGET: '🎯',
  SAVE: '💾',
  EDIT: '📝',

  // Chart/data
  CHART: '📊',
  TREND_UP: '↑',
  TREND_DOWN: '↓',
  TREND_STABLE: '=',

  // Colors (circles)
  RED_CIRCLE: '🔴',
  YELLOW_CIRCLE: '🟡',
  GREEN_CIRCLE: '🟢',
  BLUE_CIRCLE: '🔵',

  // Other
  MINUS: '−', // minus sign
  DASH: '—', // em dash
  ARROW_RIGHT: '→',

  // Currency
  CZK: 'Kč',
}

// Helper functions for common patterns
export const msg = {
  success: (text: string) => `${SYMBOLS.SUCCESS} ${text}`,
  error: (text: string) => `${SYMBOLS.ERROR} ${text}`,
  warning: (text: string) => `${SYMBOLS.WARNING} ${text}`,
  loading: (text: string) => `${SYMBOLS.LOADING} ${text}`,
}

// Number formatting
export const formatCurrency = (amount: number): string => {
  return `${amount.toLocaleString()} ${SYMBOLS.CZK}`
}
