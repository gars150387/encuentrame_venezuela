const { NextResponse } = require('next/server');
const { localizeReport } = require('../../../../../lib/repository');
const { enforceRateLimit } = require('../../../../../lib/rate-limit');

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function POST(request, { params }) {
  const rate = await enforceRateLimit(request, { scope: 'localize-report', limit: 20, duration: '1 m' });
  if (!rate.success) return jsonError('rate_limited', 429);

  try {
    const body = await request.json();
    const localizedByName = String(body.localizedByName || '').trim();
    const localizedByPhone = String(body.localizedByPhone || '').trim();
    const localizedNote = String(body.localizedNote || '').trim();
    const localizedReportedBy = String(body.localizedReportedBy || request.headers.get('x-client-id') || '').trim();

    if (!localizedByName || !localizedByPhone) {
      return jsonError('missing_contact', 400);
    }

    const updated = await localizeReport({
      reportId: params.id,
      localizedByName,
      localizedByPhone,
      localizedNote,
      localizedReportedBy,
      sourceIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    if (!updated) return jsonError('not_found', 404);
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error.message || 'localize_failed', error.status || 500);
  }
}

module.exports = { POST };
