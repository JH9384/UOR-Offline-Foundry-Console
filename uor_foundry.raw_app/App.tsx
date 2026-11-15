import React from 'react';
import ConsoleApp from '../src/App';

/**
 * Windmill Full-Code App frontend entrypoint (`uor_foundry.raw_app`).
 * Reuses the primary Studio workspace (`src/App.tsx`) with zero duplicated business logic
 * and zero embedded credentials.
 *
 * Local `wmill app dev` builds bundle this entrypoint alongside generated `./wmill.ts`.
 */
export function WindmillPackagedApp(): React.ReactElement {
  return <ConsoleApp />;
}

export default WindmillPackagedApp;
