# Daybook

A small personal task planner that runs locally. No accounts, cloud storage, external scripts, or runtime dependencies.

## Start on this computer

In PowerShell:

```powershell
Set-Location C:\Users\Owner\personal-task-planner
.\start.ps1
```

Open **http://127.0.0.1:4173** in a current Chrome or Edge browser. Keep the terminal open; press Ctrl+C to stop the server.

The launcher finds Node.js on PATH or at `%LOCALAPPDATA%\Programs\nodejs\node.exe`. This computer has a user-local Node.js LTS installation at that location. On another computer, install Node.js LTS (22 or later). With Node.js on PATH, `npm start` also works. No `npm install` is necessary.

If PowerShell blocks the launcher, run the runtime directly:

```powershell
& "$env:LOCALAPPDATA\Programs\nodejs\node.exe" .\server.js
```

If port 4173 is occupied, stop the other application using that port; the planner reports the conflict rather than choosing a different storage origin.

## Use

- Add a title, optional notes and due date, and choose a list. New tasks default to Inbox.
- Edit tasks, check them complete, or enable **Show completed** to reopen them.
- Create lists in the sidebar. Deleting a list moves its tasks into Inbox. Inbox cannot be deleted.
- List selection and **All / Today / Overdue** filters work together. **All tasks** in the sidebar includes every list. Completed tasks are hidden by default; **Overdue** never lists completed tasks.
- Due dates use your device's local calendar, with no time-of-day deadline. Tasks sort by due date, undated last, then creation time. Date views refresh when the day changes.
- Task deletion is permanent and requires confirmation. There is no trash or undo.

## Import files

Choose **Import a file**:

| File | Behavior |
| --- | --- |
| `.txt` | Adds one task per nonblank line to Inbox. Existing tasks stay intact. Leading/trailing whitespace is trimmed. Supports Windows and Unix line endings. |
| `.json` | Restores a Daybook backup, **replacing the whole workspace after confirmation**. Export a backup first if you want to retain the current workspace. |

Files must be UTF-8 encoded. A plain-text example:

```text
Buy groceries
Book dentist appointment
Finish reading chapter 3
```

Blank text files, invalid dates, unsupported backup versions, duplicate identifiers, invalid list references, and malformed JSON are rejected with a visible error and no changes. Arbitrary JSON, CSV, PDF, Word, and spreadsheet files are not supported. Files are read locally in your browser, never uploaded.

**Export JSON backup** downloads a complete backup of all lists and tasks, including completed tasks. Keep a copy outside the browser.

## Data and recovery

Data is stored in localStorage in this browser/profile at **http://127.0.0.1:4173**. Another browser, profile, hostname (including `localhost`), or port has separate storage. Private browsing data may disappear when the session closes. Clearing site data deletes tasks unless you have a backup. This is not a sync or backup service.

Failed writes display an error and do not replace the last saved workspace. Unsaved form text remains available to copy. Corrupt stored data is not silently reset; editing is blocked until you restore a valid backup. Inspect or copy the original localStorage value with browser developer tools if needed; its key is `personal-task-planner.workspace.v1`.

If another tab changes the workspace, this tab blocks further edits and asks you to reload, avoiding ordinary stale-tab overwrites. Prefer a single editing tab.

## Checks

With Node.js on PATH:

```powershell
npm run check
npm test
```

Or use the installed runtime directly:

```powershell
& "$env:LOCALAPPDATA\Programs\nodejs\node.exe" --test
```

Tests cover task/list operations, local dates, filtering, backup validation, persistence failures, file import, and static server boundaries. Browser integration checks use an installed Chrome or Edge, without extra packages; they are skipped with an explicit reason if neither is available. Set `PLANNER_BROWSER` to a browser executable path to override discovery.

## Scope

Responsive phone/desktop layout and keyboard-accessible controls. Local-only server bound to `127.0.0.1`. No accounts, sync, collaboration, recurrence, reminders, AI, analytics, integrations, hosting, installable app, or guaranteed offline access.
