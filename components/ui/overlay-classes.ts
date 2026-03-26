/**
 * Shared backdrop for Dialog, Sheet, AlertDialog — keeps overlay visuals in one place (Phase C).
 */
export const radixOverlayClassName =
  'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';
