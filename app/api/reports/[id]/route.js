const { NextResponse } = require('next/server');
const { getReportById, setReportStatus } = require('../../../../lib/repository');

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function GET(_request, { params }) {
  try {
    const report = await getReportById(params.id);
    if (!report) return jsonError('not_found', 404);
    return NextResponse.json(report);
  } catch (error) {
    return jsonError(error.message || 'read_failed', 500);
  }
}

async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const status = String(body.status || '').trim();
    const adminToken = process.env.ADMIN_TOKEN || '';
    const headerToken = request.headers.get('x-admin-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';

    if (!adminToken || headerToken !== adminToken) {
      return jsonError('forbidden', 403);
    }

    const updated = await setReportStatus({
      reportId: params.id,
      status,
      actorId: 'admin',
      sourceIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    if (!updated) return jsonError('not_found', 404);
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error.message || 'update_failed', error.status || 500);
  }
}

module.exports = { GET, PATCH };
