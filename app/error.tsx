'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side logs keep the stack; the client only shows a safe summary.
    console.error('[faunal]', error?.message);
  }, [error]);

  return (
    <div className="grid min-h-[70vh] place-items-center px-6 py-16">
      <div className="max-w-[560px] text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-2)]">
          <Icon name="alert" size={22} />
        </span>
        <h1 className="h2 mt-5">Something broke on our side</h1>
        <p className="lede mt-3">
          The compliance engine refuses to guess, so a failed check stops the action rather than completing it. Try again — if it keeps happening, tell us
          the reference below.
        </p>
        {error?.digest ? <p className="mono mt-4 text-[12px] text-[var(--muted)]">reference {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn" onClick={reset}>
            Try again
          </button>
          <Link href="/report" className="btn btn-quiet">
            Report the problem
          </Link>
        </div>
      </div>
    </div>
  );
}
