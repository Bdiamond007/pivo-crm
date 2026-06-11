// ============================================================================
// Design tokens for the Support Portal.
// Premium, minimalist, black/white SaaS aesthetic (distinct from the CRM's
// dark-navy theme, which lives untouched under /crm).
// ============================================================================

export const T = {
  // Surfaces
  bg: '#FFFFFF',
  bgSubtle: '#FAFAFA',
  panel: '#FFFFFF',
  ink: '#0A0A0A',          // near-black primary
  inkSoft: '#404040',
  muted: '#6B7280',
  faint: '#9CA3AF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  // Accents (used sparingly)
  accent: '#0A0A0A',       // black is the brand accent
  brand: '#5B5BD6',        // single indigo highlight for AI moments
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#2563EB',

  // Sentiment palette
  sentiment: {
    positive: '#059669',
    neutral: '#6B7280',
    frustrated: '#D97706',
    angry: '#DC2626',
  } as Record<string, string>,
}

export const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');"

export const SANS = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
export const MONO = "'JetBrains Mono', ui-monospace, monospace"

export const statusColor: Record<string, string> = {
  open: T.info,
  pending: T.warning,
  escalated: T.danger,
  resolved: T.success,
  closed: T.faint,
}

export const priorityColor: Record<string, string> = {
  low: T.faint,
  normal: T.muted,
  high: T.warning,
  urgent: T.danger,
}
