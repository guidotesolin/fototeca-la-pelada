---
name: task
description: Start a task card from docs/TASKS.md (e.g. /task T7). Branches off main, loads ARCHITECTURE.md and that one card, invokes ponytail.
disable-model-invocation: true
---

# Start a task card

The argument is a card ID (`T7`) or a branch name (`t7-photo-detail`). Without one, print the
board's pending rows from `docs/TASKS.md` and stop.

1. **Read the card.** `docs/TASKS.md`: the board row (its `Depends on`) and the `### T<n>` section
   — scope, acceptance, `_Commit_`. Read `docs/ARCHITECTURE.md` in full. Those two documents plus
   the card are the brief; do not carry assumptions from another card.
2. **Check dependencies.** If a card it depends on is not marked done, say so and stop.
3. **Branch.** `git switch main && git pull && git switch -c <branch>` using the board's branch
   name. If the tree is dirty, stop and report it — do not stash.
4. **Invoke ponytail** (`Skill: ponytail:ponytail`) before writing any code.
5. **If the task touches Next.js code**, get the API facts from the `next16-docs` subagent, not
   from memory. Next 16 breaks training data; `AGENTS.md` is not optional here.
6. **Build to the card's acceptance criteria**, not beyond them. Deliberate shortcuts get a
   `ponytail:` comment naming the ceiling and the way out.
7. **Verify** against the `_Acceptance_` line, running the commands. Then `npm run lint` and
   `npm run build`. Report what actually ran and what it printed.
8. **Do not commit.** Finish with `/propose-commit`.
