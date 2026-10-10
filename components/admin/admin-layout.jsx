'use client';

import { createContext, useContext } from 'react';
import AppShell from '@/components/erp/app-shell';

const AdminShellContext = createContext(false);

/** Route layouts own the shell; older page wrappers become no-ops inside it. */
export default function AdminLayout({ children }) {
  if (useContext(AdminShellContext)) return children;
  return <AppShell><AdminShellContext.Provider value={true}>{children}</AdminShellContext.Provider></AppShell>;
}
