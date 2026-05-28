# Fix-Bug: Self-Healing TDD Workflow

Takes a bug description and drives it to a green test + PR. Never declare done until the test is green and the Stop hook unblocks.

## State file

Write `.claude/verification/active-test.json` at the start and keep it updated:

```json
{
  "test_file": "backend/tests/test_fix_<slug>.py",
  "test_command": "pytest backend/tests/test_fix_<slug>.py -v",
  "branch": "fix/<slug>",
  "status": "failing",
  "iteration": 0,
  "max_iterations": 20,
  "updated_at": 1234567890
}
```

The Stop hook reads this file — session termination is blocked while `status == "failing"`.

---

## STEP 1 — Identify scope

From the bug description:

- Which file contains the bug
- What the function currently does (broken)
- What it should do (correct)

Do NOT read files unrelated to the bug.

---

## STEP 2 — Write a failing test

Python (`backend/tests/test_fix_<slug>.py`):

```python
"""Regression test: <one-line bug description>"""
import pytest
from unittest.mock import patch, MagicMock

def test_<slug>_reproduces_bug():
    """Fails before fix, passes after."""
    # Arrange / Act / Assert
    assert False, "replace with real assertion"
```

JavaScript (`whatsapp-agent/tests/test_fix_<slug>.test.js`):

```js
describe("<slug>", () => {
  it("should <correct behavior>", () => {
    expect(true).toBe(false); // replace
  });
});
```

**Immediately run it and confirm it FAILS.** If it passes without a fix, the test doesn't reproduce the bug — rewrite.

```bash
# Python
cd backend && python -m pytest tests/test_fix_<slug>.py -v 2>&1

# JS
cd whatsapp-agent && npx jest tests/test_fix_<slug>.test.js 2>&1
```

---

## STEP 3 — Branch + commit the failing test

```bash
git checkout -b fix/<slug>
git add backend/tests/test_fix_<slug>.py
git commit -m "test: failing regression for <bug>"
```

Write `.claude/verification/active-test.json` with `"status": "failing", "iteration": 0`.

---

## STEP 4 — Fix loop (max 20 iterations)

Repeat until green:

```
1. Read the full failure output
2. Identify ONE minimal change in the source file (not the test)
3. Edit that ONE file
4. Run the test
5. Update active-test.json (iteration++, status)
6. If green → break. If stuck at iteration 10 → report and stop.
```

Rules: one file per iteration, never edit the test, always read failure before guessing.

---

## STEP 5 — Edge-case tests (only after green)

Add 3 tests to the same file covering boundary conditions. Run all 4 — all must pass.

---

## STEP 6 — Full regression suite

```bash
# Python
cd backend && python -m pytest . -v --tb=short 2>&1 | tail -40

# JS
cd whatsapp-agent && npx jest 2>&1 | tail -30
```

Fix any regressions before continuing.

---

## STEP 7 — Commit, update state, PR

Update `active-test.json`: `"status": "passing"`.

```bash
git add -A
git commit -m "fix: <description>\n\nCloses regression in <file>. 4 tests added."
git push -u origin fix/<slug>
```

Write PR description: bug, root cause, fix, tests added.
