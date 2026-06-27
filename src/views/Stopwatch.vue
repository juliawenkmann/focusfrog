<template lang="pug">
div.pomodoro-page
  transition(name="pomodoro-nudge")
    div.pomodoro-distraction-popup(v-if="distractionWarning" role="alert")
      div.pomodoro-distraction-icon
        icon(name="exclamation-circle")
      div.pomodoro-distraction-copy
        strong Get back on track
        span
          | This Pomodoro is for work. Current activity looks like {{ distractionWarning.category }}.
          span(v-if="distractionWarning.title") &nbsp;{{ distractionWarning.title }}
      button.pomodoro-distraction-close(
        type="button"
        aria-label="Dismiss distraction reminder"
        @click="dismissDistractionWarning"
      )
        icon(name="times")

  div.pomodoro-header
    div
      div.pomodoro-kicker Pomodoro
      h3.mb-1 Focus timer
      div.pomodoro-subtitle
        | {{ completedFocusToday }} focus sessions today
        span(v-if="completedFocusMinutesToday > 0") &nbsp;- {{ completedFocusMinutesToday }} min
    div.pomodoro-legend
      span.pomodoro-legend-pill.pomodoro-legend-pill--focus Work
      span.pomodoro-legend-pill.pomodoro-legend-pill--break Break

  div.pomodoro-layout
    section.pomodoro-card.pomodoro-timer-card
      div.pomodoro-mode-switch
        button.pomodoro-mode-button(
          v-for="option in modeOptions"
          :key="option.value"
          type="button"
          :class="modeButtonClass(option)"
          :disabled="!!activeTimer"
          @click="setMode(option.value)"
        )
          span {{ option.title }}
          strong {{ option.minutes }}m

      div.pomodoro-ring-wrap
        div.pomodoro-ring(:style="timerRingStyle")
          div.pomodoro-bloom(
            aria-hidden="true"
            :class="{ 'pomodoro-bloom--running': activeTimer }"
            :style="bloomStyle"
          )
            span.pomodoro-petal(
              v-for="petal in bloomPetals"
              :key="petal"
              :style="{ '--petal-rotation': petal + 'deg' }"
            )
            span.pomodoro-bloom-center
          div.pomodoro-face
            div.pomodoro-mode-label {{ currentModeConfig.title }}
            div.pomodoro-time {{ timerDisplay }}
            div.pomodoro-caption {{ timerCaption }}

      b-input-group.pomodoro-task(size="lg")
        b-input(
          v-model="taskLabel"
          :disabled="!!activeTimer"
          placeholder="Task for this session"
          aria-label="Task for this session"
          @keyup.enter="startPomodoro"
        )
        b-input-group-append
          b-button.pomodoro-start-button(
            :disabled="!!activeTimer"
            @click="startPomodoro"
          )
            icon(name="play")
            | {{ startButtonText }}

      div.pomodoro-controls(v-if="activeTimer")
        b-button.pomodoro-stop-button(@click="stopActiveTimer")
          icon(name="stop")
          | End session
        div.pomodoro-running-note
          | Started {{ activeTimer.timestamp | shorttime }}

    aside.pomodoro-card.pomodoro-side-card
      div.pomodoro-side-section
        h5.mb-2 Current rhythm
        div.pomodoro-rhythm-row(
          v-for="option in modeOptions"
          :key="'rhythm-' + option.value"
          :class="{ 'pomodoro-rhythm-row--active': currentModeConfig.value === option.value }"
        )
          span.pomodoro-rhythm-dot(:style="{ background: option.color }")
          span.flex-fill {{ option.title }}
          strong {{ option.minutes }} min
      div.pomodoro-side-section(v-if="activeTimer")
        h5.mb-2 Active label
        div.pomodoro-active-label {{ activeTimer.data.label || 'Pomodoro session' }}
      div.pomodoro-side-section(v-else)
        h5.mb-2 Next up
        div.pomodoro-next-card(:class="selectedMode === 'focus' ? 'pomodoro-next-card--focus' : 'pomodoro-next-card--break'")
          strong {{ selectedModeConfig.title }}
          span {{ selectedModeConfig.minutes }} minute timer

  div.pomodoro-card.pomodoro-history-card.mt-4
    div.pomodoro-history-header
      div
        h4.mb-1 Recent sessions
        div.text-muted(v-if="stoppedTimers.length > 0") {{ stoppedTimers.length }} saved sessions
      b-spinner(v-if="loading", small)
    div(v-if="loading")
      span.text-muted Loading...
    div.pomodoro-empty(v-else-if="stoppedTimers.length === 0")
      | No Pomodoro sessions yet.
    div(v-else)
      div(v-for="date in historyDates" :key="date")
        h6.pomodoro-date {{ date }}
        div.pomodoro-session-row(v-for="event in timersByDate[date]" :key="event.id")
          div.pomodoro-session-main
            span.pomodoro-session-dot(:style="{ background: sessionColor(event) }")
            div
              div.pomodoro-session-title {{ sessionTitle(event) }}
              div.pomodoro-session-meta
                | {{ event.timestamp | shorttime }} - {{ event.duration | friendlyduration }}
          div.pomodoro-session-actions
            b-button(
              size="sm"
              variant="outline-secondary"
              :disabled="!!activeTimer"
              @click="startFromEvent(event)"
            )
              icon(name="play")
              | Repeat
            b-button(
              size="sm"
              variant="outline-secondary"
              v-b-modal="'edit-modal-' + event.id"
            )
              icon(name="edit")
              | Edit
          event-editor(:event="event", :bucket_id="bucket_id", @save="updateTimer", @delete="removeTimer")
</template>

<style scoped lang="scss">
.pomodoro-page {
  position: relative;
  --pomodoro-green: #059669;
  --pomodoro-pink: #db2777;
  --pomodoro-ink: #0f172a;
  --pomodoro-muted: #64748b;
  --pomodoro-line: rgba(148, 163, 184, 0.35);
  min-height: 620px;
  margin: -1rem;
  padding: 1rem;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.95), rgba(255, 241, 242, 0.92)),
    linear-gradient(315deg, rgba(255, 255, 255, 0.96), rgba(240, 249, 255, 0.88));
  color: var(--pomodoro-ink);
}

.pomodoro-distraction-popup {
  position: fixed;
  right: clamp(1rem, 3vw, 2rem);
  bottom: clamp(1rem, 3vw, 2rem);
  z-index: 1060;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  width: min(420px, calc(100vw - 2rem));
  padding: 0.85rem;
  border: 1px solid rgba(219, 39, 119, 0.46);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
  color: var(--pomodoro-ink);
}

.pomodoro-distraction-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 999px;
  background: #fdf2f8;
  color: var(--pomodoro-pink);
}

.pomodoro-distraction-icon .fa-icon,
.pomodoro-distraction-close .fa-icon {
  margin: 0;
}

.pomodoro-distraction-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.1rem;
}

.pomodoro-distraction-copy strong {
  color: var(--pomodoro-pink);
  font-size: 1rem;
}

.pomodoro-distraction-copy span {
  color: #334155;
  overflow-wrap: anywhere;
}

.pomodoro-distraction-close {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.44);
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
}

.pomodoro-distraction-close:hover,
.pomodoro-distraction-close:focus {
  border-color: rgba(219, 39, 119, 0.5);
  background: #fdf2f8;
  color: var(--pomodoro-pink);
}

.pomodoro-nudge-enter-active,
.pomodoro-nudge-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.pomodoro-nudge-enter,
.pomodoro-nudge-leave-to {
  opacity: 0;
  transform: translateY(0.75rem);
}

.pomodoro-header,
.pomodoro-layout,
.pomodoro-history-header,
.pomodoro-session-row,
.pomodoro-session-main,
.pomodoro-session-actions,
.pomodoro-controls,
.pomodoro-legend {
  display: flex;
  gap: 0.75rem;
}

.pomodoro-header,
.pomodoro-history-header,
.pomodoro-session-row,
.pomodoro-controls {
  align-items: center;
  justify-content: space-between;
}

.pomodoro-header {
  margin-bottom: 1rem;
}

.pomodoro-kicker {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--pomodoro-pink);
}

.pomodoro-subtitle,
.pomodoro-running-note,
.pomodoro-session-meta,
.pomodoro-empty {
  color: var(--pomodoro-muted);
}

.pomodoro-legend {
  flex-wrap: wrap;
}

.pomodoro-legend-pill {
  padding: 0.32rem 0.62rem;
  border-radius: 999px;
  border: 1px solid var(--pomodoro-line);
  background: rgba(255, 255, 255, 0.78);
  font-weight: 700;
}

.pomodoro-legend-pill--focus {
  color: var(--pomodoro-green);
}

.pomodoro-legend-pill--break {
  color: var(--pomodoro-pink);
}

.pomodoro-layout {
  align-items: stretch;
}

.pomodoro-card {
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
}

.pomodoro-timer-card {
  flex: 1 1 620px;
  padding: 1.1rem;
}

.pomodoro-side-card {
  flex: 0 0 280px;
  padding: 1rem;
}

.pomodoro-mode-switch {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.pomodoro-mode-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0.58rem 0.7rem;
  border: 1px solid var(--pomodoro-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--pomodoro-ink);
  font-weight: 700;
}

.pomodoro-mode-button strong {
  font-size: 0.85rem;
}

.pomodoro-mode-button:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.pomodoro-mode-button--focus.pomodoro-mode-button--active {
  border-color: var(--pomodoro-green);
  background: rgba(5, 150, 105, 0.12);
  color: var(--pomodoro-green);
}

.pomodoro-mode-button--break.pomodoro-mode-button--active {
  border-color: var(--pomodoro-pink);
  background: rgba(219, 39, 119, 0.12);
  color: var(--pomodoro-pink);
}

.pomodoro-ring-wrap {
  display: flex;
  justify-content: center;
  padding: 1.35rem 0;
}

.pomodoro-ring {
  position: relative;
  display: grid;
  width: min(72vw, 330px);
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: visible;
  place-items: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7), 0 20px 46px rgba(15, 23, 42, 0.14);
}

.pomodoro-bloom {
  --bloom-opacity: 0.62;
  --bloom-reach: 3.2rem;
  --bloom-scale: 0.62;
  position: absolute;
  inset: 0;
  z-index: 1;
  display: none;
  border-radius: 50%;
  opacity: var(--bloom-opacity);
  pointer-events: none;
}

.pomodoro-petal {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22%;
  height: 33%;
  border: 1px solid rgba(30, 64, 110, 0.22);
  border-radius: 70% 70% 58% 58%;
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.96), rgba(96, 165, 250, 0.72));
  box-shadow: 0 10px 22px rgba(15, 38, 71, 0.12);
  transform: translate(-50%, -50%) rotate(var(--petal-rotation))
    translateY(calc(-1 * var(--bloom-reach))) scale(var(--bloom-scale));
  transform-origin: center center;
  transition: transform 650ms ease, opacity 650ms ease;
}

.pomodoro-bloom-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22%;
  height: 22%;
  border-radius: 50%;
  background: radial-gradient(circle, #fffdf4 0 42%, #ec4899 43% 100%);
  box-shadow: 0 8px 18px rgba(15, 38, 71, 0.16);
  transform: translate(-50%, -50%) scale(var(--bloom-scale));
  transition: transform 650ms ease;
}

.pomodoro-bloom--running .pomodoro-petal {
  animation: bloomBreathe 3.8s ease-in-out infinite;
}

.pomodoro-face {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 76%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  text-align: center;
}

html[data-dashboard-theme='flower'] .pomodoro-page {
  background: linear-gradient(rgba(255, 253, 245, 0.64), rgba(255, 249, 244, 0.82)),
    url('~@/assets/focusfrog-flower-chinoiserie-bg.webp') center top / 430px auto repeat,
    linear-gradient(135deg, rgba(255, 247, 237, 0.96), rgba(253, 242, 248, 0.88) 52%);
  color: #10213a;
}

html[data-dashboard-theme='flower'] .pomodoro-bloom {
  display: block;
}

html[data-dashboard-theme='flower'] .pomodoro-card,
html[data-dashboard-theme='flower'] .pomodoro-mode-button,
html[data-dashboard-theme='flower'] .pomodoro-legend-pill,
html[data-dashboard-theme='flower'] .pomodoro-face,
html[data-dashboard-theme='flower'] .pomodoro-active-label,
html[data-dashboard-theme='flower'] .pomodoro-next-card,
html[data-dashboard-theme='flower'] .pomodoro-distraction-popup {
  border-color: rgba(30, 64, 110, 0.32);
  background: rgba(255, 253, 245, 0.97);
  box-shadow: 0 18px 42px rgba(15, 38, 71, 0.13);
}

html[data-dashboard-theme='flower'] .pomodoro-kicker,
html[data-dashboard-theme='flower'] .pomodoro-next-card--break strong {
  color: #db2777;
}

html[data-dashboard-theme='flower'] .pomodoro-next-card--focus strong,
html[data-dashboard-theme='flower'] .pomodoro-legend-pill--focus {
  color: #059669;
}

html[data-dashboard-theme='flower'] .pomodoro-subtitle,
html[data-dashboard-theme='flower'] .pomodoro-running-note,
html[data-dashboard-theme='flower'] .pomodoro-session-meta,
html[data-dashboard-theme='flower'] .pomodoro-empty,
html[data-dashboard-theme='flower'] .pomodoro-mode-label,
html[data-dashboard-theme='flower'] .pomodoro-caption,
html[data-dashboard-theme='flower'] .pomodoro-date {
  color: #38506f;
}

html[data-dashboard-theme='flower'] .pomodoro-distraction-icon {
  background: #fdf2f8;
  color: #db2777;
}

html[data-dashboard-theme='flower'] .pomodoro-distraction-copy strong {
  color: #db2777;
}

html[data-dashboard-theme='flower'] .pomodoro-distraction-copy span {
  color: #10213a;
}

html[data-dashboard-theme='flower'] .pomodoro-distraction-close {
  border-color: rgba(16, 185, 129, 0.42);
  background: #ffffff;
  color: #059669;
}

html[data-dashboard-theme='flower'] .pomodoro-distraction-close:hover,
html[data-dashboard-theme='flower'] .pomodoro-distraction-close:focus {
  border-color: #ec4899;
  background: #fdf2f8;
  color: #db2777;
}

html[data-dashboard-theme='flower'] .pomodoro-mode-button--focus.pomodoro-mode-button--active {
  border-color: #059669;
  background: rgba(220, 252, 231, 0.82);
  color: #059669;
}

html[data-dashboard-theme='flower'] .pomodoro-mode-button--break.pomodoro-mode-button--active {
  border-color: #ec4899;
  background: rgba(253, 242, 248, 0.9);
  color: #db2777;
}

@keyframes bloomBreathe {
  0%,
  100% {
    filter: saturate(1);
  }

  50% {
    filter: saturate(1.12) brightness(1.03);
  }
}

.pomodoro-mode-label {
  font-weight: 800;
  color: var(--pomodoro-muted);
}

.pomodoro-time {
  margin: 0.15rem 0;
  font-size: clamp(3rem, 8vw, 5.25rem);
  font-weight: 900;
  line-height: 1;
  color: var(--pomodoro-ink);
}

.pomodoro-caption {
  max-width: 180px;
  color: var(--pomodoro-muted);
  font-size: 0.9rem;
}

.pomodoro-task {
  max-width: 720px;
  margin: 0 auto;
}

.pomodoro-task input {
  border-color: rgba(148, 163, 184, 0.55);
}

.pomodoro-start-button,
.pomodoro-stop-button {
  border: 0;
  color: #fff !important;
  font-weight: 800;
}

.pomodoro-start-button {
  background: var(--pomodoro-green);
}

.pomodoro-stop-button {
  background: var(--pomodoro-pink);
}

.pomodoro-controls {
  margin: 1rem auto 0;
  max-width: 720px;
  flex-wrap: wrap;
}

.pomodoro-side-section + .pomodoro-side-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.28);
}

.pomodoro-rhythm-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0;
}

.pomodoro-rhythm-row--active {
  font-weight: 800;
}

.pomodoro-rhythm-dot,
.pomodoro-session-dot {
  flex: 0 0 auto;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
}

.pomodoro-active-label,
.pomodoro-next-card {
  padding: 0.75rem;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.86);
}

.pomodoro-next-card {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.pomodoro-next-card--focus strong {
  color: var(--pomodoro-green);
}

.pomodoro-next-card--break strong {
  color: var(--pomodoro-pink);
}

.pomodoro-history-card {
  padding: 1rem;
}

.pomodoro-date {
  margin: 1rem 0 0.35rem;
  color: var(--pomodoro-muted);
  font-weight: 800;
}

.pomodoro-session-row {
  padding: 0.7rem 0;
  border-top: 1px solid rgba(148, 163, 184, 0.22);
}

.pomodoro-session-main {
  align-items: center;
  min-width: 0;
}

.pomodoro-session-title {
  font-weight: 800;
  overflow-wrap: anywhere;
}

.pomodoro-session-actions {
  align-items: center;
  flex-wrap: nowrap;
}

.pomodoro-session-actions .btn,
.pomodoro-controls .btn,
.pomodoro-task .btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.pomodoro-session-actions .fa-icon,
.pomodoro-controls .fa-icon,
.pomodoro-task .fa-icon {
  margin: 0;
}

@media (max-width: 900px) {
  .pomodoro-layout {
    flex-direction: column;
  }

  .pomodoro-side-card {
    flex-basis: auto;
  }
}

@media (max-width: 640px) {
  .pomodoro-header,
  .pomodoro-history-header,
  .pomodoro-session-row,
  .pomodoro-controls {
    align-items: flex-start;
    flex-direction: column;
  }

  .pomodoro-mode-switch {
    grid-template-columns: 1fr;
  }
}
</style>

<script lang="ts">
import _ from 'lodash';
import moment from 'moment';

import EventEditor from '../components/EventEditor.vue';
import { useBucketsStore } from '~/stores/buckets';
import { useCategoryStore } from '~/stores/categories';
import {
  categorizeFocusFrogEvent,
  categoryLabel,
  isNotWorkCategory,
} from '~/util/focusfrogCategories';
import 'vue-awesome/icons/exclamation-circle';
import 'vue-awesome/icons/play';
import 'vue-awesome/icons/stop';
import 'vue-awesome/icons/edit';
import 'vue-awesome/icons/times';

const WORK_COLOR = '#059669';
const BREAK_COLOR = '#db2777';
const DISTRACTION_CHECK_INTERVAL_SECONDS = 15;
const DISTRACTION_LOOKBACK_MINUTES = 3;
const DISTRACTION_WARNING_COOLDOWN_MS = 90 * 1000;
const DISTRACTION_DISMISS_MS = 2 * 60 * 1000;
const FRESH_BROWSER_EVENT_MS = 90 * 1000;
const BROWSER_APP_PATTERN = /Chrome|Safari|Firefox|Brave|Arc|Edge|Opera/i;

const POMODORO_MODES = [
  {
    value: 'focus',
    title: 'Focus',
    minutes: 25,
    color: WORK_COLOR,
  },
  {
    value: 'shortBreak',
    title: 'Short break',
    minutes: 5,
    color: BREAK_COLOR,
  },
  {
    value: 'longBreak',
    title: 'Long break',
    minutes: 15,
    color: BREAK_COLOR,
  },
];

function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function modeByValue(value: string) {
  return POMODORO_MODES.find(mode => mode.value === value) || POMODORO_MODES[0];
}

export default {
  name: 'Pomodoro',
  components: {
    'event-editor': EventEditor,
  },
  data: () => {
    return {
      loading: true,
      completingTimer: false,
      bucket_id: 'aw-stopwatch',
      events: [],
      taskLabel: '',
      selectedMode: 'focus',
      now: moment(),
      tickInterval: null,
      lastDistractionCheckAt: 0,
      checkingDistraction: false,
      distractionWarning: null,
      lastDistractionSignature: '',
      lastDistractionPromptAt: 0,
      dismissedDistractionSignature: '',
      distractionDismissedUntil: 0,
    };
  },
  computed: {
    modeOptions() {
      return POMODORO_MODES;
    },
    runningTimers() {
      return _.filter(this.events, e => e.data.running);
    },
    activeTimer() {
      return this.runningTimers[0] || null;
    },
    stoppedTimers() {
      return _.orderBy(
        _.filter(this.events, e => !e.data.running),
        e => moment(e.timestamp).valueOf(),
        'desc'
      );
    },
    selectedModeConfig() {
      return modeByValue(this.selectedMode);
    },
    activeModeConfig() {
      if (!this.activeTimer) return this.selectedModeConfig;
      return modeByValue(this.activeTimer.data.mode || 'focus');
    },
    currentModeConfig() {
      return this.activeTimer ? this.activeModeConfig : this.selectedModeConfig;
    },
    isFocusPomodoroActive() {
      return !!(
        this.activeTimer &&
        this.activeTimer.data.kind === 'pomodoro' &&
        (this.activeTimer.data.mode || 'focus') === 'focus'
      );
    },
    activeTargetSeconds() {
      if (!this.activeTimer) return this.selectedModeConfig.minutes * 60;
      return Number(this.activeTimer.data.targetDuration || this.activeModeConfig.minutes * 60);
    },
    elapsedSeconds() {
      if (!this.activeTimer) return 0;
      return Math.max(0, this.now.diff(moment(this.activeTimer.timestamp)) / 1000);
    },
    remainingSeconds() {
      if (!this.activeTimer) return this.selectedModeConfig.minutes * 60;
      return Math.max(0, this.activeTargetSeconds - this.elapsedSeconds);
    },
    progressPercent() {
      if (!this.activeTimer) return 0;
      if (this.activeTargetSeconds <= 0) return 0;
      return Math.min(100, Math.max(0, (this.elapsedSeconds / this.activeTargetSeconds) * 100));
    },
    bloomPetals() {
      return [0, 45, 90, 135, 180, 225, 270, 315];
    },
    bloomStyle() {
      const amount = this.activeTimer ? this.progressPercent / 100 : 0.16;
      return {
        '--bloom-opacity': String(0.58 + amount * 0.34),
        '--bloom-reach': `${3.05 + amount * 1.55}rem`,
        '--bloom-scale': String(0.58 + amount * 0.46),
      };
    },
    timerDisplay() {
      return formatClock(this.activeTimer ? this.remainingSeconds : this.activeTargetSeconds);
    },
    timerCaption() {
      if (!this.activeTimer) return `${this.selectedModeConfig.minutes} minute session`;
      if (this.remainingSeconds <= 0) return 'Session complete';
      const end = moment(this.activeTimer.timestamp).add(this.activeTargetSeconds, 'seconds');
      return `Ends at ${end.format('HH:mm')}`;
    },
    timerRingStyle() {
      const color = this.currentModeConfig.color;
      return {
        background: `conic-gradient(${color} ${this.progressPercent}%, rgba(255, 255, 255, 0.72) 0)`,
      };
    },
    startButtonText() {
      return this.selectedMode === 'focus' ? 'Start focus' : 'Start break';
    },
    completedFocusToday() {
      const today = moment().format('YYYY-MM-DD');
      return this.stoppedTimers.filter(
        event =>
          (event.data.mode || 'focus') === 'focus' &&
          moment(event.timestamp).format('YYYY-MM-DD') === today
      ).length;
    },
    completedFocusMinutesToday() {
      const today = moment().format('YYYY-MM-DD');
      const seconds = this.stoppedTimers
        .filter(
          (event: any) =>
            (event.data.mode || 'focus') === 'focus' &&
            moment(event.timestamp).format('YYYY-MM-DD') === today
        )
        .reduce((total: number, event: any) => total + Number(event.duration || 0), 0);
      return Math.round(seconds / 60);
    },
    timersByDate() {
      return _.groupBy(this.stoppedTimers, event => moment(event.timestamp).format('YYYY-MM-DD'));
    },
    historyDates() {
      return Object.keys(this.timersByDate).sort().reverse();
    },
  },
  mounted: async function () {
    await this.$aw.ensureBucket(this.bucket_id, 'general.stopwatch', 'unknown');
    useCategoryStore().load();
    await this.getEvents();
    this.tickInterval = window.setInterval(this.tick, 1000);
  },
  beforeDestroy() {
    if (this.tickInterval) window.clearInterval(this.tickInterval);
  },
  methods: {
    setMode(mode: string) {
      if (this.activeTimer) return;
      this.selectedMode = mode;
    },
    modeButtonClass(option) {
      return {
        'pomodoro-mode-button--active': this.selectedMode === option.value,
        'pomodoro-mode-button--focus': option.value === 'focus',
        'pomodoro-mode-button--break': option.value !== 'focus',
      };
    },
    sessionColor(event) {
      const mode = modeByValue(event.data.mode || 'focus');
      return mode.color;
    },
    sessionTitle(event) {
      return event.data.label || modeByValue(event.data.mode || 'focus').title;
    },
    buildLabel(modeConfig, taskLabel: string) {
      const task = taskLabel.trim();
      if (task) return `${modeConfig.title}: ${task}`;
      return modeConfig.value === 'focus' ? 'Focus Pomodoro' : modeConfig.title;
    },
    startPomodoro: async function () {
      if (this.activeTimer) return;
      const modeConfig = this.selectedModeConfig;
      if (modeConfig.value === 'focus') this.requestNotificationPermission();
      const event = {
        timestamp: new Date(),
        data: {
          running: true,
          kind: 'pomodoro',
          mode: modeConfig.value,
          targetDuration: modeConfig.minutes * 60,
          label: this.buildLabel(modeConfig, this.taskLabel),
          task: this.taskLabel.trim(),
        },
      };
      await this.$aw.heartbeat(this.bucket_id, 1, event);
      if (modeConfig.value === 'focus') this.taskLabel = '';
      await this.getEvents();
      if (modeConfig.value === 'focus') {
        this.lastDistractionCheckAt = 0;
        this.checkForDistraction();
      }
    },
    startFromEvent: async function (event) {
      if (this.activeTimer) return;
      this.selectedMode = event.data.mode || 'focus';
      this.taskLabel = event.data.task || '';
      await this.startPomodoro();
    },
    stopActiveTimer: async function () {
      if (!this.activeTimer) return;
      await this.completeTimer(this.activeTimer, false);
    },
    completeTimer: async function (event, planned: boolean) {
      if (this.completingTimer) return;
      this.completingTimer = true;
      try {
        const newEvent = JSON.parse(JSON.stringify(event));
        const targetDuration = Number(newEvent.data.targetDuration || 0);
        const elapsed = Math.max(1, moment().diff(moment(newEvent.timestamp)) / 1000);
        newEvent.data.running = false;
        newEvent.data.completed = planned;
        newEvent.data.completedAt = new Date().toISOString();
        newEvent.duration = planned && targetDuration > 0 ? targetDuration : elapsed;
        await this.$aw.replaceEvent(this.bucket_id, newEvent);
        await this.getEvents();
      } finally {
        this.completingTimer = false;
      }
    },
    tick() {
      this.now = moment();
      const active = this.activeTimer;
      if (
        active &&
        active.data.kind === 'pomodoro' &&
        Number(active.data.targetDuration || 0) > 0 &&
        this.remainingSeconds <= 0 &&
        !this.completingTimer
      ) {
        this.completeTimer(active, true);
      }
      this.maybeCheckForDistraction();
    },
    maybeCheckForDistraction() {
      if (!this.isFocusPomodoroActive) {
        this.distractionWarning = null;
        return;
      }

      const nowMs = Date.now();
      if (
        !this.checkingDistraction &&
        nowMs - this.lastDistractionCheckAt >= DISTRACTION_CHECK_INTERVAL_SECONDS * 1000
      ) {
        this.lastDistractionCheckAt = nowMs;
        this.checkForDistraction();
      }
    },
    requestNotificationPermission() {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined);
      }
    },
    sendDistractionNotification(activity) {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const title = activity.title || activity.app || activity.category;
      new Notification('Get back on track', {
        body: title
          ? `This looks like ${activity.category}: ${title}`
          : `This looks like ${activity.category}.`,
        tag: 'focusfrog-pomodoro-distraction',
        silent: false,
      });
    },
    async getLatestEvents(bucketIds: string[]) {
      const end = new Date();
      const start = moment(end).subtract(DISTRACTION_LOOKBACK_MINUTES, 'minutes').toDate();
      const eventGroups = await Promise.all(
        bucketIds.map(bucketId =>
          this.$aw
            .getEvents(bucketId, { start, end, limit: 12 })
            .then(events => events.map(event => ({ ...event, bucketId })))
            .catch(() => [])
        )
      );
      return _.flatten(eventGroups)
        .filter(event => event && event.timestamp)
        .sort((a, b) => {
          const aEnd = moment(a.timestamp)
            .add(Number(a.duration || 0), 'seconds')
            .valueOf();
          const bEnd = moment(b.timestamp)
            .add(Number(b.duration || 0), 'seconds')
            .valueOf();
          return bEnd - aEnd;
        });
    },
    async getCurrentActivityForDistraction() {
      const bucketsStore = useBucketsStore();
      await bucketsStore.ensureLoaded();

      const primaryHost = bucketsStore.hosts[0];
      const windowBucketIds = primaryHost
        ? bucketsStore.bucketsWindow(primaryHost)
        : bucketsStore.buckets
            .filter(
              bucket =>
                bucket.type === 'currentwindow' && !bucket.id.startsWith('aw-watcher-android')
            )
            .map(bucket => bucket.id);
      const browserBucketIds = primaryHost
        ? bucketsStore.bucketsBrowser(primaryHost)
        : bucketsStore.buckets
            .filter(bucket => bucket.type === 'web.tab.current')
            .map(bucket => bucket.id);

      if (windowBucketIds.length === 0 && browserBucketIds.length === 0) return null;

      const [windowEvents, browserEvents] = await Promise.all([
        this.getLatestEvents(windowBucketIds),
        this.getLatestEvents(browserBucketIds),
      ]);
      const windowEvent = windowEvents[0] || null;
      const browserEvent = browserEvents[0] || null;

      if (!windowEvent && !browserEvent) return null;

      const nowMs = Date.now();
      const windowApp = windowEvent?.data?.app || '';
      const browserEndMs = browserEvent
        ? moment(browserEvent.timestamp)
            .add(Number(browserEvent.duration || 0), 'seconds')
            .valueOf()
        : 0;
      const useBrowserEvent =
        browserEvent &&
        (!windowEvent ||
          BROWSER_APP_PATTERN.test(windowApp) ||
          nowMs - browserEndMs <= FRESH_BROWSER_EVENT_MS);
      const data = {
        ...(windowEvent?.data || {}),
        ...(useBrowserEvent
          ? {
              tabTitle: browserEvent.data?.title,
              url: browserEvent.data?.url,
              browserUrl: browserEvent.data?.url,
              browserTitle: browserEvent.data?.title,
            }
          : {}),
      };

      return {
        timestamp: (windowEvent || browserEvent).timestamp,
        duration: (windowEvent || browserEvent).duration,
        data,
      };
    },
    async checkForDistraction() {
      if (!this.isFocusPomodoroActive || this.checkingDistraction) return;

      this.checkingDistraction = true;
      try {
        const event = await this.getCurrentActivityForDistraction();
        if (!event) return;

        const categoryStore = useCategoryStore();
        if (categoryStore.classes_for_query.length === 0) categoryStore.load();
        const category = categorizeFocusFrogEvent(event, categoryStore.classes_for_query || []);

        if (!isNotWorkCategory(category)) {
          this.distractionWarning = null;
          return;
        }

        const warning = {
          signature: [
            categoryLabel(category),
            event.data.app || '',
            event.data.title || '',
            event.data.url || '',
            event.data.browserTitle || '',
          ].join('|'),
          category: categoryLabel(category),
          app: event.data.app || '',
          title: event.data.browserTitle || event.data.title || event.data.url || '',
        };
        const nowMs = Date.now();

        if (
          warning.signature === this.dismissedDistractionSignature &&
          nowMs < this.distractionDismissedUntil
        ) {
          return;
        }
        if (
          warning.signature === this.lastDistractionSignature &&
          nowMs - this.lastDistractionPromptAt < DISTRACTION_WARNING_COOLDOWN_MS
        ) {
          return;
        }

        this.distractionWarning = warning;
        this.lastDistractionSignature = warning.signature;
        this.lastDistractionPromptAt = nowMs;
        this.sendDistractionNotification(warning);
      } finally {
        this.checkingDistraction = false;
      }
    },
    dismissDistractionWarning() {
      if (!this.distractionWarning) return;
      this.dismissedDistractionSignature = this.distractionWarning.signature;
      this.distractionDismissedUntil = Date.now() + DISTRACTION_DISMISS_MS;
      this.distractionWarning = null;
    },
    updateTimer: async function (new_event) {
      const i = this.events.findIndex(e => e.id == new_event.id);
      if (i != -1) {
        this.$set(this.events, i, new_event);
      } else {
        console.error('Could not update Pomodoro session.');
      }
    },
    removeTimer: function (event) {
      this.events = _.filter(this.events, e => e.id != event.id);
    },
    getEvents: async function () {
      this.events = await this.$aw.getEvents(this.bucket_id, { limit: 100 });
      this.loading = false;
    },
  },
};
</script>
