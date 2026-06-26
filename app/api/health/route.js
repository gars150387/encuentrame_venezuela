const { NextResponse } = require('next/server');

function GET() {
  return NextResponse.json({ ok: true, status: 'ready', ts: new Date().toISOString() });
}

module.exports = { GET };
