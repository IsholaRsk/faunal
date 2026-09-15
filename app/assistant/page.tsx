import type { Metadata } from 'next';
import { appData } from '@/lib/ui/server';
import { featured } from '@/repo/catalog';
import { DesktopAssistant } from '@/components/desktop/assistant';
import { MobileAssistant } from '@/components/mobile/assistant';
import { pageMeta } from '@/lib/ui/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Ask the FAUNAL assistant',
  description: 'Plain-language help finding an animal you can legally keep — grounded in the compliance rulebook.',
  path: '/assistant',
}) as Metadata;

export default function AssistantPage() {
  const { user, experience } = appData();
  const cards = featured(8) as never;
  return experience === 'mobile' ? (
    <MobileAssistant stateCode={user?.jurisdictionCode ?? null} cards={cards} />
  ) : (
    <DesktopAssistant stateCode={user?.jurisdictionCode ?? null} cards={cards} />
  );
}
