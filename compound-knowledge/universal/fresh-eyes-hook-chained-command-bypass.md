# Fresh-Eyes PreToolUse Hook Bypassed by Chained Commands

## Gotcha

The PreToolUse hook that blocks `git commit` until fresh-eyes-review completes uses a regex anchored to the start of the command:

```bash
if echo "$CMD" | grep -qE "^git\\s+commit"; then
```

Any chained command bypasses the check:

```bash
git add file.ts && git commit -m "message"   # starts with "git add", not "git commit"
git add . && git commit -m "message"          # same bypass
```

The hook silently passes because `^git\s+commit` never matches. No warning, no error. Every commit in the session went through unchecked.

## Fix

Drop the `^` anchor so the regex matches `git commit` anywhere in the command:

```bash
if echo "$CMD" | grep -qE "git\\s+commit"; then
```

## Tags

hooks, git, fresh-eyes-review, security, pre-commit
