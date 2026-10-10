'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

export function Input({ label, hint, error, className, id: providedId, ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const messageId = `${id}-message`;
  return <div className={cn('erp-input-field', className)}>
    {label && <label htmlFor={id}>{label}</label>}
    <input id={id} aria-invalid={!!error} aria-describedby={(error || hint) ? messageId : undefined} {...props} />
    {(error || hint) && <p id={messageId} role={error ? 'alert' : undefined}>{error || hint}</p>}
  </div>;
}
