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

## Student features

Subjects and assignments come from a **preset school-year guide**: pick a **grade (1–12)**, press **Start the school year**, choose the first Monday, and Daybook adds that grade's five subjects with daily targets and a weekly review due every Friday for 36 weeks. Math follows a course sequence (Math, Pre-Algebra in 8, Algebra 1 in 9, Geometry, Algebra 2, Pre-Calculus); tick **Advanced math** to go one course ahead (Algebra 1 in grade 8, up to Calculus). High school adds course-specific science (Biology, Chemistry, Physics, Environmental Science), history/government, English and Writing. Existing subjects with the same names are kept, and you can run the guide again for another grade. The look is soft and pastel, with an emoji per subject.

- **Change plan:** every upcoming assignment has a *Change plan* section to move its due date or swap due dates with another assignment.
- Each subject card shows a progress bar, big **+1** and **Done for today** buttons, saved days off, and a **Use a day off** button (defaulting to the next school day, with a date picker).
- **Upcoming assignments** are sorted by due date (red overdue, orange today, yellow within 3 days); tick one to complete it.
- The **Calendar** is an overview of holidays, days off and due dates; click a day to mark a holiday or log work for a past day.

- **School days** are Monday–Friday. Mark any date as a **holiday** from the Calendar (a day off for every subject).
- **School today** shows each subject's target, work logged, what remains, and saved days off. Use **+** / **−** to log whole units for today. The **Calendar** lets you log work for past days, mark holidays, and use days off.
- **Earning (per subject):** work above the daily target is extra. Each time accumulated extra reaches one full daily target you earn one day off; partial extra carries over. On a weekend or holiday, every unit counts double. Short days never remove saved days. Saved days never expire.
  - Target 2: 4 pages in a day earns 1; 3 pages on two days earns 1; 3 pages once earns 0 (1 carried); 2 pages on a Saturday earns 2.
- **Using a day off:** pick a school day (today or later) in the Calendar. It applies to that subject only. If a task in that subject is due that day you get a warning you can override. A day off can be cancelled until the day has passed.
- Marking a holiday on a date where you used a day off returns it; removing the holiday uses it again.
- **Changing a target** applies from today forward; days already earned are unchanged.
- Edits that would leave more days used than earned (lowering a log, a target, or removing a holiday) are blocked with a message.
- Assumption: work logged on a day off you used counts as a normal school day (only work above the target earns), so you cannot earn the day back.
- Deleting a subject keeps its tasks in Inbox and erases its school data after confirmation.
- Backups now use version 2. Older version 1 backups and saved data upgrade automatically.

Not included: grades, reminders, calendar-file import, multiple students, recurring assignments, sharing.

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

## Board games

The **Board games** tab (top left) opens a small play area: tic-tac-toe (vs the computer or a friend), chess (against a computer bot with Easy/Medium/Hard levels, or two players on one screen; castling, en passant and checkmate work), Connect Four, Memory match, Snake, and a Paint board (colours, brush size, eraser, save as PNG). Nothing is stored or sent anywhere.


## Reminders, themes and chess options

A banner at the top of the Planner shows overdue, due-today and due-tomorrow tasks (click one to jump to it) and the browser may ask to show one notification per day for overdue or due-today work. The **Theme** picker offers Auto, Light and Dark and is remembered on this device. In chess you can play white or black, pick Easy to Expert (Expert runs in a background worker), and Undo takes back your move and the computer's reply.


## Home, grades, schedule and break room

- **Home** (opens first): widgets for today, reminders, subject progress, upcoming, grades, schedule forecast, days off, mini calendar, quick add, task list, log work, break room and a verse of the day (about 60 KJV verses, typed from memory, so check the wording; you can shuffle, pin, add, edit or delete). **Customize** shows/hides, resizes and reorders widgets (drag or Up/Down).
- **Grades** (subject card): points per assignment with category, weighted or simple average, letter grades, quarters, unweighted 4.0 GPA, trend, what-if calculator and a printable/PNG report card. Scores cap at 100%; extra credit is a constant in `src/grades.js`.
- **Schedule** (subject card): total lessons, weekday pace and optional goal date give planned and real-pace finish dates that skip weekends, holidays, break ranges and days off. Finish dates show on the Calendar.
- **Break room**: a cartoon coffee shop with a 5/10/15 minute break timer. Beans are earned from meeting daily targets and visiting, and are spent on drinks, pastries and decorations (cosmetic only). Sound is synthesized and off by default.
- Backups are now schema version 3; version 1 and 2 backups still import.
