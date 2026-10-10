'use client';
import {AuthProvider} from '@/lib/auth-context';
import {CalendarSystemProvider} from '@/lib/calendar-context.jsx';
import {ToastProvider} from '@/components/ui/toast';
import {ConfirmProvider} from '@/components/ui/confirm';
export default function StaffProviders({children}){
  return <AuthProvider><CalendarSystemProvider><ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider></CalendarSystemProvider></AuthProvider>;
}
