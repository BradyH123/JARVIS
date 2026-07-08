'use strict';

/**
 * Self-diagnosis — where is JARVIS struggling most?
 *
 * Combines two signals JARVIS already records on the user's machine:
 *   1. TELEMETRY — every run's kind + status + error (lib/telemetry.js). Low
 *      success-rate kinds and recurring errors are objective struggle signals.
 *   2. CONVERSATION LOGS — what the user actually said. Complaints ("doesn't
 *      work", "still", "can't", "fix") clustered by topic tell us where the
 *      human keeps hitting friction, which telemetry alone can miss.
 *
 * Pure functions (no fs/Electron) so the caller injects the data and this stays
 * unit-testable.
 */

// Topic buckets — each is a set of signals we scan complaint lines for. The
// order is the reporting order.
const TOPICS = [
  { key: 'acting & reporting', re: /\b(doesn'?t (actually |really )?(do|act|go|tell|report)|never acts?|just (says|opens|reads)|says (done|one sec|standing by|completed)|didn'?t (do|report|tell)|report back|actually (do|go|act|enter)|only (reads|opens)|tell me (anything|nothing)|and doesn'?t (tell|do|act)|without (doing|acting|reporting)|go out and (do|act))\b/i },
  { key: 'clicking & navigation', re: /\b(can'?t click|miss(es|ed)? (the )?click|click(s|ing)? (wrong|off)|navigat|enter the site|goes? to google|address bar)\b/i },
  { key: 'reading the screen/page', re: /\b(read (the )?(whole|full|page|screen)|doesn'?t read|can'?t (see|read)|truncat|only.*visible)\b/i },
  { key: 'voice & listening', re: /\b(voice|listen|hear|speak|transcri|microphone|stt|whisper)\b/i },
  { key: 'opening/closing apps', re: /\b(open (ableton|the app)|close .*app|quit|spotlight|isn'?t running|launch)\b/i },
  { key: 'routing / understanding intent', re: /\b(hijack|wrong (thing|command)|misunderstood|thinks? (it'?s|i)|overthink|file search|searched? my files)\b/i },
  { key: 'crashes & errors', re: /\b(crash|error|something went wrong|broke|broken|failed|exception|stuck|frozen|hang)\b/i },
  { key: 'memory & self-awareness', re: /\b(memory|remember|forgot|self.?aware|doesn'?t know (itself|who))\b/i },
];

// Words that mark a line as the user reporting a PROBLEM (vs a neutral command).
const COMPLAINT = /\b(doesn'?t|didn'?t|don'?t|can'?t|cannot|won'?t|isn'?t|not working|no longer|still (not|doesn|can|isn)|broke|broken|fix|wrong|fail|error|struggl|problem|issue|bug|slow|stuck|frozen|overthink)\b/i;

/**
 * Analyze struggle signals.
 * @param {object} input
 * @param {object} [input.telemetry]  telemetry.summary() shape: { total, successRate, kinds:[{kind,count,successRate,avgMs}], topErrors:[{error,count}] }
 * @param {string[]} [input.conversationLines]  recent conversation lines (any speaker)
 * @returns {{weakestKinds:Array, topErrors:Array, complaintTopics:Array, complaints:number, summary:string}}
 */
function analyze(input = {}) {
  const t = input.telemetry || {};
  const kinds = Array.isArray(t.kinds) ? t.kinds : [];

  // Weakest capabilities: lowest success rate first, but only those with enough
  // runs to be meaningful and a real failure rate.
  const weakestKinds = kinds
    .filter((k) => k.count >= 2 && k.successRate != null && k.successRate < 100)
    .sort((a, b) => a.successRate - b.successRate || b.count - a.count)
    .slice(0, 6)
    .map((k) => ({ kind: k.kind, successRate: k.successRate, count: k.count, avgMs: k.avgMs }));

  const topErrors = (Array.isArray(t.topErrors) ? t.topErrors : []).slice(0, 6);

  // Complaint mining: only lines the user framed as a problem, bucketed by topic.
  const lines = (input.conversationLines || []).filter((l) => COMPLAINT.test(l));
  const counts = new Map();
  const examples = new Map();
  for (const line of lines) {
    for (const topic of TOPICS) {
      if (topic.re.test(line)) {
        counts.set(topic.key, (counts.get(topic.key) || 0) + 1);
        if (!examples.has(topic.key)) examples.set(topic.key, String(line).replace(/\s+/g, ' ').trim().slice(0, 140));
      }
    }
  }
  const complaintTopics = [...counts.entries()]
    .map(([topic, count]) => ({ topic, count, example: examples.get(topic) || '' }))
    .sort((a, b) => b.count - a.count);

  // Build a short natural summary of the single biggest struggle.
  let summary = '';
  const worstTopic = complaintTopics[0];
  const worstKind = weakestKinds[0];
  const bits = [];
  if (worstTopic) bits.push(`Most friction is around "${worstTopic.topic}" (${worstTopic.count} mention${worstTopic.count === 1 ? '' : 's'})`);
  if (worstKind) bits.push(`lowest success rate is ${worstKind.kind} at ${worstKind.successRate}% over ${worstKind.count} runs`);
  if (topErrors[0]) bits.push(`most common error: "${String(topErrors[0].error).slice(0, 80)}" (${topErrors[0].count}×)`);
  summary = bits.length ? bits.join('; ') + '.' : 'Not enough data yet to spot a clear struggle.';

  return { weakestKinds, topErrors, complaintTopics, complaints: lines.length, summary };
}

/** Render the analysis to a compact, human-readable report. */
function report(a) {
  const lines = ['Where I struggle most:', '', a.summary, ''];
  if (a.complaintTopics.length) {
    lines.push('By how often you flagged it:');
    for (const c of a.complaintTopics) lines.push(`  • ${c.topic} — ${c.count}×${c.example ? `  (e.g. "${c.example}")` : ''}`);
    lines.push('');
  }
  if (a.weakestKinds.length) {
    lines.push('Lowest success rates (from my telemetry):');
    for (const k of a.weakestKinds) lines.push(`  • ${k.kind}: ${k.successRate}% over ${k.count} runs${k.avgMs != null ? ` (~${(k.avgMs / 1000).toFixed(1)}s avg)` : ''}`);
    lines.push('');
  }
  if (a.topErrors.length) {
    lines.push('Most common errors:');
    for (const e of a.topErrors) lines.push(`  • (${e.count}×) ${String(e.error).slice(0, 120)}`);
  }
  return lines.join('\n').trim();
}

module.exports = { analyze, report, TOPICS };
