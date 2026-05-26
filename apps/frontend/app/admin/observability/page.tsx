import { Suspense } from 'react';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

export default function ObservabilityPage() {
  return (
    <div className="flex flex-col h-full max-w-7xl mx-auto w-full px-4 py-6">
      <Suspense>
        <AdminDashboard />
      </Suspense>
    </div>
  );
}
