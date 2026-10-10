import { NextResponse } from 'next/server';
import { saveProductImage } from '@/lib/uploads';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';

export const runtime = 'nodejs';

/**
 * POST /api/uploads/products
 * multipart form field: "file" or "image"
 * Returns: { url: "/api/media/products/..." }
 */
export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'catalog.manage' });
    if (auth.error) return auth.error;

    const form = await request.formData();
    const file = form.get('file') || form.get('image');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 });
    }

    const url = await saveProductImage(file);
    return NextResponse.json({ url, image_url: url });
  } catch (error) {
    if (error?.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleRouteError(error, 'Failed to upload image');
  }
}
