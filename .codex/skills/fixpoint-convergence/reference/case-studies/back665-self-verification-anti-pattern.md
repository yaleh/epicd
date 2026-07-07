# Case study: BACK-661/BACK-665 self-verification anti-pattern

## What happened

Immediately before this skill was extracted (same repo, epicd), a
Basic-task-sized piece of work — a fix (BACK-661) plus an AC5 implementation
slice of BACK-665 — was done entirely by the main session, inline, in an
ongoing conversation:

- No worktree was created.
- No independent implementation agent was dispatched.
- No independent fresh-context audit agent was dispatched.
- "Verification" consisted of the *same context that wrote the code* using a
  Playwright MCP browser tool and reading its own files back to confirm the
  change worked.

This is a live instance of exactly the anti-pattern
`context-isolation-plan.md` warns against: *"the main session's context
should only ever contain decisions and compressed facts, never process"*
(原文: 主会话的上下文里只应该出现决策和压缩后的事实，不应该出现过程). The
main session both implemented and verified — there was no independent set of
eyes with zero implementation memory.

## Why it happened despite the methodology being documented

There was no explicit trigger point forcing the question "should this be
dispatched instead?". The work arrived through ordinary conversational
momentum — "fix this prerequisite → while I'm at it, do this related AC" —
which is exactly the shape of request that slides past a
worktree-dispatch-first habit. Documenting a methodology does not, by
itself, install a checkpoint that fires during a normal back-and-forth
conversation; nothing about the flow of "let's just fix this" naturally
pauses to ask whether the fix should have gone through worktree+Agent
dispatch instead.

## Why this matters for scoring/trust

If this had been treated as a completed, audited unit of work (rather than
flagged as the anti-pattern it is), it would have silently lowered the bar
for what counts as "independently verified" without anyone noticing — the
same failure mode as the epic-driver self-audit in iteration-2, just at
Basic-task scale instead of Epic scale, and without even a plausible-looking
fake "two rounds" report to catch.

## Trigger heuristic to prevent recurrence

Before starting non-trivial `src/` work inside an ongoing conversation:

> Rule of thumb: if the expected diff is more than ~50 lines, explicitly ask
> "can this be delegated to an independent agent in a worktree?" If yes, it
> **must** go through worktree + Agent dispatch — it must not be done inline
> just because it is conversationally convenient in the moment.

This is deliberately a low bar (50 lines is small) because the failure mode
observed here is not "a huge feature snuck through inline" — it's exactly
the opposite: small, seemingly-innocuous, conversationally-adjacent work is
what slips past intent. The heuristic exists precisely to catch the cases
that don't feel large enough to trigger caution on their own.
