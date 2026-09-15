import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { featured } from '@/repo/catalog';
import { money } from '@/lib/ui/screen-helpers';

export default function NotFound() {
  const rows = featured(3) as unknown as Record<string, string | number | null>[];
  return (
    <div className="shell grid min-h-[70vh] items-center py-14">
      <div className="max-w-[620px]">
        <p className="eyebrow">404</p>
        <h1 className="h1 mt-2">This page does not exist — yet.</h1>
        <p className="lede mt-3">
          The listing may have been sold, withdrawn, or frozen by the compliance desk. Those pages are removed rather than left dangling.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/animals" className="btn">
            Browse animals
          </Link>
          <Link href="/search" className="btn btn-quiet">
            <Icon name="search" size={16} /> Search
          </Link>
          <Link href="/compliance" className="btn btn-ghost">
            How legality works
          </Link>
        </div>

        {rows.length ? (
          <div className="mt-10 grid grid-cols-3 gap-4">
            {rows.map((r) => (
              <Link key={String(r.id)} href={`/animals/${String(r.slug)}`} className="group-card flex items-center gap-3 p-3">
                <span className="h-12 w-12 shrink-0 rounded-lg bg-[var(--surface-2)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{String(r.name)}</span>
                  <span className="block text-[12px] text-[var(--muted)]">{money(Number(r.price_cents))}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
