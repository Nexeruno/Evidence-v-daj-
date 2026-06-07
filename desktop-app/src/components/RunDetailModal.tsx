import { useState, useMemo, useEffect, Component, type ReactNode, type ErrorInfo } from 'react'
import toast from 'react-hot-toast'
import { SYMBOLS } from '@/utils/symbols'
import { useDebugLogExport } from '@/hooks/useDebugLogExport'
import { jsPDF } from 'jspdf'

/**
 * Helper function to export run detail
 */
function exportRunDetail(run: RunDetail, format: 'text' | 'json' | 'structured', action: 'download' | 'clipboard') {
  const content = generateRunDetailContent(run, format)

  if (action === 'download') {
    downloadFile(content, run, format)
  } else {
    copyToClipboard(content)
  }
}

/**
 * Generate export-ready debug text payload
 * FÁZE 4.8B: Readable debug text format
 */
function generateDebugTextPayload(run: RunDetail): string {
  const lines: string[] = []
  const now = new Date().toISOString()

  // Header
  lines.push('╔════════════════════════════════════════════════════════════════╗')
  lines.push('║           AI RUN DEBUG DETAIL - EXPORT FORMAT                  ║')
  lines.push('╚════════════════════════════════════════════════════════════════╝')
  lines.push('')

  // FÁZE 4.8E: Export Metadata Header
  lines.push('📊 EXPORT METADATA HEADER')
  lines.push('──────────────────────────────────────────────────────────────────')
  lines.push(`  Run ID:           ${run.id}`)
  lines.push(`  Status:           ${run.status.toUpperCase()}`)
  lines.push(`  Exported At:      ${now}`)
  lines.push(`  Log Type:         debug-export`)
  lines.push('')

  // Run Status Section
  lines.push('📋 RUN STATUS')
  lines.push('──────────────────────────────────────────────────────────────────')
  lines.push(`  Run ID:           ${run.id}`)
  lines.push(`  Status:           ${run.status.toUpperCase()}`)
  lines.push(`  Duration:         ${run.durationMs ? `${Math.round(run.durationMs / 1000)}s (${run.durationMs}ms)` : 'N/A'}`)
  lines.push(`  Exported:         ${now}`)
  lines.push('')

  // Validation Status Section
  lines.push('✅ VALIDATION STATUS')
  lines.push('──────────────────────────────────────────────────────────────────')
  const validationIcon =
    run.validationStatus === 'valid'
      ? '✅'
      : run.validationStatus === 'invalid'
        ? '❌'
        : '⚠️'
  lines.push(`  Status:           ${validationIcon} ${run.validationStatus?.toUpperCase() || 'UNKNOWN'}`)
  lines.push('')

  // Request Summary Section
  lines.push('📤 REQUEST SUMMARY')
  lines.push('──────────────────────────────────────────────────────────────────')
  if (run.requestSummary) {
    run.requestSummary.split('\n').forEach((line) => {
      lines.push(`  ${line}`)
    })
  } else {
    lines.push('  (no request data)')
  }
  lines.push('')

  // Response Summary Section
  lines.push('📥 RESPONSE SUMMARY')
  lines.push('──────────────────────────────────────────────────────────────────')
  if (run.responseSummary) {
    run.responseSummary.split('\n').forEach((line) => {
      lines.push(`  ${line}`)
    })
  } else {
    lines.push('  (no response data)')
  }
  lines.push('')

  // Debug Log Section
  lines.push('🐛 DEBUG LOG LINES')
  lines.push('──────────────────────────────────────────────────────────────────')
  lines.push(`  [DEBUG] Run ID: ${run.id}`)
  lines.push(`  [DEBUG] Status: ${run.status}`)
  lines.push(`  [DEBUG] Validation: ${run.validationStatus || 'unknown'}`)
  lines.push(`  [INFO] Duration: ${run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : 'N/A'}`)

  if (run.requestSummary) {
    lines.push(`  [INFO] Request data present`)
  }

  if (run.responseSummary) {
    lines.push(`  [INFO] Response data present`)
  }

  if (run.lastError) {
    lines.push(`  [ERROR] ${run.lastError.substring(0, 100)}`)
    if (run.errorCount && run.errorCount > 1) {
      lines.push(`  [ERROR] Error count: ${run.errorCount}`)
    }
  }

  lines.push(`  [DEBUG] Export timestamp: ${now}`)
  lines.push('')

  // Footer
  lines.push('╔════════════════════════════════════════════════════════════════╗')
  lines.push('║                  END OF DEBUG DETAIL EXPORT                     ║')
  lines.push('╚════════════════════════════════════════════════════════════════╝')
  lines.push('')
  lines.push('Export includes: Status, Timestamp, Request, Response, Validation, Debug Log')

  return lines.join('\n')
}

/**
 * Detect if debug export is large (FÁZE 4.8C)
 * Returns size metadata for display and handling
 */
interface DebugExportMetadata {
  isLarge: boolean
  lineCount: number
  charCount: number
}

/**
 * PDF-Ready export structure (FÁZE 4.8D)
 * Data shape for PDF generation without styling
 */
interface PdfTableCell {
  content: string
  style?: {
    bold?: boolean
    code?: boolean
    color?: 'normal' | 'error' | 'success' | 'warning'
  }
}

interface PdfTable {
  type: 'table'
  headers: string[]
  rows: PdfTableCell[][]
}

interface PdfCodeBlock {
  type: 'code'
  content: string
  language?: 'json' | 'text' | 'error'
}

interface PdfAlert {
  type: 'alert'
  severity: 'info' | 'warning' | 'error' | 'success'
  title: string
  content: string
}

interface PdfSection {
  id: string
  title: string
  type: 'text' | 'table' | 'code' | 'alert' | 'divider'
  content?: string
  data?: PdfTable | PdfCodeBlock | PdfAlert
  style?: {
    pageBreakBefore?: boolean
    pageBreakAfter?: boolean
    columnCount?: number
  }
}

/**
 * Export metadata header (FÁZE 4.8E)
 * Used in all export formats for tracking
 */
interface ExportMetadataHeader {
  runId: string
  status: string
  exportedAt: string
  contentLength: {
    lines: number
    characters: number
  }
  logType: 'debug-export' | 'pdf-ready' | 'structured'
}

interface PdfExportStructure {
  exportHeader: ExportMetadataHeader
  document: {
    title: string
    subtitle: string
    generatedAt: string
    format: 'pdf-debug-export'
    version: '1.0'
    isLargeExport: boolean
    exportedAt: string
  }
  summary: {
    runId: string
    status: string
    duration: string
    errorCount?: number
    validationStatus: string
  }
  sections: PdfSection[]
  metadata: {
    pageSize: 'A4' | 'Letter'
    pageOrientation: 'portrait' | 'landscape'
    margins: {
      top: number
      right: number
      bottom: number
      left: number
    }
    fontSize: {
      title: number
      heading: number
      subheading: number
      body: number
      code: number
    }
    colors: {
      primary: string
      accent: string
      error: string
      success: string
      warning: string
      info: string
    }
  }
  tableOfContents?: {
    enabled: boolean
    sections: Array<{ id: string; title: string }>
  }
  pageNumbers?: {
    enabled: boolean
    position: 'footer' | 'header'
  }
}

function getDebugExportMetadata(run: RunDetail): DebugExportMetadata {
  const payload = generateDebugTextPayload(run)
  const lineCount = payload.split('\n').length
  const charCount = payload.length

  // "Large export candidate" if > 50 lines or > 3000 chars
  // Represents typically multiple pages of content
  const isLarge = lineCount > 50 || charCount > 3000

  return { isLarge, lineCount, charCount }
}

/**
 * Generate PDF-ready export structure (FÁZE 4.8D)
 * Data shape without styling or rendering
 * Suitable for PDF generation in future phases
 */
function generatePdfDebugExportPayload(run: RunDetail): PdfExportStructure {
  const now = new Date().toISOString()
  const sections: PdfSection[] = []

  // 1. Run Status Section
  sections.push({
    id: 'run-status',
    title: 'Run Status',
    type: 'alert',
    data: {
      type: 'alert',
      severity: run.status === 'completed' ? 'success' : 'error',
      title: 'Execution Status',
      content: `Status: ${run.status.toUpperCase()} | Duration: ${run.durationMs ? Math.round(run.durationMs / 1000) + 's' : 'N/A'} | ID: ${run.id}`,
    },
  })

  // 2. Validation Status Section
  sections.push({
    id: 'validation-status',
    title: 'Validation Results',
    type: 'alert',
    data: {
      type: 'alert',
      severity:
        run.validationStatus === 'valid'
          ? 'success'
          : run.validationStatus === 'invalid'
            ? 'error'
            : 'warning',
      title: 'Request/Response Validation',
      content: `Validation Status: ${run.validationStatus?.toUpperCase() || 'UNKNOWN'}`,
    },
  })

  // 3. Request Summary (if present)
  if (run.requestSummary) {
    sections.push({
      id: 'request-summary',
      title: 'Request Summary',
      type: 'code',
      data: {
        type: 'code',
        content: run.requestSummary,
        language: 'text',
      },
      style: {
        pageBreakBefore: false,
      },
    })
  }

  // 4. Response Summary (if present)
  if (run.responseSummary) {
    sections.push({
      id: 'response-summary',
      title: 'Response Summary',
      type: 'code',
      data: {
        type: 'code',
        content: run.responseSummary,
        language: 'text',
      },
      style: {
        pageBreakBefore: false,
      },
    })
  }

  // 5. Error Details (if failed run)
  if (run.lastError && (run.status === 'failed' || run.status === 'error')) {
    sections.push({
      id: 'error-details',
      title: 'Error Details',
      type: 'alert',
      data: {
        type: 'alert',
        severity: 'error',
        title: `Error (Count: ${run.errorCount || 1})`,
        content: run.lastError,
      },
      style: {
        pageBreakBefore: true,
      },
    })
  }

  // 6. Debug Log Summary
  const debugLogLines: string[] = []
  debugLogLines.push(`[DEBUG] Run ID: ${run.id}`)
  debugLogLines.push(`[DEBUG] Status: ${run.status}`)
  debugLogLines.push(`[DEBUG] Validation: ${run.validationStatus || 'unknown'}`)
  debugLogLines.push(`[INFO] Duration: ${run.durationMs ? Math.round(run.durationMs / 1000) + 's' : 'N/A'}`)

  if (run.requestSummary) {
    debugLogLines.push(`[INFO] Request data present (${run.requestSummary.length} chars)`)
  }
  if (run.responseSummary) {
    debugLogLines.push(`[INFO] Response data present (${run.responseSummary.length} chars)`)
  }
  if (run.lastError) {
    debugLogLines.push(`[ERROR] ${run.lastError.substring(0, 120)}`)
    if (run.errorCount && run.errorCount > 1) {
      debugLogLines.push(`[ERROR] Total errors: ${run.errorCount}`)
    }
  }
  debugLogLines.push(`[DEBUG] Export timestamp: ${now}`)

  sections.push({
    id: 'debug-log',
    title: 'Debug Log Lines',
    type: 'code',
    data: {
      type: 'code',
      content: debugLogLines.join('\n'),
      language: 'text',
    },
  })

  // FÁZE 4.8E: Calculate export metadata header
  const debugContent = debugLogLines.join('\n')
  const exportMetadata: ExportMetadataHeader = {
    runId: run.id,
    status: run.status.toUpperCase(),
    exportedAt: now,
    contentLength: {
      lines: debugContent.split('\n').length,
      characters: debugContent.length,
    },
    logType: 'pdf-ready',
  }

  // Build PDF structure
  return {
    exportHeader: exportMetadata,
    document: {
      title: 'AI Run Debug Report',
      subtitle: `Run ID: ${run.id}`,
      generatedAt: now,
      format: 'pdf-debug-export',
      version: '1.0',
      isLargeExport: true,
      exportedAt: now,
    },
    summary: {
      runId: run.id,
      status: run.status.toUpperCase(),
      duration: run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : 'N/A',
      errorCount: run.errorCount,
      validationStatus: run.validationStatus || 'Unknown',
    },
    sections,
    metadata: {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
      fontSize: {
        title: 24,
        heading: 16,
        subheading: 12,
        body: 10,
        code: 9,
      },
      colors: {
        primary: '#1f2937',
        accent: '#3b82f6',
        error: '#dc2626',
        success: '#16a34a',
        warning: '#ea580c',
        info: '#0284c7',
      },
    },
    tableOfContents: {
      enabled: true,
      sections: sections.map((s) => ({ id: s.id, title: s.title })),
    },
    pageNumbers: {
      enabled: true,
      position: 'footer',
    },
  }
}

function generateRunDetailContent(run: RunDetail, format: 'text' | 'json' | 'structured'): string | object {
  if (format === 'json') {
    // FÁZE 4.8E: Create export metadata header
    const now = new Date().toISOString()
    const exportHeader: ExportMetadataHeader = {
      runId: run.id,
      status: run.status.toUpperCase(),
      exportedAt: now,
      contentLength: {
        lines: 0, // Not counted for JSON format
        characters: 0,
      },
      logType: 'structured',
    }

    return {
      exportHeader,
      meta: {
        exportedAt: now,
        format: 'json',
        version: '1.0',
      },
      run: {
        id: run.id,
        status: run.status,
        durationMs: run.durationMs,
        errorCount: run.errorCount,
      },
      details: {
        requestSummary: run.requestSummary,
        responseSummary: run.responseSummary,
        validationStatus: run.validationStatus,
        lastError: run.lastError,
      },
    }
  }

  if (format === 'structured') {
    // FÁZE 4.8E: Create export metadata header
    const now = new Date().toISOString()
    const exportHeader: ExportMetadataHeader = {
      runId: run.id,
      status: run.status.toUpperCase(),
      exportedAt: now,
      contentLength: {
        lines: 0, // Not counted for structured format
        characters: 0,
      },
      logType: 'structured',
    }

    return {
      exportHeader,
      document: {
        title: 'AI Run Detail Report',
        subtitle: `Run ID: ${run.id}`,
        generatedAt: now,
      },
      sections: [
        {
          id: 'status',
          title: 'Status',
          content: {
            'Run ID': run.id,
            'Status': run.status.toUpperCase(),
            'Duration': run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : 'N/A',
          },
        },
        {
          id: 'validation',
          title: 'Validation',
          content: {
            'Status': run.validationStatus || 'Unknown',
          },
        },
        {
          id: 'request',
          title: 'Request Summary',
          content: run.requestSummary || 'N/A',
          format: 'text',
        },
        {
          id: 'response',
          title: 'Response Summary',
          content: run.responseSummary || 'N/A',
          format: 'text',
        },
        ...(run.lastError
          ? [
              {
                id: 'error',
                title: 'Error Details',
                content: run.lastError,
                format: 'code',
              },
            ]
          : []),
      ],
      metadata: {
        pageOrientation: 'portrait',
        pageSize: 'A4',
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
      },
    }
  }

  // Text format - use the new readable debug text payload
  return generateDebugTextPayload(run)
}

function downloadFile(content: string | object, run: RunDetail, format: 'text' | 'json' | 'structured') {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  const ext = format === 'text' ? 'txt' : 'json'
  const blob = new Blob([contentStr], { type: format === 'text' ? 'text/plain' : 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `run-detail-${run.id}-${Date.now()}.${ext}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function copyToClipboard(content: string | object) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  navigator.clipboard.writeText(contentStr)
}

/**
 * Analyze export error and return user-friendly reason (FÁZE 4.9D)
 */
function getExportErrorReason(error: any): string {
  if (!error) return 'Export failed ✗'

  const errorStr = String(error)
  const errorLower = errorStr.toLowerCase()

  // Check for specific error patterns
  if (errorLower.includes('pdf') || errorLower.includes('jspdf') || errorLower.includes('document')) {
    return 'PDF generation failed ✗'
  }

  if (errorLower.includes('structure') || errorLower.includes('payload') || errorLower.includes('invalid')) {
    return 'Invalid export payload ✗'
  }

  if (
    errorLower.includes('content') ||
    errorLower.includes('data') ||
    errorLower.includes('undefined') ||
    errorLower.includes('null')
  ) {
    return 'Missing debug content ✗'
  }

  if (errorLower.includes('clipboard') || errorLower.includes('copy')) {
    return 'Clipboard access failed ✗'
  }

  if (errorLower.includes('blob') || errorLower.includes('download')) {
    return 'Download failed ✗'
  }

  // Default fallback
  return 'Export failed ✗'
}

/**
 * Generate PDF from PDF-ready export structure (FÁZE 4.9A)
 * Simple PDF generation without advanced styling
 */
function generatePdfFromStructure(structure: PdfExportStructure, run: RunDetail): void {
  try {
    // Create PDF document
    const pdf = new jsPDF({
      orientation: structure.metadata.pageOrientation as 'portrait' | 'landscape',
      unit: 'mm',
      format: structure.metadata.pageSize as 'a4' | 'letter',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = structure.metadata.margins
    const contentWidth = pageWidth - margin.left - margin.right
    let yPosition = margin.top

    // Helper function to add text with wrapping
    const addWrappedText = (text: string, fontSize: number, isBold: boolean = false) => {
      pdf.setFontSize(fontSize)
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal')
      const lines = pdf.splitTextToSize(text, contentWidth)
      pdf.text(lines, margin.left, yPosition)
      yPosition += lines.length * (fontSize / 3) + 2
    }

    // Helper function to check if we need a new page
    const checkPageBreak = (spaceNeeded: number) => {
      if (yPosition + spaceNeeded > pageHeight - margin.bottom) {
        pdf.addPage()
        yPosition = margin.top
      }
    }

    // Title
    addWrappedText(structure.document.title, structure.metadata.fontSize.title, true)
    yPosition += 5

    // Subtitle
    addWrappedText(structure.document.subtitle, structure.metadata.fontSize.subheading, false)
    yPosition += 5

    // Summary section
    checkPageBreak(30)
    addWrappedText('Summary', structure.metadata.fontSize.heading, true)
    yPosition += 2

    const summaryText = `Status: ${structure.summary.status} | Duration: ${structure.summary.duration} | Validation: ${structure.summary.validationStatus}`
    addWrappedText(summaryText, structure.metadata.fontSize.body, false)
    yPosition += 8

    // Sections
    structure.sections.forEach((section) => {
      checkPageBreak(15)

      // Section title
      addWrappedText(section.title, structure.metadata.fontSize.heading, true)
      yPosition += 2

      // Section content
      if (section.type === 'alert' && section.data && 'content' in section.data) {
        const alertData = section.data as PdfAlert
        addWrappedText(alertData.content, structure.metadata.fontSize.body, false)
        yPosition += 4
      } else if (section.type === 'code' && section.data && 'content' in section.data) {
        const codeData = section.data as PdfCodeBlock
        pdf.setFontSize(structure.metadata.fontSize.code)
        pdf.setFont('courier', 'normal')
        const codeLines = pdf.splitTextToSize(codeData.content, contentWidth - 4)
        codeLines.forEach((line: string) => {
          checkPageBreak(5)
          pdf.text(line, margin.left + 2, yPosition)
          yPosition += (structure.metadata.fontSize.code / 3) + 1
        })
        yPosition += 4
      } else if (section.content) {
        addWrappedText(section.content, structure.metadata.fontSize.body, false)
        yPosition += 4
      }
    })

    // Footer with timestamp
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'italic')
    const pageCount = pdf.internal.pages.length - 1
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i)
      pdf.text(
        `Generated: ${structure.document.generatedAt} | Page ${i} of ${pageCount}`,
        margin.left,
        pageHeight - margin.bottom + 3,
        { maxWidth: contentWidth }
      )
    }

    // Download PDF
    pdf.save(`run-pdf-debug-${run.id}-${Date.now()}.pdf`)
  } catch (error) {
    console.error('PDF generation error:', error)
    alert('Failed to generate PDF. Please try again.')
  }
}

/**
 * Run Detail Modal
 *
 * FÁZE 4.6E: Display detailed information about a single run
 * - Request summary
 * - Response summary
 * - Validation status
 * - Short debug log
 */

export interface RunDetail {
  id: string
  status: 'completed' | 'failed' | 'error'
  startedAt?: any
  finishedAt?: any
  durationMs?: number
  requestSummary?: string
  responseSummary?: string
  validationStatus?: 'valid' | 'invalid' | 'warning'
  errorCount?: number
  lastError?: string
}

interface RunDetailModalProps {
  run: RunDetail | null
  isOpen: boolean
  onClose: () => void
}

// Error boundary that keeps the overlay dismissible when modal content crashes
class ModalContentErrorBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError(): { hasError: boolean } { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[RunDetailModal] render error:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-light-card dark:bg-dark-card rounded-lg shadow-xl z-50 p-8 text-center space-y-4">
          <p className="text-red-600 dark:text-red-400 font-semibold text-sm">
            Run detail could not be displayed.
          </p>
          <button
            onClick={this.props.onClose}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function RunDetailModal({ run, isOpen, onClose }: RunDetailModalProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showDetailExportMenu, setShowDetailExportMenu] = useState(false)
  const { exportDebugLog } = useDebugLogExport()

  // FÁZE 4.8C: Detect if debug export is large — must be before early return (Rules of Hooks)
  const debugExportMetadata = useMemo(() => (run ? getDebugExportMetadata(run) : null), [run])

  // Escape key to close — must be before early return (Rules of Hooks)
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen || !run) return null

  // Guard against incomplete run data
  const isDataIncomplete = !run.id || !run.status
  if (isDataIncomplete) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-light-card dark:bg-dark-card rounded-lg shadow-xl z-50 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Run detail data is incomplete.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">
            Close
          </button>
        </div>
      </>
    )
  }

  // At this point run is valid and meta is guaranteed non-null
  const meta = debugExportMetadata!

  const isSuccess = run.status === 'completed'
  const isFailed = run.status === 'failed' || run.status === 'error'

  const handleDetailExport = (format: 'text' | 'json' | 'structured', action: 'download' | 'clipboard') => {
    try {
      exportRunDetail(run, format, action)
      // FÁZE 4.9C: Feedback based on action
      const actionLabel = action === 'download' ? 'exported' : 'copied'
      toast.success(`${format.toUpperCase()} ${actionLabel} ✓`)
    } catch (error) {
      console.error('Export error:', error)
      // FÁZE 4.9D: Show error reason
      const errorReason = getExportErrorReason(error)
      toast.error(errorReason)
    } finally {
      setShowDetailExportMenu(false)
    }
  }

  const handleExport = (format: 'text' | 'json' | 'structured', action: 'download' | 'clipboard') => {
    exportDebugLog(
      {
        id: run.id,
        status: isSuccess ? 'success' : 'failed',
        timestamp: new Date().toISOString(),
        duration: run.durationMs || 0,
        errorCount: run.errorCount,
        lastError: run.lastError,
        requestSummary: run.requestSummary,
        responseSummary: run.responseSummary,
        validationStatus: run.validationStatus,
      },
      format,
      action
    )
    setShowExportMenu(false)
  }

  // FÁZE 4.8D: Handle PDF export for large exports
  const handlePdfExport = (action: 'download' | 'clipboard') => {
    try {
      const pdfStructure = generatePdfDebugExportPayload(run)

      if (action === 'download') {
        // FÁZE 4.9A: Generate actual PDF from structure
        generatePdfFromStructure(pdfStructure, run)
        // FÁZE 4.9C: Feedback
        toast.success('PDF export created ✓')
      } else if (action === 'clipboard') {
        // Still support JSON structure copy for reference
        const jsonStr = JSON.stringify(pdfStructure, null, 2)
        navigator.clipboard.writeText(jsonStr)
        // FÁZE 4.9C: Feedback
        toast.success('PDF structure copied ✓')
      }
    } catch (error) {
      console.error('Export error:', error)
      // FÁZE 4.9D: Show error reason
      const errorReason = getExportErrorReason(error)
      toast.error(errorReason)
    } finally {
      setShowDetailExportMenu(false)
    }
  }

  // FÁZE 4.9B: Smart export - text for small, PDF for large
  // FÁZE 4.9C: Smart export with feedback
  // FÁZE 4.9D: Export with error details
  const handleSmartExport = () => {
    try {
      if (meta.isLarge) {
        // Large export → PDF
        const pdfStructure = generatePdfDebugExportPayload(run)
        generatePdfFromStructure(pdfStructure, run)
        toast.success('PDF export created ✓')
      } else {
        // Small export → Text
        exportRunDetail(run, 'text', 'download')
        toast.success('Text export created ✓')
      }
    } catch (error) {
      console.error('Export error:', error)
      // FÁZE 4.9D: Show error reason
      const errorReason = getExportErrorReason(error)
      toast.error(errorReason)
    } finally {
      setShowDetailExportMenu(false)
    }
  }

  // Format timestamp
  const formatDate = (timestamp: any) => {
    if (!timestamp) return '—'
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return '—'
    }
  }

  // Get validation status color
  const getValidationColor = (status?: string) => {
    switch (status) {
      case 'valid':
        return 'text-green-600 dark:text-green-400'
      case 'invalid':
        return 'text-red-600 dark:text-red-400'
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getValidationIcon = (status?: string) => {
    switch (status) {
      case 'valid':
        return '✅'
      case 'invalid':
        return '❌'
      case 'warning':
        return '⚠️'
      default:
        return '—'
    }
  }

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content — wrapped in error boundary so render crashes don't freeze the overlay */}
      <ModalContentErrorBoundary onClose={onClose}>
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-light-card dark:bg-dark-card rounded-lg shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-light-card dark:bg-dark-card border-b border-light-border dark:border-dark-border p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
              Run Details
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              ID: {run.id}
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2 relative">
            {/* Export Button */}
            <div className="relative">
              <button
                onClick={() => setShowDetailExportMenu(!showDetailExportMenu)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  meta.isLarge
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                }`}
              >
                📥 Export {meta.isLarge && '⚠️'}
              </button>

              {/* Export Menu */}
              {showDetailExportMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg bg-light-card dark:bg-dark-card border border-gray-200 dark:border-gray-700 z-10">
                  <div className={`p-3 border-b ${meta.isLarge ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Export Format
                    </p>
                    {meta.isLarge && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                        ⚠️ Large export candidate ({meta.lineCount} lines)
                      </p>
                    )}
                  </div>

                  {/* Smart Export (FÁZE 4.9B) */}
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={handleSmartExport}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <div className="font-medium">🚀 Export Debug Detail</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {meta.isLarge ? 'Auto PDF (large)' : 'Auto Text (small)'}
                      </div>
                    </button>
                  </div>

                  {/* Text Format */}
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleDetailExport('text', 'download')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <div className="font-medium">📄 Text Format</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {meta.isLarge ? `⚠️ Large (${meta.charCount} chars)` : 'Download .txt'}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDetailExport('text', 'clipboard')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                    >
                      <span className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</span>
                    </button>
                  </div>

                  {/* JSON Format */}
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleDetailExport('json', 'download')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <div className="font-medium">⚙️ JSON Format</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Download .json</div>
                    </button>
                    <button
                      onClick={() => handleDetailExport('json', 'clipboard')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                    >
                      <span className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</span>
                    </button>
                  </div>

                  {/* Structured Format */}
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleDetailExport('structured', 'download')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <div className="font-medium">📋 Report Format</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">For PDF export</div>
                    </button>
                    <button
                      onClick={() => handleDetailExport('structured', 'clipboard')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                    >
                      <span className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</span>
                    </button>
                  </div>

                  {/* PDF Format (Large Exports Only) */}
                  {meta.isLarge && (
                    <div>
                      <button
                        onClick={() => handlePdfExport('download')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                      >
                        <div className="font-medium">📄 Generate PDF</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Download PDF file</div>
                      </button>
                      <button
                        onClick={() => handlePdfExport('clipboard')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                      >
                        <span className="text-xs text-gray-500 dark:text-gray-400">Copy JSON structure</span>
                      </button>
                    </div>
                  )}

                  {/* Close Menu */}
                  <button
                    onClick={() => setShowDetailExportMenu(false)}
                    className="w-full text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Section */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
              Status
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Status
                </p>
                <p className="text-sm font-medium">
                  {isSuccess ? (
                    <span className="text-green-600 dark:text-green-400">
                      ✅ {run.status}
                    </span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">
                      ❌ {run.status}
                    </span>
                  )}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Duration
                </p>
                <p className="text-sm font-medium">
                  {run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : '—'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Started
                </p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatDate(run.startedAt)}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Finished
                </p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatDate(run.finishedAt)}
                </p>
              </div>
            </div>
          </section>

          {/* Validation Status */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
              Validation
            </h3>

            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {getValidationIcon(run.validationStatus)}
                </span>
                <div>
                  <p className={`text-sm font-medium ${getValidationColor(run.validationStatus)}`}>
                    {run.validationStatus
                      ? run.validationStatus.charAt(0).toUpperCase() +
                        run.validationStatus.slice(1)
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Request and response validation
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Request Summary */}
          {run.requestSummary && (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                Request Summary
              </h3>

              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words">
                  {run.requestSummary}
                </p>
              </div>
            </section>
          )}

          {/* Response Summary */}
          {run.responseSummary && (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                Response Summary
              </h3>

              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words">
                  {run.responseSummary}
                </p>
              </div>
            </section>
          )}

          {/* Error Information (for failed runs) */}
          {isFailed && run.lastError && (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                Error Details
              </h3>

              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold mb-2">
                  ERROR COUNT: {run.errorCount || 1}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-words">
                  {run.lastError}
                </p>
              </div>
            </section>
          )}

          {/* Debug Log */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                Debug Log
              </h3>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  ⬇ Export
                </button>

                {/* Export Menu */}
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-light-card dark:bg-dark-card border border-gray-200 dark:border-gray-700 z-10">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                        Export Format
                      </p>
                    </div>

                    {/* Text Format */}
                    <div className="border-b border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => handleExport('text', 'download')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 flex justify-between items-center"
                      >
                        <span>
                          <div className="font-medium">📄 Text Format</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Download .txt</div>
                        </span>
                      </button>
                      <button
                        onClick={() => handleExport('text', 'clipboard')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                      >
                        <span className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</span>
                      </button>
                    </div>

                    {/* JSON Format */}
                    <div className="border-b border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => handleExport('json', 'download')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 flex justify-between items-center"
                      >
                        <span>
                          <div className="font-medium">⚙️ JSON Format</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Download .json</div>
                        </span>
                      </button>
                      <button
                        onClick={() => handleExport('json', 'clipboard')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                      >
                        <span className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</span>
                      </button>
                    </div>

                    {/* Structured Format (for PDF) */}
                    <div className="border-b border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => handleExport('structured', 'download')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 flex justify-between items-center"
                      >
                        <span>
                          <div className="font-medium">📋 Report Format</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">For PDF export</div>
                        </span>
                      </button>
                      <button
                        onClick={() => handleExport('structured', 'clipboard')}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800"
                      >
                        <span className="text-xs text-gray-500 dark:text-gray-400">Copy to clipboard</span>
                      </button>
                    </div>

                    {/* Close Menu */}
                    <button
                      onClick={() => setShowExportMenu(false)}
                      className="w-full text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-black dark:bg-gray-950 border border-gray-700 dark:border-gray-800 font-mono text-xs text-green-400 space-y-1 h-48 overflow-y-auto">
              <div className="text-gray-500">
                [DEBUG] Run ID: {run.id}
              </div>
              <div className="text-gray-500">
                [DEBUG] Status: {run.status}
              </div>
              <div className="text-gray-500">
                [DEBUG] Started: {formatDate(run.startedAt)}
              </div>
              <div className="text-gray-500">
                [DEBUG] Finished: {formatDate(run.finishedAt)}
              </div>
              <div className="text-gray-500">
                [DEBUG] Duration: {run.durationMs ? `${run.durationMs}ms` : 'N/A'}
              </div>
              <div className="text-yellow-400">
                [INFO] Validation status: {run.validationStatus || 'unknown'}
              </div>
              {isFailed && (
                <div className="text-red-400">
                  [ERROR] {run.lastError || 'Unknown error'}
                </div>
              )}
              <div className="text-gray-500 mt-2">
                [DEBUG] End of run details
              </div>
            </div>
          </section>

          {/* Info Box */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              {SYMBOLS.INFO} Showing summary view. Full logs and detailed metrics coming in future phases.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-light-card dark:bg-dark-card border-t border-light-border dark:border-dark-border p-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
      </ModalContentErrorBoundary>
    </>
  )
}
