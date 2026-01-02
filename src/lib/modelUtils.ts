/**
 * AI Model utility functions for consistent labeling across the app
 */

export const AI_MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'Fast',
  'gpt-4o': 'Pro',
  'gpt-4-turbo': 'Balanced',
  'gpt-3.5-turbo': 'Economy',
};

/**
 * Get a user-friendly label for an AI model value
 * @param modelValue - The technical model value (e.g., 'gpt-4o-mini')
 * @returns The friendly label (e.g., 'Fast') or the original value if not found
 */
export function getModelLabel(modelValue: string | null | undefined): string {
  if (!modelValue) return 'Unknown';
  return AI_MODEL_LABELS[modelValue] || modelValue;
}
