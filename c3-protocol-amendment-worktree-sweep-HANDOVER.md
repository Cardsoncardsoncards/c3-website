# Protocol amendment for sync: worktree sweep in every Section 0 environment check

**Status: PROPOSED, not applied. This is a handover file, not an edit.**

Task 25 Piece 3 asked for this to be added to the protocol. It is delivered here rather than
written into `c3-master-audit-protocol-v1.md` because that file's own Section 1 point 5 says:

> "Only Claude.ai writes to this protocol, Claude Code only reads it, so nothing in the repo's
> copy updates on its own the way the register does. Point 4 does not apply here. When this
> document changes, Claude.ai hands over the full file and Sammy feeds it to Claude Code as an
> explicit sync."

Claude Code editing the protocol directly would break the one rule that exists to keep that
document from drifting, and it has already broken three task files once by drifting. So: take the
text below to Claude.ai, have it fold the amendment into the master copy, and hand the full file
back for a sync the same way the original seed landed. Task 25's own wording asks for exactly
this, "a real sync, not committed silently to the repo copy alone".

The task file's instruction to state the reasoning in the protocol text itself is honoured: the
justification is written into the rule rather than left in a commit message.

---

## Proposed addition to Section 1, as point 6

**6. Every task's Section 0 environment check includes a worktree sweep, added 6 August 2026.**
`git worktree list` is run as part of the standard environment check, alongside `pwd`,
`git branch --show-current` and `git fetch origin`. For every worktree that is not the current
task's own, the check is **a brief read of what is actually in it**, meaning its uncommitted
changes or its diff against `main`, not a note that it exists.

**The reasoning, stated here rather than assumed, because this rule was written from a specific
failure.** On 6 August 2026 a task read one unfamiliar worktree and found another session's
work in progress: a shared module, four modified functions, and **a SQL migration that had
already been applied to the live database while its code existed only as uncommitted files**.
Had that worktree been cleared, the schema would have survived with nothing referencing it.
A sweep the following task then found a **third** worktree holding **282 unpublished blog posts
and 61,219 lines**, which this programme's own findings register had been describing for two days
as, in full, "presumed to belong to another session". It had never been opened. Both are recorded
as C3L-99 and C3L-100.

Three specific things the read is looking for, in order of how badly each one bites:

- **Live database changes with uncommitted code.** A migration applied while its code sits
  unpushed is the sharpest version, because the database moves ahead of `main` and nothing in the
  repo records that it did.
- **Overlap with work already resolved, already planned, or already running elsewhere.** The
  blog worktree carried two `pNNN` numbering collisions against `main` that are trivial to fix
  before a merge and awkward afterwards.
- **Provenance.** Whether the work cites a `C3L-` ID or a task number at all. Neither worktree
  found on 6 August cited either, which is why neither was visible to the register.

**This is a read, not a takeover.** Nothing in a worktree the current task does not own is
committed, modified or deleted. The output is a register entry describing it, and a flag if it
overlaps something already in flight.

**One consequence worth naming, because it changes what "up to date" means.** More than one
session now pushes to `main` using the same `C3 Team` git identity. On 6 August a second session's
commit landed on top of an in-progress task's commits mid-task and rebased cleanly. So
`git fetch origin` confirming `main` is up to date is a statement about **this instant**, not about
the duration of the task, and a task that pushes an hour later should re-check rather than trust
the opening check.

---

## Suggested Section 20 revision-log line

- 6 August 2026: Section 1 point 6 added, worktree sweep in every Section 0 environment check.
  Written after a task found another session's migration applied to the live database with its
  code uncommitted, and a follow-up sweep found a third worktree holding 282 unpublished blog
  posts that the findings register had recorded only as a one-line presumption. C3L-99, C3L-100.
