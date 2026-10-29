---
name: post-scorer
description: Score a LinkedIn post against Zain's best-post patterns and voice rules. Returns a yes/no publish verdict and a list of fixes.
---

# Post Scorer - Linkedin

Score a drafted LinkedIn post before it goes out. Runs the same checks as
tools/caption_gate.py plus editorial judgment against previous best posts.

## Score out of 100, weighted

- Hook (25): Does line 1 stop the scroll? Read whole on mobile, under 55 chars?
- Voice (25): Does it match voice.md? Pass the banned-word and em-dash checks?
- Substance (20): Real specifics, a number, a story, or a named tool? Not vague?
- Structure (15): Short lines, one idea per line, ends with a question?
- Niche fit (15): Web3/DLT/DeFi/agent topic? Not generic LinkedIn filler?

## Verdict thresholds

- 85+ PASS. Ready to post.
- 70-84 CONDITIONAL. Fix the named issues, re-score.
- under 70 FAIL. Return to post-writer with the reasons.

## Output

For each failed check, give the exact problem line and the fix. NEVER rewrite
the post unless asked. Verdict first, then a numbered list of failures.