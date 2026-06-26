const { NextResponse } = require('next/server');
const { voteOnReport } = require('../../../../../lib/repository');
const { enforceRateLimit } = require('../../../../../lib/rate-limit');

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function POST(request, { params }) {
  const rate = await enforceRateLimit(request, { scope: 'vote-report', limit: 30, duration: '1 m' });
  if (!rate.success) return jsonError('rate_limited', 429);

  try {
    const body = await request.json();
    const voterId = String(body.voterId || request.headers.get('x-client-id') || '').trim();
    const vote = String(body.vote || '').trim();
    const voted = await voteOnReport({
      reportId: params.id,
      vote,
      voterId,
      sourceIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    if (!voted) return jsonError('not_found', 404);
    return NextResponse.json(voted);
  } catch (error) {
    return jsonError(error.message || 'vote_failed', error.status || 500);
  }
}

module.exports = { POST };
