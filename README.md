<p align="center">
  <img src="static/logo.png" width="112" alt="FocusFrog logo" />
</p>

<h1 align="center">FocusFrog</h1>

<p align="center">
  <strong>Local-first time tracking, day planning, and Pomodoro focus built on ActivityWatch.</strong>
</p>

<p align="center">
  See how your laptop time is spent, plan what matters today, and stay on track without sending your data to a cloud service.
</p>

---

## What It Is

FocusFrog is a custom web UI for ActivityWatch. It keeps ActivityWatch's local time-tracking foundation, then adds a more opinionated daily workflow:

- understand work vs. non-work time at a glance
- inspect exactly when different kinds of activity happened
- plan today's todos in order
- choose the one task to do first
- run Pomodoro sessions with gentle distraction nudges

It is meant to feel like a quiet personal dashboard: useful enough for daily use, but not loud or gamified for its own sake.

## Fork Notice

FocusFrog is a fork/customization of the ActivityWatch web interface. It is built on top of the open-source ActivityWatch project and keeps the same local tracking foundation.

- Upstream project: [activitywatch/activitywatch](https://github.com/activitywatch/activitywatch)
- Web UI base: [ActivityWatch/aw-webui](https://github.com/ActivityWatch/aw-webui)
- License: MPL-2.0, inherited from ActivityWatch aw-webui

## Screenshots

### Hours Dashboard

Work, not-work, active total, pie charts, and a cumulative Today timeline.

![FocusFrog hours dashboard](docs/screenshots/hours-dashboard.jpg)

### Timeline

A day-level timetable that groups activity into readable category blocks.

![FocusFrog timeline timetable](docs/screenshots/timeline-timetable.jpg)

### Todos And Planning

Plan the day, order todos, and pick the first important task to handle.

![FocusFrog plan day view](docs/screenshots/todos-plan-day.jpg)

<table>
  <tr>
    <td width="50%">
      <strong>Calendar</strong><br />
      <img src="docs/screenshots/todos-calendar.jpg" alt="FocusFrog todo calendar" />
    </td>
    <td width="50%">
      <strong>Eisenhower Matrix</strong><br />
      <img src="docs/screenshots/todos-eisenhower.jpg" alt="FocusFrog Eisenhower matrix" />
    </td>
  </tr>
</table>

### Pomodoro

A focus timer with work and break modes, session history, and a distraction reminder when tracked activity looks off-task.

![FocusFrog Pomodoro view](docs/screenshots/pomodoro.jpg)

## Highlights

### Time That Is Actually Useful

The Hours page turns ActivityWatch events into a practical work dashboard:

- Today, Week, and Since recording ranges
- Monday-to-Sunday week view
- work, not-work, and active-total summaries
- work vs. not-work pie chart
- work sub-category pie chart
- cumulative Today chart showing how work builds over the day
- detailed report and raw data links when you need to inspect the source

### A Timeline You Can Read

The Timeline page is built for answering "when did I do what?" without opening raw event tables.

- full-day vertical timetable
- half-hour anchors
- category-colored activity blocks
- summarized repeated activity
- day selector for moving through history

### Todos With Multiple Views

Todos are stored locally in the browser and can be viewed in the shape that fits the moment.

- Plan day view for choosing today's work
- List view for due and upcoming tasks
- Calendar view for moving tasks between morning, afternoon, evening, and anytime
- Eisenhower matrix for urgent/important sorting
- recurring todos
- modal todo editor that opens only when needed
- drag-and-drop movement between calendar lanes and matrix quadrants

### Frog Of The Day

The planning view keeps one task visually front and center. Drag a todo into the frog card, or let the first planned todo become the default. Completing it gives a small visual reward and keeps the frog done for the rest of the day.

### Pomodoro That Uses Your Activity

The Pomodoro page is connected to the same categorization logic as the time dashboard.

- focus, short break, and long break modes
- session labels
- recent session history
- flower animation while a timer runs
- optional distraction popup when current activity looks like non-work during a focus session

### Themes

FocusFrog includes three visual modes:

- bright mode for everyday use
- contrast mode for stronger readability
- flower mode with a softer decorative background

The theme switcher is global, so Hours, Timeline, Pomodoro, Todos, and Settings stay consistent.

## How It Works

FocusFrog reads local ActivityWatch buckets, especially:

- `aw-watcher-window` for active app/window events
- `aw-watcher-afk` for filtering out away time

Those events are categorized into useful groups such as programming, writing, email, messages and calls, social media, food, and uncategorized work. The UI then uses those categories across charts, timelines, Pomodoro distraction checks, and reports.

## Quick Start

Start ActivityWatch first:

```bash
aw-qt
```

Then run the web UI:

```bash
npm install
npm run serve
```

Open:

```text
http://127.0.0.1:27180
```

For a production build:

```bash
npm run build
```

The built files are written to `dist/`.

## Using It With ActivityWatch

If you want to use a built version with your normal ActivityWatch install, copy the `dist/` assets into the static web directory used by your ActivityWatch server, or point `aw-server-rust` at the build output:

```bash
aw-server-rust --webpath /path/to/aw-webui/dist
```

If you are developing against a local ActivityWatch server, the dev server proxies API requests to the local backend.

## Privacy

FocusFrog is local-first. It reads from your local ActivityWatch server and does not require an account. Your time data, todos, and planning state stay on your machine unless you choose to export or publish them yourself.

## Development

Common commands:

```bash
npm run serve
npm run build
npm test
```

The app is built with Vue 2, BootstrapVue, Pinia, and the ActivityWatch client APIs.

## Credits

FocusFrog is built on top of [ActivityWatch](https://activitywatch.net/) and the original `aw-webui` project. ActivityWatch provides the local tracking foundation; FocusFrog adds the focused dashboard, planning, theme, and Pomodoro workflow on top.
