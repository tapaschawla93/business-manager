/**
 * Shared backdrop for Dialog, Sheet, AlertDialog — commercial polish: blur + softer dim.
 */
export const radixOverlayClassName =
  'fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';
