import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import {
  CONTENT_DEFAULTS,
  CONTENT_GROUPS,
  getStoredSiteContent,
  saveSiteContent,
} from '@/lib/site-content.js';

/**
 * Storefront copy for the website editor.
 *
 * Returns the model, the shipped defaults and only the values an owner has
 * actually customised, so the editor can show which fields differ from the
 * original wording.
 */
export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'cms.manage' });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    const stored = await getStoredSiteContent(db);
    return NextResponse.json({ groups: CONTENT_GROUPS, defaults: CONTENT_DEFAULTS, stored });
  } catch (error) {
    return handleRouteError(error, 'Could not load the website content.');
  }
}

export async function PUT(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'cms.manage' });
    if (auth.error) return auth.error;

    const body = await request.json();
    const patch = body && typeof body === 'object' ? body.content : null;
    if (!patch || typeof patch !== 'object') {
      return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    }

    const db = Database.getInstance();
    const written = await saveSiteContent(db, patch);
    const stored = await getStoredSiteContent(db);
    return NextResponse.json({ success: true, saved: written.length, stored });
  } catch (error) {
    return handleRouteError(error, 'Could not save the website content.');
  }
}
