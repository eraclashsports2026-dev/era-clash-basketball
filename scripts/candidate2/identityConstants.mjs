// Re-exported for the change manifest so the recorded coefficients cannot drift
// from the ones the engine actually uses without the manifest hash moving.
export const ASSIST_IDENTITY_FOR_MANIFEST = Object.freeze({ ballMovement: 0.030, motion: 0.020, isolation: 0.014 });
