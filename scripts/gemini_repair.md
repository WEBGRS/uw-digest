# UW Digest editor run: fix validation errors

Today is {DATE}. This is an unattended batch job. Skip the session-start routine from global rules (no CLAUDE.md/MEMORY.md reading, no memories, no canary line). Do not run shell commands. Use view_file with line ranges for long files.

The file you wrote, {INBOX}, failed validation in `scripts\submit_digest.py`. The errors are listed in {ERRORS}.

1. Read {ERRORS}, then {INBOX}. Read {PROMPT} for the field rules, and {PENDING} for the source items.
2. Fix every listed error:
   - "missing" means you add an object for that id, judged from the pending file.
   - "not in the pending file" means you delete that object.
   - "appears more than once" means you keep one copy.
   - A deadline that "is not stated" goes back to null.
   - Over-long text gets shortened.
3. Change nothing else. Write the full corrected file back to {INBOX} with write_to_file: UTF-8 JSON only, same structure {"date", "items", "extras"}.

Reply with one line: fixed N.
