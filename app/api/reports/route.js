const { NextResponse } = require('next/server');
const { createReport, listReports } = require('../../../lib/repository');
const { enforceRateLimit } = require('../../../lib/rate-limit');

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function GET(request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 25);
    const offset = Number(url.searchParams.get('offset') || 0);
    const status = url.searchParams.get('status') || 'all';
    const q = url.searchParams.get('q') || '';
    const payload = await listReports({ limit, offset, status, q });
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(error.message || 'list_failed', 500);
  }
}

async function POST(request) {
  const rate = await enforceRateLimit(request, { scope: 'create-report', limit: 12, duration: '1 m' });
  if (!rate.success) return jsonError('rate_limited', 429);

  try {
    const formData = await request.formData();
    const fields = Object.fromEntries(
      ['nombre', 'apellidos', 'telefono', 'relacion', 'ultimaVez', 'direccion', 'edad', 'documento', 'señas', 'allowDuplicate', 'clientId'].map((key) => [key, formData.get(key)]),
    );
    const photos = formData.getAll('photos').filter((file) => file instanceof File && file.size > 0);

    const created = await createReport({
      fields,
      photos,
      clientId: String(fields.clientId || ''),
      sourceIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
      allowDuplicate: String(fields.allowDuplicate || '') === 'true',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error.status === 400) return jsonError(error.message, 400, { errors: error.details || [] });
    if (error.status === 409) return jsonError('duplicate', 409);
    if (error.message === 'supabase_not_configured') return jsonError('supabase_not_configured', 500);
    return jsonError(error.message || 'create_failed', 500);
  }
}

module.exports = { GET, POST };
