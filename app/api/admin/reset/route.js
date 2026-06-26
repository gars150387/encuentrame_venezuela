const { NextResponse } = require('next/server');
const { resetReports } = require('../../../../lib/repository');

async function POST(request) {
  const adminToken = process.env.ADMIN_TOKEN || '';
  const headerToken = request.headers.get('x-admin-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';

  if (!adminToken || headerToken !== adminToken) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const items = await resetReports();
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'reset_failed' }, { status: 500 });
  }
}

module.exports = { POST };
