'use client';

import { Suspense } from 'react';
import { Incidents } from '@/components/incidents/Incidents';

export default function Page() {
  return (
    <Suspense>
      <Incidents />
    </Suspense>
  );
}
