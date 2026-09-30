import { EmptyState } from '@/components/ui/EmptyState';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="space-y-md">
      <h1 className="text-heading font-semibold">{title}</h1>
      <EmptyState title={title} description="Placeholder - this screen is built from day 2." />
    </section>
  );
}
