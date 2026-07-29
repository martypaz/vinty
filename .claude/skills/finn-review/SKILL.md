---
name: finn-review
description: Review open PRs against their linked Linear issues and required GitHub checks, then post a three-group verdict with Finn-loop labels. Auto-merges a PR only when the verdict is clean and required CI checks passed. Use when asked to run Finn-loop's reviewer or review its PR queue. Designed for /loop; never pushes code, and never merges outside the exact clean-approval case below.
---

# Finn-loop reviewer

One pass = one PR reviewed. Under `/loop`, each iteration runs this skill once.

## 1. Find a PR needing review

```bash
gh pr list --state open --json number,title,labels,isDraft,headRefOid,updatedAt,url
```

Skip drafts. For each PR, find the latest comment whose first line is
`Finn-loop review of COMMIT_SHA`.

Skip a PR when that recorded SHA equals its current `headRefOid` and it already
has `loop-approved`, `loop-changes-requested`, or `needs-human-review`. Review
it again when new commits landed after the recorded SHA. If nothing needs
review, say so and end the pass.

## 2. Read the contract and code

- Parse the linked issue identifier from `Closes MAR-NNN` in the PR body and
  fetch the full Linear issue, including comments and relations. No linked
  issue is a must-fix finding.
- Read the full diff and every changed file in context.
- Review only against the linked issue: acceptance-criteria gaps, defects,
  broken data flow, unnecessary scope expansion, security problems, missing
  loading/error states, and code future agents will struggle to modify.
- Do not suggest unrelated improvements unless they are severe.

Every must-fix code finding starts with one of:

- `[AC-N]` — the PR does not satisfy that acceptance criterion
- `[DEFECT]` — the implementation is broken while staying inside scope
- `[SECURITY]` — a severe security issue blocks shipping
- `[CI]` — a required GitHub check failed

Non-goals are binding. If fixing a finding would require behavior excluded by
an `NG-N`, do not prescribe code. Record
`[SCOPE-CONFLICT AC-N ↔ NG-N]` with the exact contradiction and mark the PR for
human escalation.

## 3. Check merge evidence

Inspect the current PR head, mergeability, and required checks:

```bash
gh pr view NUMBER --json headRefOid,mergeable,mergeStateStatus
gh pr checks NUMBER --required --json bucket,name,state,link
```

- If required checks are pending or mergeability is still unknown, report that
  the PR is waiting and end without posting a verdict or changing labels. A
  later loop pass will retry it.
- Failed required checks are `[CI]` must-fix findings.
- A merge conflict is a `[DEFECT]` must-fix finding.
- If the repository has no required checks, mark the PR for human escalation;
  do not apply `loop-approved`. Finn-loop does not treat missing CI as green.

Review the exact `headRefOid` used for this evidence. Re-fetch it immediately
before posting and again immediately before merging in step 5. If it changed
at either point, discard the review and start again on a future pass.

## 4. Post one verdict

Post one comment in this structure:

```md
Finn-loop review of COMMIT_SHA

CI: required checks passed | failed | not configured
Mergeability: clean | conflicting

## Review

Summary: one or two plain-language sentences on what this PR does.

## 1. Must fix before merge

None.

## 2. Should fix soon

None.

## 3. Safe to merge

Yes — automated review evidence is complete. Merging automatically.
```

If the verdict is not clean (must-fix findings, scope conflict, or missing
required CI), write "No — human decision required" or "No — fix required"
as appropriate instead, matching the label set in the next section.

Then set labels based on the verdict, checking existing labels before removing
them so an absent label does not fail the command:

- No must-fix and no new escalation: add `loop-approved`; remove
  `loop-changes-requested`. Preserve a pre-existing `needs-human-review` label
  because it may represent a separate high-risk human gate.
- Must-fix present: add `loop-changes-requested`; remove `loop-approved`.
- Scope conflict or no required CI: add `needs-human-review`; remove both
  `loop-approved` and `loop-changes-requested`; set "Safe to merge" to
  `No — human decision required.`

The escalation path deliberately leaves the automated repair queue. A human
must resolve the reason, change the issue or repository configuration as
needed, and remove `needs-human-review` before Finn-loop reviews that unchanged
commit again.

## 5. Merge (only on a clean approval)

Auto-merge is the exception, not the default. Merge now only if **every**
condition holds:

- The verdict just posted has no must-fix findings and no scope conflict
  (the `loop-approved` case).
- The PR does not carry a pre-existing `needs-human-review` label — that
  label is a separate human gate this pass does not have context to lift,
  even if this review pass found nothing wrong.
- Required CI checks are present and passed (never merge when the repo has
  no required checks — that case already routes to `needs-human-review` in
  step 4).
- `mergeStateStatus` is `clean`.
- Re-fetching `headRefOid` right now still matches the SHA this verdict was
  posted against — if it changed, stop, do not merge, and let a future pass
  review the new commit instead.

If all of that holds:

```bash
gh pr merge NUMBER --merge --delete-branch
```

Comment the outcome on the Linear issue only if the merge command itself
fails (e.g. another process merged or closed it first, or branch protection
rejected it) — report that plainly and do not retry within this pass. On a
successful merge, no separate Linear update is needed: the Linear-GitHub
integration moves the issue automatically.

If any condition above does not hold, do not merge. This is the normal case
for `loop-changes-requested` and `needs-human-review` verdicts, and the pass
ends after labeling as described in step 4.

## 6. Hard limits

- Auto-merge happens in exactly the case described in step 5 — nowhere else.
  A clean verdict alone is not enough; every condition in step 5 must hold.
- Never push commits to the PR branch.
- Never approve or request changes through a formal GitHub review. Use one
  comment plus labels because the loop may run on the PR author's token and
  GitHub rejects self-reviews.
- `loop-approved` together with a successful merge in the same pass is this
  system's actual merge authorization for that PR — everything before that
  point (findings, CI evidence, mergeability) is what justifies it, so do
  not shortcut steps 2-3 to reach step 5 faster.
