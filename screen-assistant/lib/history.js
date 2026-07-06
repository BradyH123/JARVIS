'use strict';

/**
 * Conversation-history helpers for the agent loop. Kept dependency-free so they
 * can be unit-tested without the Anthropic SDK.
 */

/**
 * Walk messages newest→oldest and replace every image block beyond the newest
 * `keep` with a short text stub. Mutates in place and returns the count of
 * images that were pruned. Screenshots dominate the token bill, so on a long
 * run this is the difference between ~O(n²) and ~O(n) image tokens.
 */
function pruneOldImages(messages, keep) {
  let seen = 0;
  let pruned = 0;
  const stub = { type: 'text', text: '[earlier screenshot omitted]' };
  for (let m = messages.length - 1; m >= 0; m--) {
    const content = messages[m] && messages[m].content;
    if (!Array.isArray(content)) continue;
    for (let b = content.length - 1; b >= 0; b--) {
      const block = content[b];
      if (!block) continue;
      if (block.type === 'image') {
        seen += 1;
        if (seen > keep) {
          content[b] = { ...stub };
          pruned += 1;
        }
      } else if (block.type === 'tool_result' && Array.isArray(block.content)) {
        for (let i = block.content.length - 1; i >= 0; i--) {
          if (block.content[i] && block.content[i].type === 'image') {
            seen += 1;
            if (seen > keep) {
              block.content[i] = { ...stub };
              pruned += 1;
            }
          }
        }
      }
    }
  }
  return pruned;
}

module.exports = { pruneOldImages };
