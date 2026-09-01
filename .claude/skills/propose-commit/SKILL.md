---
name: propose-commit
description: Propose the commit message and ticket description for the finished task. Claude does not commit; the maintainer reviews and runs it.
disable-model-invocation: true
---

# Propose the commit

The maintainer commits, never you. Produce the text they will use, and stop.

1. **Verify first.** `git status --porcelain` and `git diff` (staged and unstaged). `npm run lint`
   and `npm run build` must have passed — if they have not run this session, run them and report
   the real output. Never propose a commit for work you have not seen pass.
2. **Take the message from the card.** The `_Commit_` line in this branch's `docs/TASKS.md` card is
   the message. Use it verbatim unless the delivered scope diverged; if it did, say so, propose the
   corrected message, and explain the divergence in one line.
3. **English, conventional commits.** `type(scope): imperative summary`, no trailing period.
4. **Output exactly two blocks:**
   - The `git commit` command, ready to paste, message included.
   - The ticket description: what changed, what the acceptance check showed, and any `ponytail:`
     shortcut left in the diff (`grep -rn "ponytail:" src tools`) or Follow-up row it earned.
5. Flag anything the pre-commit hook will reject (an env file in the diff) before they run it.
