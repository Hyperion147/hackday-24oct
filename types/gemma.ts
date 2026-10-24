export interface RemediationStep {
  title: string
  description: string
  codeSnippet?: string
  priority: 'immediate' | 'short-term' | 'long-term'
}

export interface GemmaDiagnosis {
  summary: string
  rootCause: string
  blastRadiusExplanation: string
  remediationSteps: RemediationStep[]
  guardrailRecommendation: string
}
