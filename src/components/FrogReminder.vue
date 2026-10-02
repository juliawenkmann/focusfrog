<template lang="pug">
transition(name="frog-reminder")
  aside.frog-reminder(
    v-if="visible"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  )
    button.frog-reminder__close(
      type="button"
      aria-label="Dismiss frog reminder"
      @click="dismiss"
    ) ×
    div.frog-reminder__visual(aria-hidden="true")
      img(src="/focusfrog-frog-alive.png?v=transparent" alt="")
      span.frog-reminder__pulse
    div.frog-reminder__content
      span.frog-reminder__eyebrow Eat the frog
      strong.frog-reminder__title {{ reminderHeading }}
      p
        | “{{ frogTitle }}” is still waiting.
        br
        | A small bite counts.
      div.frog-reminder__actions
        button.frog-reminder__primary(type="button" @click="openFrog") Open my frog
        button.frog-reminder__secondary(type="button" @click="snooze") In 30 min
</template>

<script lang="ts">
import {
  dueFrogReminder,
  freshFrogReminderHistory,
  frogPlanDate,
  FrogReminderHistory,
} from '~/util/frogReminders';

interface FrogPlanRecord {
  date?: string;
  todoId?: string;
  eatenToday?: boolean;
}

interface TodoRecord {
  id?: string;
  title?: string;
  completed?: boolean;
}

const TODO_STORAGE_KEY = 'timetracker.todos.v1';
const TODO_FROG_STORAGE_KEY = 'timetracker.todoFrog.v1';
const REMINDER_STORAGE_KEY = 'timetracker.frogReminders.v1';
const REMINDER_CHECK_INTERVAL = 60 * 1000;
const REMINDER_SNOOZE_DURATION = 30 * 60 * 1000;

function readStoredValue<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default {
  name: 'FrogReminder',
  data() {
    return {
      visible: false,
      frogTitle: 'Your frog',
      reminderHeading: 'Your frog is still waiting',
      checking: false,
      checkTimer: 0,
      initialCheckTimer: 0,
    };
  },
  mounted() {
    this.initialCheckTimer = window.setTimeout(() => {
      void this.checkReminder();
    }, 1400);
    this.checkTimer = window.setInterval(() => {
      void this.checkReminder();
    }, REMINDER_CHECK_INTERVAL);
    window.addEventListener('focusfrog:frog-state-changed', this.handleFrogStateChanged);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  },
  beforeDestroy() {
    if (this.initialCheckTimer) window.clearTimeout(this.initialCheckTimer);
    if (this.checkTimer) window.clearInterval(this.checkTimer);
    window.removeEventListener('focusfrog:frog-state-changed', this.handleFrogStateChanged);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  },
  methods: {
    readHistory(now: Date): FrogReminderHistory {
      const stored = readStoredValue<Partial<FrogReminderHistory>>(REMINDER_STORAGE_KEY);
      const planDate = frogPlanDate(now);
      if (stored?.date !== planDate) return freshFrogReminderHistory(now);
      return {
        date: planDate,
        shownSlots: Array.isArray(stored.shownSlots)
          ? stored.shownSlots.filter(slot => typeof slot === 'string')
          : [],
        snoozedUntil: typeof stored.snoozedUntil === 'number' ? stored.snoozedUntil : undefined,
      };
    },
    saveHistory(reminderHistory: FrogReminderHistory) {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminderHistory));
    },
    async loadServerValue(key: string) {
      if (typeof fetch === 'undefined') return null;
      try {
        const response = await fetch(`/focusfrog-storage/${key}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.value ?? null;
      } catch {
        return null;
      }
    },
    async activeFrog(now: Date): Promise<{ id: string; title: string } | null> {
      const planDate = frogPlanDate(now);
      const localFrog = readStoredValue<FrogPlanRecord>(TODO_FROG_STORAGE_KEY);
      const serverFrog = (await this.loadServerValue('todoFrog')) as FrogPlanRecord | null;
      const frog =
        serverFrog?.date === planDate
          ? serverFrog
          : localFrog?.date === planDate
          ? localFrog
          : null;

      if (!frog?.todoId || frog.eatenToday) return null;

      const localTodos = readStoredValue<TodoRecord[]>(TODO_STORAGE_KEY);
      const serverTodos = (await this.loadServerValue('todos')) as TodoRecord[] | null;
      const todos = Array.isArray(serverTodos)
        ? [...serverTodos, ...(Array.isArray(localTodos) ? localTodos : [])]
        : Array.isArray(localTodos)
        ? localTodos
        : [];
      const todo = todos.find(item => item?.id === frog.todoId);
      if (todo?.completed) return null;

      return {
        id: frog.todoId,
        title: todo?.title?.trim() || 'Your frog',
      };
    },
    async checkReminder() {
      if (this.checking) return;
      this.checking = true;
      try {
        const now = new Date();
        const reminderHistory = this.readHistory(now);
        const reminder = dueFrogReminder(now, reminderHistory);
        if (!reminder) return;

        const frog = await this.activeFrog(now);
        if (!frog) {
          this.visible = false;
          return;
        }

        this.frogTitle = frog.title;
        this.reminderHeading = reminder.heading;
        this.visible = true;
        if (reminder.id === 'snoozed') {
          delete reminderHistory.snoozedUntil;
        } else if (!reminderHistory.shownSlots.includes(reminder.id)) {
          reminderHistory.shownSlots.push(reminder.id);
        }
        this.saveHistory(reminderHistory);
      } finally {
        this.checking = false;
      }
    },
    dismiss() {
      this.visible = false;
    },
    snooze() {
      const now = new Date();
      const reminderHistory = this.readHistory(now);
      reminderHistory.snoozedUntil = now.getTime() + REMINDER_SNOOZE_DURATION;
      this.saveHistory(reminderHistory);
      this.visible = false;
    },
    openFrog() {
      this.visible = false;
      if (this.$route.path !== '/todos') {
        this.$router.push('/todos').catch(() => undefined);
      }
    },
    handleFrogStateChanged(event: Event) {
      const record = (event as CustomEvent<FrogPlanRecord>).detail;
      if (record?.eatenToday || !record?.todoId) {
        this.visible = false;
        return;
      }
      window.setTimeout(() => {
        void this.checkReminder();
      }, 300);
    },
    handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void this.checkReminder();
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.frog-reminder {
  position: fixed;
  z-index: 1080;
  top: 5rem;
  right: 1.25rem;
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  width: min(25rem, calc(100vw - 2rem));
  padding: 1rem 1.1rem 1rem 0.8rem;
  border: 1px solid rgba(16, 185, 129, 0.45);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(240, 253, 244, 0.97), rgba(253, 242, 248, 0.97));
  box-shadow: 0 20px 55px rgba(15, 23, 42, 0.22);
  color: #10213a !important;
  backdrop-filter: blur(14px) saturate(1.05);
}

.frog-reminder__close {
  position: absolute;
  top: 0.45rem;
  right: 0.55rem;
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #536882 !important;
  font-size: 1.25rem;
  line-height: 1;
}

.frog-reminder__close:hover {
  background: rgba(236, 72, 153, 0.12);
  color: #be185d !important;
}

.frog-reminder__visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 5.4rem;
}

.frog-reminder__visual img {
  position: relative;
  z-index: 1;
  display: block;
  width: 5rem;
  height: 5rem;
  object-fit: contain;
  filter: drop-shadow(0 8px 8px rgba(15, 23, 42, 0.18));
}

.frog-reminder__pulse {
  position: absolute;
  width: 3.6rem;
  height: 1.15rem;
  bottom: 0.28rem;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.2);
  filter: blur(5px);
  animation: frog-reminder-pulse 2.4s ease-in-out infinite;
}

.frog-reminder__content {
  min-width: 0;
  padding-right: 1rem;
}

.frog-reminder__eyebrow {
  display: block;
  margin-bottom: 0.1rem;
  color: #047857 !important;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.frog-reminder__title {
  display: block;
  padding-right: 0.5rem;
  color: #10213a !important;
  font-size: 1.05rem;
}

.frog-reminder p {
  margin: 0.35rem 0 0.8rem;
  color: #38506f !important;
  font-size: 0.88rem;
  line-height: 1.35;
}

.frog-reminder__actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.frog-reminder__primary,
.frog-reminder__secondary {
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 800;
}

.frog-reminder__primary {
  border: 1px solid #059669;
  background: #10b981;
  color: #ffffff !important;
}

.frog-reminder__primary:hover {
  border-color: #047857;
  background: #059669;
}

.frog-reminder__secondary {
  border: 1px solid rgba(190, 94, 129, 0.42);
  background: rgba(255, 255, 255, 0.68);
  color: #9d174d !important;
}

.frog-reminder__secondary:hover {
  background: rgba(252, 231, 243, 0.92);
}

html[data-dashboard-theme='flower'] .frog-reminder {
  border-color: rgba(190, 94, 129, 0.42);
  background: linear-gradient(135deg, rgba(255, 252, 247, 0.94), rgba(249, 235, 243, 0.92));
  box-shadow: 0 22px 58px rgba(103, 61, 78, 0.24);
}

html[data-dashboard-theme='contrast'] .frog-reminder {
  border-color: rgba(52, 211, 153, 0.52);
  background: linear-gradient(135deg, rgba(14, 21, 31, 0.98), rgba(27, 40, 56, 0.98));
  box-shadow: 0 22px 58px rgba(0, 0, 0, 0.58);
  color: #f4f7fb !important;
}

html[data-dashboard-theme='contrast'] .frog-reminder__title {
  color: #f4f7fb !important;
}

html[data-dashboard-theme='contrast'] .frog-reminder p {
  color: #cbd5e1 !important;
}

html[data-dashboard-theme='contrast'] .frog-reminder__eyebrow {
  color: #6ee7b7 !important;
}

html[data-dashboard-theme='contrast'] .frog-reminder__close,
html[data-dashboard-theme='contrast'] .frog-reminder__secondary {
  border-color: rgba(244, 114, 182, 0.42);
  background: rgba(255, 255, 255, 0.08);
  color: #f9a8d4 !important;
}

.frog-reminder-enter-active,
.frog-reminder-leave-active {
  transition: opacity 180ms ease, transform 220ms ease;
}

.frog-reminder-enter,
.frog-reminder-leave-to {
  opacity: 0;
  transform: translate3d(1.5rem, -0.5rem, 0) scale(0.96);
}

@keyframes frog-reminder-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scaleX(0.82);
  }

  50% {
    opacity: 0.88;
    transform: scaleX(1);
  }
}

@media (max-width: 575.98px) {
  .frog-reminder {
    top: auto;
    right: 0.75rem;
    bottom: 0.75rem;
    left: 0.75rem;
    width: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .frog-reminder,
  .frog-reminder__pulse {
    animation: none;
    transition: none;
  }
}
</style>
