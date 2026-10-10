'use client';

// Staff and cart screens show this while they load. The public storefront has
// no loading boundary on purpose: it renders complete, and a missing page can
// still answer with a real 404 status.
export default function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center p-8 text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
