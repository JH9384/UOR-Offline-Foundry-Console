import React from 'react';
import ConsoleApp from './shared/App';

/**
 * Windmill Full-Code App frontend entrypoint (`uor_foundry.raw_app`).
 * Consumes the staged shared Studio library (`./shared/App`, synced from `src/shared/`
 * via `npm run windmill:prepare`) with zero dependency on the primary Vite entrypoint (`src/main.tsx`),
 * zero parent-directory imports, zero duplicated business logic, and zero embedded credentials.
 *
 * Local `wmill app dev` builds bundle this entrypoint alongside generated `./wmill.ts`.
 */
export function WindmillPackagedApp(): React.ReactElement {
  return <ConsoleApp />;
}

export default WindmillPackagedApp;
