<template lang="pug">
div.time-block-page
  div.time-block-header
    div
      div.section-label Time blocking
      h3.mb-1 Plan the day
      div.time-block-subtitle {{ dayLabel }} - {{ blockSummary }}
    div.time-block-header-actions
      b-button-group(size="sm")
        b-button(variant="outline-secondary" title="Previous day" @click="shiftDay(-1)")
          icon(name="chevron-left")
        b-button(:variant="isToday ? 'primary' : 'outline-secondary'" @click="goToday") Today
        b-button(variant="outline-secondary" title="Next day" @click="shiftDay(1)")
          icon(name="chevron-right")
      b-button(size="sm" variant="primary" type="button" @click="startNewBlock()")
        icon.mr-1(name="plus")
        | New block

  div.time-block-layout
    section.time-block-panel.time-block-editor
      div.time-block-panel-head
        div
          div.section-label {{ editingId ? 'Edit' : 'New' }}
          h5.mb-0 {{ editingId ? 'Edit block' : 'Add time block' }}
        b-button(
          v-if="editingId"
          size="sm"
          variant="outline-secondary"
          type="button"
          @click="startNewBlock()"
        )
          icon.mr-1(name="plus")
          | New

      b-form(@submit.prevent="saveBlock")
        b-form-group(label="Title" label-for="time-block-title")
          b-form-input#time-block-title(
            v-model.trim="draft.title"
            placeholder="Write intro, gym, dinner..."
            autocomplete="off"
          )
        div.time-block-form-grid
          b-form-group(label="Category" label-for="time-block-type")
            b-form-select#time-block-type(v-model="draft.type" :options="blockTypeOptions")
          b-form-group(label="Date" label-for="time-block-date")
            b-form-input#time-block-date(v-model="draft.date" type="date")
        div.time-block-form-grid
          b-form-group(label="Start" label-for="time-block-start")
            b-form-input#time-block-start(v-model="draft.start" type="time" step="300")
          b-form-group(label="End" label-for="time-block-end")
            b-form-input#time-block-end(v-model="draft.end" type="time" step="300")
        div.time-block-validation(v-if="draft.title && !canSaveBlock")
          | End time has to be after start time.
        b-form-group(label="Notes" label-for="time-block-notes")
          b-form-textarea#time-block-notes(v-model.trim="draft.notes" rows="2")
        div.time-block-editor-actions
          b-button(type="submit" variant="primary" :disabled="!canSaveBlock")
            icon.mr-1(name="save")
            | {{ editingId ? 'Save' : 'Add' }}
          b-button(variant="outline-secondary" type="button" @click="startNewBlock()")
            icon.mr-1(name="times")
            | Clear
          b-button(
            v-if="editingId"
            variant="outline-danger"
            type="button"
            @click="deleteBlock(editingId)"
          )
            icon.mr-1(name="trash")
            | Delete

      div.time-block-templates
        div.time-block-panel-head.time-block-panel-head--small
          div
            div.section-label Templates
            h6.mb-0 Quick blocks
        div.time-block-template-grid
          button.time-block-template(
            v-for="template in templates"
            :key="template.key"
            type="button"
            :style="{ borderColor: blockTypeColor(template.type) }"
            @click="applyTemplate(template)"
          )
            icon(name="magic")
            span {{ template.title }}
            small {{ template.start }}-{{ template.end }}

    main.time-block-main
      section.time-block-panel.time-block-summary
        div.time-block-stat.time-block-stat--work
          span Work planned
          strong {{ durationLabel(workMinutes) }}
        div.time-block-stat.time-block-stat--life
          span Life planned
          strong {{ durationLabel(lifeMinutes) }}
        div.time-block-stat.time-block-stat--open
          span Open time
          strong {{ durationLabel(openMinutes) }}

      section.time-block-panel.time-block-day-card
        div.time-block-day-head
          div
            h4.mb-1 24-hour day
            div.text-muted Click an empty half-hour slot to add a block.
          div.time-block-total
            icon(name="clock")
            strong {{ durationLabel(plannedMinutes) }}
            span planned

        div.time-block-empty(v-if="dayBlocks.length === 0")
          icon(name="calendar-week")
          strong No blocks yet
          span Click the day grid or use a template to start.

        div.time-block-schedule-wrap
          div.time-block-hour-rail(:style="{ height: scheduleHeight + 'px' }")
            div.time-block-hour-label(
              v-for="tick in hourTicks"
              :key="tick.minute"
              :style="{ top: minuteTop(tick.minute) }"
            )
              span {{ tick.label }}
          div.time-block-grid(:style="{ height: scheduleHeight + 'px' }")
            div.time-block-hour-line(
              v-for="tick in hourTicks"
              :key="'line-' + tick.minute"
              :style="{ top: minuteTop(tick.minute) }"
            )
            button.time-block-slot(
              v-for="slot in timeSlots"
              :key="slot.minute"
              type="button"
              :title="'Add block at ' + slot.label"
              :style="{ top: minuteTop(slot.minute), height: slotHeight(30) }"
              @click="openSlot(slot)"
            )
            div.time-block-now-line(v-if="showNowLine" :style="nowLineStyle")
              span Now
            button.time-block-event(
              v-for="block in dayBlocks"
              :key="block.id"
              type="button"
              :class="blockClass(block)"
              :style="blockStyle(block)"
              @click.stop="editBlock(block)"
            )
              span.time-block-event-time {{ block.start }}-{{ block.end }}
              strong {{ block.title }}
              small {{ blockTypeLabel(block.type) }} - {{ durationLabel(blockDuration(block)) }}
              p(v-if="block.notes") {{ block.notes }}
</template>

<script lang="ts">
import 'vue-awesome/icons/calendar-week';
import 'vue-awesome/icons/chevron-left';
import 'vue-awesome/icons/chevron-right';
import 'vue-awesome/icons/clock';
import 'vue-awesome/icons/magic';
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/save';
import 'vue-awesome/icons/times';
import 'vue-awesome/icons/trash';
import moment from 'moment';

type TimeBlockType = 'work' | 'deep-work' | 'email-admin' | 'life' | 'break';

interface TimeBlock {
  id: string;
  title: string;
  type: TimeBlockType;
  date: string;
  start: string;
  end: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface TimeBlockDraft {
  title: string;
  type: TimeBlockType;
  date: string;
  start: string;
  end: string;
  notes: string;
}

interface TimeBlockTemplate {
  key: string;
  title: string;
  type: TimeBlockType;
  start: string;
  end: string;
  notes: string;
}

interface TimeSlot {
  minute: number;
  label: string;
}

const TIME_BLOCK_STORAGE_KEY = 'focusfrog.timeBlocks.v1';
const TIME_BLOCK_SERVER_KEY = 'timeBlocks';
const SCHEDULE_HEIGHT = 1248;
const DAY_MINUTES = 24 * 60;

const BLOCK_TYPE_CONFIG: Record<
  TimeBlockType,
  { text: string; color: string; soft: string; kind: 'work' | 'life' }
> = {
  work: { text: 'Work', color: '#10b981', soft: 'rgba(16, 185, 129, 0.14)', kind: 'work' },
  'deep-work': {
    text: 'Deep work',
    color: '#2563eb',
    soft: 'rgba(37, 99, 235, 0.14)',
    kind: 'work',
  },
  'email-admin': {
    text: 'Email & admin',
    color: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.16)',
    kind: 'work',
  },
  life: { text: 'Life', color: '#ec4899', soft: 'rgba(236, 72, 153, 0.14)', kind: 'life' },
  break: { text: 'Break', color: '#06b6d4', soft: 'rgba(6, 182, 212, 0.14)', kind: 'life' },
};

function today(): string {
  return moment().format('YYYY-MM-DD');
}

function blankDraft(date = today()): TimeBlockDraft {
  return {
    title: '',
    type: 'work',
    date,
    start: '09:00',
    end: '10:00',
    notes: '',
  };
}

function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES - 1, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function blockConfig(type: TimeBlockType) {
  return BLOCK_TYPE_CONFIG[type] || BLOCK_TYPE_CONFIG.work;
}

export default {
  name: 'TimeBlocking',
  data() {
    return {
      blocks: [] as TimeBlock[],
      selectedDate: today(),
      draft: blankDraft(),
      editingId: '',
      nowTick: Date.now(),
      nowTimer: 0,
      templates: [
        {
          key: 'deep-morning',
          title: 'Deep work',
          type: 'deep-work',
          start: '09:00',
          end: '11:00',
          notes: 'One important thing, no context switching.',
        },
        {
          key: 'email-admin',
          title: 'Email & admin',
          type: 'email-admin',
          start: '11:00',
          end: '12:00',
          notes: '',
        },
        {
          key: 'lunch',
          title: 'Lunch',
          type: 'break',
          start: '12:30',
          end: '13:30',
          notes: '',
        },
        {
          key: 'evening-life',
          title: 'Life block',
          type: 'life',
          start: '18:00',
          end: '20:00',
          notes: '',
        },
      ] as TimeBlockTemplate[],
    };
  },
  computed: {
    scheduleHeight(): number {
      return SCHEDULE_HEIGHT;
    },
    dayLabel(): string {
      return moment(this.selectedDate, 'YYYY-MM-DD').format('dddd, MMM D');
    },
    isToday(): boolean {
      return this.selectedDate === today();
    },
    blockTypeOptions() {
      return Object.entries(BLOCK_TYPE_CONFIG).map(([value, config]) => ({
        value,
        text: config.text,
      }));
    },
    dayBlocks(): TimeBlock[] {
      return this.blocks
        .filter(block => block.date === this.selectedDate)
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    },
    plannedMinutes(): number {
      return this.dayBlocks.reduce((total, block) => total + this.blockDuration(block), 0);
    },
    workMinutes(): number {
      return this.dayBlocks
        .filter(block => blockConfig(block.type).kind === 'work')
        .reduce((total, block) => total + this.blockDuration(block), 0);
    },
    lifeMinutes(): number {
      return this.dayBlocks
        .filter(block => blockConfig(block.type).kind === 'life')
        .reduce((total, block) => total + this.blockDuration(block), 0);
    },
    openMinutes(): number {
      return Math.max(0, DAY_MINUTES - this.plannedMinutes);
    },
    blockSummary(): string {
      if (this.dayBlocks.length === 0) return 'no blocks yet';
      return `${this.dayBlocks.length} blocks, ${this.durationLabel(this.plannedMinutes)} planned`;
    },
    canSaveBlock(): boolean {
      return Boolean(
        this.draft.title &&
          this.draft.date &&
          this.isValidTimeRange(this.draft.start, this.draft.end)
      );
    },
    hourTicks() {
      return Array.from({ length: 25 }, (_value, hour) => ({
        minute: hour * 60,
        label: `${String(hour).padStart(2, '0')}:00`,
      }));
    },
    timeSlots(): TimeSlot[] {
      return Array.from({ length: 48 }, (_value, index) => {
        const minute = index * 30;
        return {
          minute,
          label: minutesToTime(minute),
        };
      });
    },
    showNowLine(): boolean {
      return this.isToday;
    },
    nowLineStyle() {
      void this.nowTick;
      const now = moment();
      const minute = now.hours() * 60 + now.minutes();
      return { top: this.minuteTop(minute) };
    },
  },
  watch: {
    selectedDate(date: string) {
      if (!this.editingId) {
        this.draft.date = date;
      }
    },
  },
  mounted() {
    this.loadBlocks();
    void this.loadServerBlocks();
    this.nowTimer = window.setInterval(() => {
      this.nowTick = Date.now();
    }, 60 * 1000);
  },
  beforeDestroy() {
    if (this.nowTimer) window.clearInterval(this.nowTimer);
  },
  methods: {
    async loadServerValue(key: string) {
      if (typeof fetch === 'undefined') return null;
      try {
        const response = await fetch(`/focusfrog-storage/${key}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.value ?? null;
      } catch (err) {
        console.warn('Could not load FocusFrog server storage:', key, err);
        return null;
      }
    },
    saveServerValue(key: string, value: unknown) {
      if (typeof fetch === 'undefined') return;
      fetch(`/focusfrog-storage/${key}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      }).catch(err => {
        console.warn('Could not save FocusFrog server storage:', key, err);
      });
    },
    async loadServerBlocks() {
      const serverBlocks = await this.loadServerValue(TIME_BLOCK_SERVER_KEY);
      if (Array.isArray(serverBlocks) && serverBlocks.length > 0) {
        const merged = this.mergeBlocks(
          this.blocks,
          serverBlocks.map(block => this.normalizeBlock(block))
        );
        if (JSON.stringify(merged) !== JSON.stringify(this.blocks)) {
          this.blocks = merged;
          this.saveBlocks(false);
        }
      } else if (this.blocks.length > 0) {
        this.saveServerValue(TIME_BLOCK_SERVER_KEY, this.blocks);
      }
    },
    loadBlocks() {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(TIME_BLOCK_STORAGE_KEY);
        this.blocks = raw ? JSON.parse(raw).map(block => this.normalizeBlock(block)) : [];
      } catch (err) {
        console.error('Could not load time blocks:', err);
        this.blocks = [];
      }
    },
    saveBlocks(syncServer = true) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TIME_BLOCK_STORAGE_KEY, JSON.stringify(this.blocks));
      }
      if (syncServer) this.saveServerValue(TIME_BLOCK_SERVER_KEY, this.blocks);
    },
    normalizeBlock(block): TimeBlock {
      const date = moment(block?.date, 'YYYY-MM-DD', true).isValid() ? block.date : today();
      const start = this.validTimeOrDefault(block?.start, '09:00');
      const fallbackEnd = minutesToTime(Math.min(DAY_MINUTES - 1, timeToMinutes(start) + 60));
      const end = this.validTimeOrDefault(block?.end, fallbackEnd);
      return {
        id: typeof block?.id === 'string' ? block.id : `block-${Date.now()}`,
        title: typeof block?.title === 'string' && block.title ? block.title : 'Untitled block',
        type: BLOCK_TYPE_CONFIG[block?.type] ? block.type : 'work',
        date,
        start,
        end: this.isValidTimeRange(start, end) ? end : fallbackEnd,
        notes: typeof block?.notes === 'string' ? block.notes : '',
        createdAt: typeof block?.createdAt === 'string' ? block.createdAt : moment().toISOString(),
        updatedAt: typeof block?.updatedAt === 'string' ? block.updatedAt : moment().toISOString(),
      };
    },
    mergeBlocks(localBlocks: TimeBlock[], serverBlocks: TimeBlock[]): TimeBlock[] {
      const byId = new Map<string, TimeBlock>();
      const score = (block: TimeBlock) => moment(block.updatedAt || block.createdAt || 0).valueOf();
      [...serverBlocks, ...localBlocks].forEach(block => {
        const normalized = this.normalizeBlock(block);
        const existing = byId.get(normalized.id);
        if (!existing || score(normalized) >= score(existing)) {
          byId.set(normalized.id, normalized);
        }
      });
      return Array.from(byId.values()).sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return timeToMinutes(a.start) - timeToMinutes(b.start);
      });
    },
    validTimeOrDefault(value: string, fallback: string): string {
      return Number.isFinite(timeToMinutes(value)) ? value : fallback;
    },
    isValidTimeRange(start: string, end: string): boolean {
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      return (
        Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes
      );
    },
    shiftDay(days: number) {
      this.selectedDate = moment(this.selectedDate, 'YYYY-MM-DD')
        .add(days, 'days')
        .format('YYYY-MM-DD');
      this.startNewBlock({ date: this.selectedDate });
    },
    goToday() {
      this.selectedDate = today();
      this.startNewBlock({ date: this.selectedDate });
    },
    startNewBlock(prefill: Partial<TimeBlockDraft> = {}) {
      this.editingId = '';
      this.draft = {
        ...blankDraft(this.selectedDate),
        ...prefill,
      };
    },
    openSlot(slot: TimeSlot) {
      const endMinute = Math.min(DAY_MINUTES - 1, slot.minute + 60);
      this.startNewBlock({
        date: this.selectedDate,
        start: minutesToTime(slot.minute),
        end: minutesToTime(endMinute),
      });
    },
    applyTemplate(template: TimeBlockTemplate) {
      this.startNewBlock({
        title: template.title,
        type: template.type,
        date: this.selectedDate,
        start: template.start,
        end: template.end,
        notes: template.notes,
      });
    },
    editBlock(block: TimeBlock) {
      this.editingId = block.id;
      this.draft = {
        title: block.title,
        type: block.type,
        date: block.date,
        start: block.start,
        end: block.end,
        notes: block.notes,
      };
    },
    saveBlock() {
      if (!this.canSaveBlock) return;
      const now = moment().toISOString();
      const normalized = this.normalizeBlock({
        id: this.editingId || `time-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...this.draft,
        createdAt: this.blocks.find(block => block.id === this.editingId)?.createdAt || now,
        updatedAt: now,
      });
      if (this.editingId) {
        this.blocks = this.blocks.map(block => (block.id === this.editingId ? normalized : block));
      } else {
        this.blocks = [...this.blocks, normalized];
      }
      this.selectedDate = normalized.date;
      this.saveBlocks();
      this.startNewBlock({
        date: normalized.date,
        start: normalized.end,
        end: this.nextHour(normalized.end),
      });
    },
    deleteBlock(blockId: string) {
      if (!blockId) return;
      this.blocks = this.blocks.filter(block => block.id !== blockId);
      this.saveBlocks();
      this.startNewBlock();
    },
    nextHour(time: string): string {
      const start = timeToMinutes(time);
      if (!Number.isFinite(start)) return '10:00';
      return minutesToTime(Math.min(DAY_MINUTES - 1, start + 60));
    },
    blockDuration(block: TimeBlock): number {
      return Math.max(0, timeToMinutes(block.end) - timeToMinutes(block.start));
    },
    blockTypeLabel(type: TimeBlockType): string {
      return blockConfig(type).text;
    },
    blockTypeColor(type: TimeBlockType): string {
      return blockConfig(type).color;
    },
    durationLabel(minutes: number): string {
      const safeMinutes = Math.max(0, Math.round(minutes));
      const hours = Math.floor(safeMinutes / 60);
      const mins = safeMinutes % 60;
      if (hours && mins) return `${hours}h ${mins}m`;
      if (hours) return `${hours}h`;
      return `${mins}m`;
    },
    minuteTop(minute: number): string {
      return `${(minute / DAY_MINUTES) * SCHEDULE_HEIGHT}px`;
    },
    slotHeight(minutes: number): string {
      return `${(minutes / DAY_MINUTES) * SCHEDULE_HEIGHT}px`;
    },
    blockStyle(block: TimeBlock) {
      const start = timeToMinutes(block.start);
      const duration = this.blockDuration(block);
      const config = blockConfig(block.type);
      return {
        top: this.minuteTop(start),
        minHeight: '2.4rem',
        height: `max(2.4rem, ${this.slotHeight(duration)})`,
        '--block-color': config.color,
        '--block-soft': config.soft,
      };
    },
    blockClass(block: TimeBlock) {
      return {
        'time-block-event--editing': this.editingId === block.id,
        'time-block-event--overlap': this.hasOverlap(block),
      };
    },
    hasOverlap(block: TimeBlock): boolean {
      const start = timeToMinutes(block.start);
      const end = timeToMinutes(block.end);
      return this.dayBlocks.some(other => {
        if (other.id === block.id) return false;
        const otherStart = timeToMinutes(other.start);
        const otherEnd = timeToMinutes(other.end);
        return start < otherEnd && end > otherStart;
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.time-block-page {
  padding: 1.4rem;
  color: #0f172a;
}

.time-block-header,
.time-block-panel-head,
.time-block-day-head,
.time-block-header-actions,
.time-block-editor-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.time-block-header {
  margin-bottom: 1rem;
}

.time-block-header-actions,
.time-block-editor-actions {
  align-items: center;
  flex-wrap: wrap;
}

.time-block-subtitle,
.time-block-validation,
.time-block-event p {
  color: #52627a;
}

.time-block-layout {
  display: grid;
  grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.time-block-main {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.time-block-panel {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.07);
}

.time-block-editor,
.time-block-day-card {
  padding: 1rem;
}

.time-block-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  padding: 0.75rem;
}

.time-block-stat {
  padding: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-top: 4px solid #94a3b8;
  border-radius: 8px;
  background: #ffffff;
}

.time-block-stat span,
.time-block-total span {
  display: block;
  color: #52627a;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.time-block-stat strong,
.time-block-total strong {
  color: #0f172a;
  font-size: 1.45rem;
  line-height: 1.15;
}

.time-block-stat--work {
  border-top-color: #10b981;
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.84), #ffffff);
}

.time-block-stat--life {
  border-top-color: #ec4899;
  background: linear-gradient(180deg, rgba(253, 242, 248, 0.9), #ffffff);
}

.time-block-stat--open {
  border-top-color: #2563eb;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.86), #ffffff);
}

.time-block-panel-head--small {
  margin-top: 1.1rem;
}

.time-block-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.time-block-validation {
  margin: -0.25rem 0 0.65rem;
  color: #be185d;
  font-weight: 700;
}

.time-block-template-grid {
  display: grid;
  gap: 0.55rem;
}

.time-block-template {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.55rem;
  align-items: center;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-left: 5px solid;
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.time-block-template:hover {
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.time-block-template small {
  color: #52627a;
  font-weight: 800;
}

.time-block-total {
  display: inline-grid;
  grid-template-columns: auto auto;
  column-gap: 0.35rem;
  align-items: center;
  text-align: right;
}

.time-block-total span {
  grid-column: 1 / -1;
}

.time-block-empty {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0.75rem 0;
  padding: 0.75rem;
  border: 1px dashed rgba(16, 185, 129, 0.38);
  border-radius: 8px;
  background: rgba(236, 253, 245, 0.42);
  color: #33506a;
}

.time-block-schedule-wrap {
  display: grid;
  grid-template-columns: 4.4rem minmax(0, 1fr);
  margin-top: 1rem;
  max-height: min(72vh, 62rem);
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  background: #ffffff;
}

.time-block-hour-rail,
.time-block-grid {
  position: relative;
}

.time-block-hour-rail {
  border-right: 1px solid rgba(148, 163, 184, 0.34);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), #ffffff);
}

.time-block-hour-label {
  position: absolute;
  right: 0.62rem;
  color: #334155;
  font-size: 0.74rem;
  font-weight: 900;
  transform: translateY(-50%);
}

.time-block-hour-line,
.time-block-slot,
.time-block-now-line,
.time-block-event {
  position: absolute;
}

.time-block-hour-line {
  right: 0;
  left: 0;
  height: 1px;
  background: rgba(148, 163, 184, 0.26);
  pointer-events: none;
}

.time-block-slot {
  right: 0;
  left: 0;
  border: 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.62);
  background: transparent;
  cursor: cell;
}

.time-block-slot:hover {
  background: linear-gradient(90deg, rgba(236, 253, 245, 0.56), rgba(253, 242, 248, 0.42));
}

.time-block-now-line {
  right: 0.75rem;
  left: 0.75rem;
  z-index: 5;
  height: 2px;
  background: #ec4899;
  box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.12);
}

.time-block-now-line span {
  position: absolute;
  right: 0;
  top: -0.78rem;
  padding: 0.08rem 0.42rem;
  border-radius: 999px;
  background: #ec4899;
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 900;
}

.time-block-event {
  right: 0.75rem;
  left: 0.75rem;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.08rem;
  padding: 0.42rem 0.58rem;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-left: 6px solid var(--block-color);
  border-radius: 8px;
  background: linear-gradient(135deg, var(--block-soft), rgba(255, 255, 255, 0.96));
  color: #0f172a;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.09);
  cursor: pointer;
  overflow: hidden;
  text-align: left;
}

.time-block-event:hover,
.time-block-event--editing {
  border-color: var(--block-color);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.13);
}

.time-block-event--overlap {
  outline: 2px solid rgba(236, 72, 153, 0.46);
  outline-offset: 2px;
}

.time-block-event-time,
.time-block-event small {
  color: #52627a;
  font-size: 0.74rem;
  font-weight: 800;
}

.time-block-event strong {
  line-height: 1.1;
}

.time-block-event p {
  width: 100%;
  margin: 0.06rem 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html[data-dashboard-theme='flower'] .time-block-page {
  color: #102033;
}

html[data-dashboard-theme='flower'] .time-block-panel,
html[data-dashboard-theme='flower'] .time-block-schedule-wrap,
html[data-dashboard-theme='flower'] .time-block-template,
html[data-dashboard-theme='flower'] .time-block-stat {
  background: rgba(255, 253, 245, 0.95);
}

html[data-dashboard-theme='contrast'] .time-block-page {
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .time-block-panel,
html[data-dashboard-theme='contrast'] .time-block-schedule-wrap,
html[data-dashboard-theme='contrast'] .time-block-template,
html[data-dashboard-theme='contrast'] .time-block-stat {
  border-color: rgba(148, 163, 184, 0.34);
  background: #111827;
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .time-block-subtitle,
html[data-dashboard-theme='contrast'] .time-block-stat span,
html[data-dashboard-theme='contrast'] .time-block-total span,
html[data-dashboard-theme='contrast'] .time-block-template small,
html[data-dashboard-theme='contrast'] .time-block-event-time,
html[data-dashboard-theme='contrast'] .time-block-event small,
html[data-dashboard-theme='contrast'] .time-block-event p,
html[data-dashboard-theme='contrast'] .time-block-empty,
html[data-dashboard-theme='contrast'] .text-muted {
  color: #dbeafe !important;
}

html[data-dashboard-theme='contrast'] .time-block-stat strong,
html[data-dashboard-theme='contrast'] .time-block-total strong {
  color: #ffffff;
}

html[data-dashboard-theme='contrast'] .time-block-hour-rail {
  border-right-color: rgba(148, 163, 184, 0.4);
  background: #0f172a;
}

html[data-dashboard-theme='contrast'] .time-block-hour-label,
html[data-dashboard-theme='contrast'] .time-block-event,
html[data-dashboard-theme='contrast'] .time-block-template {
  color: #ffffff;
}

html[data-dashboard-theme='contrast'] .time-block-event {
  border-color: rgba(148, 163, 184, 0.34);
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.98));
}

html[data-dashboard-theme='contrast'] .time-block-hour-line {
  background: rgba(148, 163, 184, 0.34);
}

@media (max-width: 960px) {
  .time-block-layout,
  .time-block-summary {
    grid-template-columns: 1fr;
  }

  .time-block-header,
  .time-block-day-head {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .time-block-page {
    padding: 0.85rem;
  }

  .time-block-form-grid {
    grid-template-columns: 1fr;
  }

  .time-block-schedule-wrap {
    grid-template-columns: 3.6rem minmax(24rem, 1fr);
  }
}
</style>
