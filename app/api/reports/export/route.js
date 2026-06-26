const { NextResponse } = require('next/server');
const { exportReports } = require('../../../../lib/repository');

async function GET() {
  try {
    const items = await exportReports();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'export_failed' }, { status: 500 });
  }
}

module.exports = { GET };
