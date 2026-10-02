<template lang="pug">
div.cal-page
  header.cal-header
    div.cal-title
      div.section-label Time blocking
      h3.mb-0 {{ rangeTitle }}
      div.cal-subtitle {{ rangeSummary }}
    div.cal-toolbar
      b-button-group(size="sm")
        b-button(
          variant="outline-secondary"
          :title="'Previous ' + viewNoun"
          :aria-label="'Previous ' + viewNoun"
          @click="shiftRange(-1)"
        )
          icon(name="chevron-left")
        b-button(:variant="rangeIncludesToday ? 'primary' : 'outline-secondary'" @click="goToday") Today
        b-button(
          variant="outline-secondary"
          :title="'Next ' + viewNoun"
          :aria-label="'Next ' + viewNoun"
          @click="shiftRange(1)"
        )
          icon(name="chevron-right")
      b-button-group(size="sm" aria-label="Calendar view")
        b-button(
          v-for="option in viewOptions"
          :key="option.value"
          :variant="viewMode === option.value ? 'primary' : 'outline-secondary'"
          :aria-pressed="viewMode === option.value ? 'true' : 'false'"
          @click="setViewMode(option.value)"
        ) {{ option.text }}
      b-button(
        size="sm"
        :variant="sidebarOpen ? 'outline-secondary' : 'secondary'"
        :aria-pressed="sidebarOpen ? 'true' : 'false'"
        :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
        :aria-label="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
        @click="toggleSidebar"
      )
        icon(name="columns")
      b-button(size="sm" variant="primary" @click="openNewBlock()")
        icon.mr-1(name="plus")
        | New block

  div.cal-layout(:class="{ 'cal-layout--wide': !sidebarOpen }")
    aside.cal-sidebar(v-if="sidebarOpen")
      section.cal-panel.cal-month
        div.cal-month-head
          button.cal-icon-button(type="button" aria-label="Previous month" @click="shiftMonth(-1)")
            icon(name="chevron-left")
          strong {{ monthLabel }}
          button.cal-icon-button(type="button" aria-label="Next month" @click="shiftMonth(1)")
            icon(name="chevron-right")
        div.cal-month-grid
          span.cal-month-weekday(v-for="(day, index) in weekdayInitials" :key="'wd-' + index") {{ day }}
          button.cal-month-day(
            v-for="day in monthDays"
            :key="day.date"
            type="button"
            :class="{ 'cal-month-day--outside': !day.inMonth, 'cal-month-day--today': day.isToday, 'cal-month-day--in-range': day.inRange }"
            :aria-label="day.label"
            :aria-current="day.isToday ? 'date' : null"
            @click="focusOn(day.date)"
          )
            span {{ day.dayNumber }}
            span.cal-month-dot(v-if="day.hasBlocks" aria-hidden="true")

      section.cal-panel
        div.cal-panel-label {{ statsLabel }}
        div.cal-stats
          div.cal-stat.cal-stat--work
            span Work
            strong {{ durationLabel(workMinutes) }}
          div.cal-stat.cal-stat--life
            span Life
            strong {{ durationLabel(lifeMinutes) }}
          div.cal-stat.cal-stat--total
            span Planned
            strong {{ durationLabel(plannedMinutes) }}

      section.cal-panel
        div.cal-panel-label
          | Categories
          button.cal-text-button(v-if="hiddenTypes.length > 0" type="button" @click="showAllTypes") Show all
        div.cal-category-list
          button.cal-category(
            v-for="option in categoryOptions"
            :key="option.value"
            type="button"
            :class="{ 'cal-category--hidden': hiddenTypes.includes(option.value) }"
            :style="{ '--block-color': option.color }"
            :aria-pressed="hiddenTypes.includes(option.value) ? 'false' : 'true'"
            :title="hiddenTypes.includes(option.value) ? 'Show ' + option.text : 'Hide ' + option.text"
            @click="toggleType(option.value)"
          )
            span.cal-category-swatch
            span.cal-category-name {{ option.text }}
            span.cal-category-hours {{ option.minutes ? durationLabel(option.minutes) : '' }}

      section.cal-panel
        div.cal-panel-label Quick blocks
        div.cal-template-list
          button.cal-template(
            v-for="template in templates"
            :key="template.key"
            type="button"
            :style="{ '--block-color': blockTypeColor(template.type) }"
            :title="'Add ' + template.title + ' on ' + focusLabel"
            @click="applyTemplate(template)"
          )
            span.cal-category-swatch
            span.cal-template-name {{ template.title }}
            small {{ template.start }}–{{ template.end }}

    main.cal-panel.cal-board
      div.cal-scroll(ref="scroll")
        div.cal-head-row(:style="gridStyle")
          div.cal-corner
          div.cal-day-head(
            v-for="day in visibleDays"
            :key="'head-' + day.date"
            :class="{ 'cal-day-head--today': day.isToday, 'cal-day-head--weekend': day.isWeekend }"
          )
            button.cal-day-head-button(
              type="button"
              :title="viewMode === 'day' ? day.long : 'Open ' + day.long"
              @click="openDay(day.date)"
            )
              span.cal-day-weekday {{ day.weekday }}
              span.cal-day-number {{ day.dayNumber }}
            span.cal-day-load(v-if="day.plannedMinutes > 0") {{ durationLabel(day.plannedMinutes) }}
        div.cal-body-row(:style="gridStyle")
          div.cal-rail(:style="{ height: scheduleHeight + 'px' }")
            span.cal-rail-label(
              v-for="tick in hourTicks"
              :key="tick.minute"
              :style="{ top: minuteTop(tick.minute) }"
            ) {{ tick.label }}
          div.cal-column(
            v-for="(day, dayIndex) in visibleDays"
            :key="'col-' + day.date"
            ref="dayColumns"
            :class="{ 'cal-column--today': day.isToday, 'cal-column--weekend': day.isWeekend }"
            :style="{ height: scheduleHeight + 'px' }"
            @pointerdown="startCreate(day.date, $event)"
          )
            div.cal-selection(
              v-if="drag && drag.mode === 'create' && drag.date === day.date"
              :style="rangeStyle(drag.startMinute, drag.endMinute)"
            )
              span {{ minutesToTime(drag.startMinute) }}–{{ minutesToTime(drag.endMinute) }}
            button.cal-event(
              v-for="item in eventsByDate[day.date]"
              :key="item.key"
              type="button"
              :class="eventClass(item)"
              :style="eventStyle(item)"
              :aria-label="eventAriaLabel(item)"
              @pointerdown.stop="startMove(item, $event)"
              @click.stop="handleEventClick(item)"
            )
              span.cal-event-title {{ item.block.title }}
              span.cal-event-time
                icon.cal-event-repeat(v-if="isRepeating(item.block)" name="redo" scale="0.55")
                | {{ eventTimeLabel(item) }}
              span.cal-event-notes(v-if="item.block.notes") {{ item.block.notes }}
              span.cal-event-resize(
                aria-hidden="true"
                title="Drag to change the end time"
                @pointerdown.stop="startResize(item, $event)"
              )
            div.cal-event.cal-event--ghost(
              v-if="ghost && ghost.date === day.date"
              :style="ghost.style"
              aria-hidden="true"
            )
              span.cal-event-title {{ ghost.title }}
              span.cal-event-time {{ minutesToTime(ghost.startMinute) }}–{{ minutesToTime(ghost.endMinute) }}
            div.cal-now(v-if="day.isToday" :style="{ top: minuteTop(nowMinute) }" aria-hidden="true")
      p.cal-hint
        | Drag on the calendar to block time · drag a block to move it, its bottom edge to resize · ← → to browse, T for today

  b-modal(
    id="cal-block-editor"
    v-model="editorOpen"
    :title="editingId ? 'Edit block' : 'New block'"
    centered
    hide-footer
    @shown="focusEditorTitle"
    @hidden="resetEditor"
  )
    b-form.cal-editor(@submit.prevent="saveDraft")
      b-form-group(label="Title" label-for="cal-block-title")
        b-form-input#cal-block-title(
          ref="titleInput"
          v-model.trim="draft.title"
          placeholder="Write intro, gym, dinner..."
          autocomplete="off"
        )
      b-form-group(label="Category")
        div.cal-type-picker(role="radiogroup" aria-label="Category")
          button.cal-type-chip(
            v-for="option in categoryOptions"
            :key="'type-' + option.value"
            type="button"
            role="radio"
            :aria-checked="draft.type === option.value ? 'true' : 'false'"
            :class="{ 'cal-type-chip--active': draft.type === option.value }"
            :style="{ '--block-color': option.color, '--block-soft': option.soft }"
            @click="draft.type = option.value"
          )
            span.cal-category-swatch
            | {{ option.text }}
      div.cal-editor-grid
        b-form-group(:label="draft.repeat === 'none' ? 'Date' : 'Starts on'" label-for="cal-block-date")
          b-form-input#cal-block-date(v-model="draft.date" type="date" @input="syncRepeatDays")
        b-form-group(label="Start" label-for="cal-block-start")
          b-form-input#cal-block-start(v-model="draft.start" type="time" step="300")
        b-form-group(label="End" label-for="cal-block-end")
          b-form-input#cal-block-end(v-model="draft.end" type="time" step="300")
      div.cal-validation(v-if="draft.title && !draftTimesValid") End time has to be after the start time.
      b-form-group(label="Repeat" label-for="cal-block-repeat")
        b-form-select#cal-block-repeat(v-model="draft.repeat" :options="repeatOptions")
      div.cal-weekday-picker(
        v-if="draft.repeat === 'weekly' || draft.repeat === 'biweekly'"
        role="group"
        aria-label="Repeat on"
      )
        button.cal-weekday(
          v-for="day in weekdayChoices"
          :key="'repeat-' + day.value"
          type="button"
          :class="{ 'cal-weekday--active': draft.repeatDays.includes(day.value) }"
          :aria-pressed="draft.repeatDays.includes(day.value) ? 'true' : 'false'"
          :aria-label="day.long"
          @click="toggleRepeatDay(day.value)"
        ) {{ day.short }}
      div.cal-repeat-end(v-if="draft.repeat !== 'none'")
        b-form-checkbox(v-model="draftHasEnd" switch) Ends on a date
        b-form-input(
          v-if="draftHasEnd"
          v-model="draft.repeatUntil"
          type="date"
          size="sm"
          :min="draft.date"
          aria-label="Last day of the repeat"
        )
      b-form-group(label="Notes" label-for="cal-block-notes")
        b-form-textarea#cal-block-notes(v-model.trim="draft.notes" rows="2")
      div.cal-editor-note(v-if="editingSeries")
        icon(name="redo" scale="0.75")
        span Changes apply to every event in this series.
      div.cal-editor-actions
        b-button(type="submit" variant="primary" :disabled="!canSaveDraft") {{ editingId ? 'Save' : 'Add block' }}
        b-button(variant="outline-secondary" type="button" @click="editorOpen = false") Cancel
        span.cal-editor-spacer
        b-button(
          v-if="editingId && editingSeries"
          variant="outline-danger"
          type="button"
          @click="deleteOccurrence"
        ) Delete this event
        b-button(v-if="editingId" variant="outline-danger" type="button" @click="deleteEditingBlock")
          icon.mr-1(name="trash")
          | {{ editingSeries ? 'Delete series' : 'Delete' }}
</template>

<script lang="ts">
import 'vue-awesome/icons/chevron-left';
import 'vue-awesome/icons/chevron-right';
import 'vue-awesome/icons/columns';
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/redo';
import 'vue-awesome/icons/trash';
import moment from 'moment';
import {
  BlockOccurrence,
  DAY_MINUTES,
  describeRepeat,
  endTimeToMinutes,
  isoWeekday,
  isRepeating,
  isValidDate,
  layoutDay,
  minutesToTime,
  occurrencesForDates,
  occursOn,
  PositionedOccurrence,
  REPEAT_RULES,
  RepeatRule,
  shiftSeries,
  TimeBlock,
  TimeBlockType,
  timeToMinutes,
} from '~/util/calendarBlocks';

type ViewMode = 'day' | '3day' | 'week';

interface TimeBlockDraft {
  title: string;
  type: TimeBlockType;
  date: string;
  start: string;
  end: string;
  notes: string;
  repeat: RepeatRule;
  repeatDays: number[];
  repeatUntil: string;
}

interface TimeBlockTemplate {
  key: string;
  title: string;
  type: TimeBlockType;
  start: string;
  end: string;
  notes: string;
}

interface DragState {
  mode: 'create' | 'move' | 'resize';
  moved: boolean;
  startX: number;
  startY: number;
  date: string;
  anchorMinute: number;
  startMinute: number;
  endMinute: number;
  occurrence: BlockOccurrence | null;
}

const TIME_BLOCK_STORAGE_KEY = 'focusfrog.timeBlocks.v1';
const TIME_BLOCK_SERVER_KEY = 'timeBlocks';
const VIEW_STORAGE_KEY = 'focusfrog.timeBlocks.view';
const HIDDEN_TYPES_STORAGE_KEY = 'focusfrog.timeBlocks.hiddenTypes';
const SIDEBAR_STORAGE_KEY = 'focusfrog.timeBlocks.sidebar';
const HOUR_HEIGHT = 52;
const SNAP_MINUTES = 15;
const DRAG_THRESHOLD = 4;
const DATE_FORMAT = 'YYYY-MM-DD';

const BLOCK_TYPE_CONFIG: Record<
  TimeBlockType,
  { text: string; color: string; soft: string; kind: 'work' | 'life' }
> = {
  work: { text: 'Work', color: '#10b981', soft: 'rgba(16, 185, 129, 0.16)', kind: 'work' },
  'deep-work': {
    text: 'Deep work',
    color: '#2563eb',
    soft: 'rgba(37, 99, 235, 0.15)',
    kind: 'work',
  },
  'email-admin': {
    text: 'Email & admin',
    color: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.18)',
    kind: 'work',
  },
  life: { text: 'Life', color: '#ec4899', soft: 'rgba(236, 72, 153, 0.15)', kind: 'life' },
  break: { text: 'Break', color: '#06b6d4', soft: 'rgba(6, 182, 212, 0.16)', kind: 'life' },
};

const WEEKDAYS = [
  { value: 1, short: 'Mo', long: 'Monday' },
  { value: 2, short: 'Tu', long: 'Tuesday' },
  { value: 3, short: 'We', long: 'Wednesday' },
  { value: 4, short: 'Th', long: 'Thursday' },
  { value: 5, short: 'Fr', long: 'Friday' },
  { value: 6, short: 'Sa', long: 'Saturday' },
  { value: 7, short: 'Su', long: 'Sunday' },
];

function today(): string {
  return moment().format(DATE_FORMAT);
}

function blankDraft(date = today()): TimeBlockDraft {
  return {
    title: '',
    type: 'work',
    date,
    start: '09:00',
    end: '10:00',
    notes: '',
    repeat: 'none',
    repeatDays: [isoWeekday(date)],
    repeatUntil: '',
  };
}

function inputTime(time: string): string {
  return time === '24:00' ? '00:00' : time;
}

function blockConfig(type: TimeBlockType) {
  return BLOCK_TYPE_CONFIG[type] || BLOCK_TYPE_CONFIG.work;
}

function snap(minute: number, step = SNAP_MINUTES): number {
  return Math.round(minute / step) * step;
}

function readPreference(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function writePreference(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch (err) {
    // Preferences are a convenience; ignore storage failures.
  }
}

function initialViewMode(): ViewMode {
  const saved = readPreference(VIEW_STORAGE_KEY);
  if (saved === 'day' || saved === '3day' || saved === 'week') return saved;
  return typeof window !== 'undefined' && window.innerWidth < 720 ? 'day' : 'week';
}

function initialSidebarOpen(): boolean {
  const saved = readPreference(SIDEBAR_STORAGE_KEY);
  if (saved === 'open' || saved === 'closed') return saved === 'open';
  return typeof window === 'undefined' || window.innerWidth >= 1200;
}

function initialHiddenTypes(): TimeBlockType[] {
  try {
    const saved = JSON.parse(readPreference(HIDDEN_TYPES_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(type => BLOCK_TYPE_CONFIG[type]) : [];
  } catch (err) {
    return [];
  }
}

export default {
  name: 'TimeBlocking',
  data() {
    return {
      blocks: [] as TimeBlock[],
      focusDate: today(),
      monthDate: moment().startOf('month').format(DATE_FORMAT),
      viewMode: initialViewMode() as ViewMode,
      hiddenTypes: initialHiddenTypes(),
      sidebarOpen: initialSidebarOpen(),
      draft: blankDraft(),
      draftHasEnd: false,
      editingId: '',
      editingDate: '',
      editorOpen: false,
      drag: null as DragState | null,
      suppressClick: false,
      nowTick: Date.now(),
      nowTimer: 0,
      viewOptions: [
        { value: 'day', text: 'Day' },
        { value: '3day', text: '3 days' },
        { value: 'week', text: 'Week' },
      ],
      weekdayChoices: WEEKDAYS,
      weekdayInitials: WEEKDAYS.map(day => day.short.charAt(0)),
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
      return 24 * HOUR_HEIGHT;
    },
    rangeDates(): string[] {
      const focusMoment = moment(this.focusDate, DATE_FORMAT);
      if (this.viewMode === 'day') return [this.focusDate];
      const start =
        this.viewMode === 'week' ? focusMoment.clone().startOf('isoWeek') : focusMoment.clone();
      const count = this.viewMode === 'week' ? 7 : 3;
      return Array.from({ length: count }, (_value, index) =>
        start.clone().add(index, 'days').format(DATE_FORMAT)
      );
    },
    visibleDays() {
      const todayDate = today();
      return this.rangeDates.map(date => {
        const value = moment(date, DATE_FORMAT);
        return {
          date,
          weekday: value.format('ddd'),
          dayNumber: value.format('D'),
          long: value.format('dddd, MMM D'),
          isToday: date === todayDate,
          isWeekend: value.isoWeekday() >= 6,
          plannedMinutes: (this.occurrencesByDate[date] || []).reduce(
            (total, item) => total + (item.endMinute - item.startMinute),
            0
          ),
        };
      });
    },
    gridStyle() {
      const minWidth = this.viewMode === 'week' ? '6.6rem' : '9rem';
      return {
        gridTemplateColumns: `3.4rem repeat(${this.rangeDates.length}, minmax(${minWidth}, 1fr))`,
      };
    },
    rangeIncludesToday(): boolean {
      return this.rangeDates.includes(today());
    },
    viewNoun(): string {
      if (this.viewMode === 'day') return 'day';
      return this.viewMode === 'week' ? 'week' : '3 days';
    },
    rangeTitle(): string {
      const first = moment(this.rangeDates[0], DATE_FORMAT);
      const last = moment(this.rangeDates[this.rangeDates.length - 1], DATE_FORMAT);
      if (this.viewMode === 'day') return first.format('dddd, MMM D');
      if (first.isSame(last, 'month'))
        return `${first.format('MMM D')} – ${last.format('D, YYYY')}`;
      if (first.isSame(last, 'year')) {
        return `${first.format('MMM D')} – ${last.format('MMM D, YYYY')}`;
      }
      return `${first.format('MMM D, YYYY')} – ${last.format('MMM D, YYYY')}`;
    },
    rangeSummary(): string {
      const count = this.rangeOccurrences.length;
      if (count === 0) return 'Nothing planned yet — drag on the calendar to block time.';
      return `${count} block${count === 1 ? '' : 's'}, ${this.durationLabel(
        this.plannedMinutes
      )} planned`;
    },
    statsLabel(): string {
      if (this.viewMode === 'day') return this.rangeIncludesToday ? 'Today' : 'This day';
      return this.viewMode === 'week' ? 'This week' : 'These 3 days';
    },
    focusLabel(): string {
      return moment(this.focusDate, DATE_FORMAT).format('ddd, MMM D');
    },
    allRangeOccurrences(): BlockOccurrence[] {
      return occurrencesForDates(this.blocks, this.rangeDates);
    },
    rangeOccurrences(): BlockOccurrence[] {
      return this.allRangeOccurrences.filter(item => !this.hiddenTypes.includes(item.block.type));
    },
    occurrencesByDate(): Record<string, BlockOccurrence[]> {
      const byDate: Record<string, BlockOccurrence[]> = {};
      this.rangeDates.forEach(date => {
        byDate[date] = [];
      });
      this.rangeOccurrences.forEach(item => byDate[item.date].push(item));
      return byDate;
    },
    eventsByDate(): Record<string, PositionedOccurrence[]> {
      const byDate: Record<string, PositionedOccurrence[]> = {};
      Object.entries(this.occurrencesByDate).forEach(([date, items]) => {
        byDate[date] = layoutDay(items as BlockOccurrence[]);
      });
      return byDate;
    },
    plannedMinutes(): number {
      return this.sumMinutes(this.rangeOccurrences);
    },
    workMinutes(): number {
      return this.sumMinutes(
        this.rangeOccurrences.filter(item => blockConfig(item.block.type).kind === 'work')
      );
    },
    lifeMinutes(): number {
      return this.sumMinutes(
        this.rangeOccurrences.filter(item => blockConfig(item.block.type).kind === 'life')
      );
    },
    categoryOptions() {
      return Object.entries(BLOCK_TYPE_CONFIG).map(([value, config]) => ({
        value,
        text: config.text,
        color: config.color,
        soft: config.soft,
        minutes: this.sumMinutes(
          this.allRangeOccurrences.filter(item => item.block.type === value)
        ),
      }));
    },
    monthLabel(): string {
      return moment(this.monthDate, DATE_FORMAT).format('MMMM YYYY');
    },
    monthDays() {
      const month = moment(this.monthDate, DATE_FORMAT);
      const start = month.clone().startOf('isoWeek');
      const todayDate = today();
      const range = new Set(this.rangeDates);
      return Array.from({ length: 42 }, (_value, index) => {
        const value = start.clone().add(index, 'days');
        const date = value.format(DATE_FORMAT);
        return {
          date,
          dayNumber: value.format('D'),
          label: value.format('dddd, MMMM D'),
          inMonth: value.isSame(month, 'month'),
          isToday: date === todayDate,
          inRange: range.has(date),
          hasBlocks: this.blocks.some(
            block => !this.hiddenTypes.includes(block.type) && occursOn(block, date)
          ),
        };
      });
    },
    hourTicks() {
      return Array.from({ length: 23 }, (_value, index) => ({
        minute: (index + 1) * 60,
        label: `${String(index + 1).padStart(2, '0')}:00`,
      }));
    },
    nowMinute(): number {
      void this.nowTick;
      const now = moment();
      return now.hours() * 60 + now.minutes();
    },
    repeatOptions() {
      const date = moment(this.draft.date, DATE_FORMAT);
      const labels: Record<RepeatRule, string> = {
        none: 'Does not repeat',
        daily: 'Every day',
        weekdays: 'Every weekday (Mon–Fri)',
        weekly: 'Weekly',
        biweekly: 'Every 2 weeks',
        monthly: date.isValid() ? `Monthly on day ${date.date()}` : 'Monthly',
      };
      return REPEAT_RULES.map(value => ({ value, text: labels[value] }));
    },
    editingBlock(): TimeBlock | null {
      return this.blocks.find(block => block.id === this.editingId) || null;
    },
    editingSeries(): boolean {
      return Boolean(this.editingBlock && isRepeating(this.editingBlock));
    },
    draftTimesValid(): boolean {
      const start = timeToMinutes(this.draft.start);
      const end = endTimeToMinutes(this.draft.end === '00:00' ? '24:00' : this.draft.end);
      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    },
    canSaveDraft(): boolean {
      const repeatDaysOk =
        !['weekly', 'biweekly'].includes(this.draft.repeat) || this.draft.repeatDays.length > 0;
      return Boolean(
        this.draft.title && isValidDate(this.draft.date) && this.draftTimesValid && repeatDaysOk
      );
    },
    ghost() {
      const drag = this.drag as DragState | null;
      if (!drag || drag.mode !== 'move' || !drag.moved || !drag.occurrence) return null;
      const config = blockConfig(drag.occurrence.block.type);
      return {
        date: drag.date,
        title: drag.occurrence.block.title,
        startMinute: drag.startMinute,
        endMinute: drag.endMinute,
        style: {
          ...this.rangeStyle(drag.startMinute, drag.endMinute),
          '--block-color': config.color,
          '--block-soft': config.soft,
        },
      };
    },
  },
  watch: {
    'draft.repeat'(repeat: RepeatRule) {
      // Turning a series into a single event keeps the occurrence that was clicked.
      if (repeat === 'none' && this.editingSeries && this.editingDate) {
        this.draft.date = this.editingDate;
      }
    },
  },
  mounted() {
    this.loadBlocks();
    void this.loadServerBlocks();
    this.nowTimer = window.setInterval(() => {
      this.nowTick = Date.now();
    }, 60 * 1000);
    window.addEventListener('keydown', this.handleKeydown);
    this.$nextTick(() => this.scrollToWorkingHours());
  },
  beforeDestroy() {
    if (this.nowTimer) window.clearInterval(this.nowTimer);
    window.removeEventListener('keydown', this.handleKeydown);
    this.stopDragListeners();
  },
  methods: {
    isRepeating,
    minutesToTime,
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
      const date = isValidDate(block?.date) ? block.date : today();
      const start = Number.isFinite(timeToMinutes(block?.start)) ? block.start : '09:00';
      const fallbackEnd = minutesToTime(Math.min(DAY_MINUTES, timeToMinutes(start) + 60));
      const end =
        endTimeToMinutes(block?.end) > timeToMinutes(start) ? (block.end as string) : fallbackEnd;
      const repeat: RepeatRule = REPEAT_RULES.includes(block?.repeat) ? block.repeat : 'none';
      const repeatDays = Array.isArray(block?.repeatDays)
        ? Array.from(
            new Set<number>(
              block.repeatDays.filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
            )
          ).sort((a, b) => a - b)
        : [];
      return {
        id: typeof block?.id === 'string' ? block.id : `block-${Date.now()}`,
        title: typeof block?.title === 'string' && block.title ? block.title : 'Untitled block',
        type: BLOCK_TYPE_CONFIG[block?.type] ? block.type : 'work',
        date,
        start,
        end,
        notes: typeof block?.notes === 'string' ? block.notes : '',
        repeat,
        repeatDays,
        repeatUntil: repeat !== 'none' && isValidDate(block?.repeatUntil) ? block.repeatUntil : '',
        skipDates: Array.isArray(block?.skipDates) ? block.skipDates.filter(isValidDate) : [],
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
    updateBlock(blockId: string, changes: Partial<TimeBlock>) {
      const now = moment().toISOString();
      this.blocks = this.blocks.map(block =>
        block.id === blockId ? this.normalizeBlock({ ...block, ...changes, updatedAt: now }) : block
      );
    },
    newBlockId(): string {
      return `time-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    },
    sumMinutes(items: BlockOccurrence[]): number {
      return items.reduce((total, item) => total + (item.endMinute - item.startMinute), 0);
    },

    // Navigation
    setViewMode(mode: ViewMode) {
      this.viewMode = mode;
      writePreference(VIEW_STORAGE_KEY, mode);
      this.$nextTick(() => this.scrollToWorkingHours());
    },
    shiftRange(direction: number) {
      const step = this.viewMode === 'week' ? 7 : this.viewMode === '3day' ? 3 : 1;
      this.focusOn(
        moment(this.focusDate, DATE_FORMAT)
          .add(direction * step, 'days')
          .format(DATE_FORMAT)
      );
    },
    goToday() {
      this.focusOn(today());
      this.$nextTick(() => this.scrollToWorkingHours());
    },
    focusOn(date: string) {
      this.focusDate = date;
      this.monthDate = moment(date, DATE_FORMAT).startOf('month').format(DATE_FORMAT);
    },
    openDay(date: string) {
      if (this.viewMode === 'day') {
        this.openNewBlock({ date });
        return;
      }
      this.focusOn(date);
      this.setViewMode('day');
    },
    shiftMonth(direction: number) {
      this.monthDate = moment(this.monthDate, DATE_FORMAT)
        .add(direction, 'months')
        .format(DATE_FORMAT);
    },
    scrollToWorkingHours() {
      const scroller = this.$refs.scroll as HTMLElement | undefined;
      if (!scroller) return;
      const hour = this.rangeIncludesToday ? Math.max(0, Math.floor(this.nowMinute / 60) - 2) : 7;
      scroller.scrollTop = Math.min(hour, 16) * HOUR_HEIGHT;
    },
    handleKeydown(event: KeyboardEvent) {
      if (this.editorOpen || this.drag || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .modal')) return;
      if (event.key === 'ArrowLeft') this.shiftRange(-1);
      else if (event.key === 'ArrowRight') this.shiftRange(1);
      else if (event.key === 't' || event.key === 'T') this.goToday();
      else if (event.key === 'n' || event.key === 'N') this.openNewBlock();
      else return;
      event.preventDefault();
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
      writePreference(SIDEBAR_STORAGE_KEY, this.sidebarOpen ? 'open' : 'closed');
    },

    // Categories
    toggleType(type: TimeBlockType) {
      this.hiddenTypes = this.hiddenTypes.includes(type)
        ? this.hiddenTypes.filter(item => item !== type)
        : [...this.hiddenTypes, type];
      writePreference(HIDDEN_TYPES_STORAGE_KEY, JSON.stringify(this.hiddenTypes));
    },
    showAllTypes() {
      this.hiddenTypes = [];
      writePreference(HIDDEN_TYPES_STORAGE_KEY, '[]');
    },

    // Editor
    openNewBlock(prefill: Partial<TimeBlockDraft> = {}) {
      const date = prefill.date || (this.rangeIncludesToday ? today() : this.rangeDates[0]);
      this.editingId = '';
      this.editingDate = '';
      this.draft = { ...blankDraft(date), ...prefill };
      this.draft.end = inputTime(this.draft.end);
      this.draftHasEnd = Boolean(this.draft.repeatUntil);
      this.editorOpen = true;
    },
    applyTemplate(template: TimeBlockTemplate) {
      const date = this.rangeDates.includes(this.focusDate) ? this.focusDate : this.rangeDates[0];
      this.openNewBlock({
        title: template.title,
        type: template.type,
        date,
        start: template.start,
        end: template.end,
        notes: template.notes,
      });
    },
    editOccurrence(item: BlockOccurrence) {
      const block = item.block;
      this.editingId = block.id;
      this.editingDate = item.date;
      this.draft = {
        title: block.title,
        type: block.type,
        date: block.date,
        start: block.start,
        end: inputTime(block.end),
        notes: block.notes,
        repeat: block.repeat,
        repeatDays: block.repeatDays.length > 0 ? [...block.repeatDays] : [isoWeekday(block.date)],
        repeatUntil: block.repeatUntil,
      };
      this.draftHasEnd = Boolean(block.repeatUntil);
      this.editorOpen = true;
    },
    focusEditorTitle() {
      const input = this.$refs.titleInput as { focus?: () => void } | undefined;
      input?.focus?.();
    },
    resetEditor() {
      this.editingId = '';
      this.editingDate = '';
    },
    // Keep a single "weekly on" day in sync with the chosen date.
    syncRepeatDays(date: string) {
      if (isValidDate(date) && this.draft.repeatDays.length <= 1) {
        this.draft.repeatDays = [isoWeekday(date)];
      }
    },
    toggleRepeatDay(day: number) {
      const days = this.draft.repeatDays.includes(day)
        ? this.draft.repeatDays.filter(item => item !== day)
        : [...this.draft.repeatDays, day];
      this.draft.repeatDays = days.sort((a, b) => a - b);
    },
    saveDraft() {
      if (!this.canSaveDraft) return;
      const now = moment().toISOString();
      const end = this.draft.end === '00:00' ? '24:00' : this.draft.end;
      const usesDays = this.draft.repeat === 'weekly' || this.draft.repeat === 'biweekly';
      const fields = {
        ...this.draft,
        end,
        repeatDays: usesDays ? this.draft.repeatDays : [],
        repeatUntil: this.draft.repeat !== 'none' && this.draftHasEnd ? this.draft.repeatUntil : '',
      };
      if (this.editingBlock) {
        this.updateBlock(this.editingBlock.id, fields);
      } else {
        this.blocks = [
          ...this.blocks,
          this.normalizeBlock({
            id: this.newBlockId(),
            ...fields,
            skipDates: [],
            createdAt: now,
            updatedAt: now,
          }),
        ];
      }
      this.saveBlocks();
      if (!this.rangeDates.includes(fields.date) && fields.repeat === 'none') {
        this.focusOn(fields.date);
      }
      this.editorOpen = false;
    },
    deleteOccurrence() {
      const block = this.editingBlock;
      if (!block || !this.editingDate) return;
      this.updateBlock(block.id, { skipDates: [...block.skipDates, this.editingDate] });
      this.saveBlocks();
      this.editorOpen = false;
    },
    async deleteEditingBlock() {
      const block = this.editingBlock;
      if (!block) return;
      if (isRepeating(block)) {
        const confirmed = await this.$bvModal.msgBoxConfirm(
          `Delete every "${block.title}" event? (${describeRepeat(block)})`,
          {
            title: 'Delete series',
            okTitle: 'Delete series',
            okVariant: 'danger',
            cancelTitle: 'Keep',
            centered: true,
          }
        );
        if (!confirmed) return;
      }
      this.blocks = this.blocks.filter(item => item.id !== block.id);
      this.saveBlocks();
      this.editorOpen = false;
    },
    handleEventClick(item: BlockOccurrence) {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.editOccurrence(item);
    },

    // Dragging: create, move and resize blocks with the pointer.
    minuteAt(clientY: number): number {
      const columns = (this.$refs.dayColumns as HTMLElement[] | undefined) || [];
      const columnTop = columns[0]?.getBoundingClientRect().top ?? 0;
      return ((clientY - columnTop) / HOUR_HEIGHT) * 60;
    },
    dateAt(clientX: number, fallback: string): string {
      const columns = (this.$refs.dayColumns as HTMLElement[] | undefined) || [];
      const index = columns.findIndex(column => {
        const rect = column.getBoundingClientRect();
        return clientX >= rect.left && clientX < rect.right;
      });
      if (index >= 0) return this.rangeDates[index];
      if (columns.length === 0) return fallback;
      const firstLeft = columns[0].getBoundingClientRect().left;
      return clientX < firstLeft ? this.rangeDates[0] : this.rangeDates[this.rangeDates.length - 1];
    },
    beginDrag(state: DragState) {
      this.drag = state;
      window.addEventListener('pointermove', this.handleDragMove);
      window.addEventListener('pointerup', this.handleDragEnd);
      window.addEventListener('pointercancel', this.cancelDrag);
      window.addEventListener('keydown', this.handleDragKeydown);
    },
    stopDragListeners() {
      window.removeEventListener('pointermove', this.handleDragMove);
      window.removeEventListener('pointerup', this.handleDragEnd);
      window.removeEventListener('pointercancel', this.cancelDrag);
      window.removeEventListener('keydown', this.handleDragKeydown);
    },
    cancelDrag() {
      this.stopDragListeners();
      this.drag = null;
    },
    handleDragKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelDrag();
      }
    },
    startCreate(date: string, event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.cal-event')) return;
      event.preventDefault();
      const minute = Math.max(
        0,
        Math.min(DAY_MINUTES - SNAP_MINUTES, this.minuteAt(event.clientY))
      );
      const start = Math.floor(minute / 30) * 30;
      this.beginDrag({
        mode: 'create',
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        date,
        anchorMinute: snap(minute),
        startMinute: start,
        endMinute: Math.min(DAY_MINUTES, start + 60),
        occurrence: null,
      });
    },
    startMove(item: BlockOccurrence, event: PointerEvent) {
      if (event.button !== 0) return;
      this.suppressClick = false;
      this.beginDrag({
        mode: 'move',
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        date: item.date,
        anchorMinute: this.minuteAt(event.clientY) - item.startMinute,
        startMinute: item.startMinute,
        endMinute: item.endMinute,
        occurrence: item,
      });
    },
    startResize(item: BlockOccurrence, event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.suppressClick = true;
      this.beginDrag({
        mode: 'resize',
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        date: item.date,
        anchorMinute: item.startMinute,
        startMinute: item.startMinute,
        endMinute: item.endMinute,
        occurrence: item,
      });
    },
    handleDragMove(event: PointerEvent) {
      const drag = this.drag as DragState | null;
      if (!drag) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < DRAG_THRESHOLD) return;
      drag.moved = true;
      const minute = this.minuteAt(event.clientY);

      if (drag.mode === 'create') {
        const current = Math.max(0, Math.min(DAY_MINUTES, snap(minute)));
        const start = Math.min(drag.anchorMinute, current);
        const end = Math.max(drag.anchorMinute, current);
        drag.startMinute = start;
        drag.endMinute = Math.min(DAY_MINUTES, Math.max(end, start + SNAP_MINUTES));
      } else if (drag.mode === 'resize' && drag.occurrence) {
        drag.endMinute = Math.max(
          drag.startMinute + SNAP_MINUTES,
          Math.min(DAY_MINUTES, snap(minute))
        );
      } else if (drag.mode === 'move' && drag.occurrence) {
        const duration = drag.occurrence.endMinute - drag.occurrence.startMinute;
        const start = Math.max(
          0,
          Math.min(DAY_MINUTES - duration, snap(minute - drag.anchorMinute))
        );
        drag.startMinute = start;
        drag.endMinute = start + duration;
        drag.date = this.dateAt(event.clientX, drag.date);
      }
    },
    handleDragEnd() {
      const drag = this.drag as DragState | null;
      this.stopDragListeners();
      this.drag = null;
      if (!drag) return;

      if (drag.mode === 'create') {
        this.openNewBlock({
          date: drag.date,
          start: minutesToTime(drag.startMinute),
          end: minutesToTime(drag.endMinute),
        });
        return;
      }
      // Swallow the click that follows a drag, but never a later one.
      if (drag.moved) this.suppressClick = true;
      window.setTimeout(() => {
        this.suppressClick = false;
      }, 0);
      if (drag.moved && drag.occurrence) void this.commitDrag(drag);
    },
    async commitDrag(drag: DragState) {
      const item = drag.occurrence as BlockOccurrence;
      const block = item.block;
      const start = minutesToTime(drag.startMinute);
      const end = minutesToTime(drag.endMinute);
      const unchanged =
        drag.date === item.date &&
        drag.startMinute === item.startMinute &&
        drag.endMinute === item.endMinute;
      if (unchanged) return;

      if (!isRepeating(block)) {
        this.updateBlock(block.id, { date: drag.date, start, end });
        this.saveBlocks();
        return;
      }

      const scope = await this.$bvModal.msgBoxConfirm(
        `"${block.title}" is part of a series (${describeRepeat(block)}). ` +
          'Change only this event or every event in the series?',
        {
          title: drag.mode === 'resize' ? 'Change repeating block' : 'Move repeating block',
          okTitle: 'All events',
          cancelTitle: 'Only this event',
          centered: true,
        }
      );
      if (scope === null) return;

      if (scope) {
        const dayDelta = moment(drag.date, DATE_FORMAT).diff(
          moment(item.date, DATE_FORMAT),
          'days'
        );
        const shifted =
          dayDelta !== 0 && !['daily', 'weekdays'].includes(block.repeat)
            ? shiftSeries(block, dayDelta)
            : {};
        this.updateBlock(block.id, { start, end, ...shifted });
      } else {
        const now = moment().toISOString();
        this.updateBlock(block.id, { skipDates: [...block.skipDates, item.date] });
        this.blocks = [
          ...this.blocks,
          this.normalizeBlock({
            ...block,
            id: this.newBlockId(),
            date: drag.date,
            start,
            end,
            repeat: 'none',
            repeatDays: [],
            repeatUntil: '',
            skipDates: [],
            createdAt: now,
            updatedAt: now,
          }),
        ];
      }
      this.saveBlocks();
    },

    // Presentation helpers
    minuteTop(minute: number): string {
      return `${(minute / 60) * HOUR_HEIGHT}px`;
    },
    rangeStyle(startMinute: number, endMinute: number) {
      return {
        top: this.minuteTop(startMinute),
        height: `${Math.max(18, ((endMinute - startMinute) / 60) * HOUR_HEIGHT - 2)}px`,
      };
    },
    isDragging(item: PositionedOccurrence): boolean {
      return Boolean(this.drag?.moved && this.drag.occurrence?.key === item.key);
    },
    eventStyle(item: PositionedOccurrence) {
      const config = blockConfig(item.block.type);
      const resizing = this.isDragging(item) && this.drag.mode === 'resize';
      const endMinute = resizing ? this.drag.endMinute : item.endMinute;
      const width = 100 / item.columns;
      return {
        ...this.rangeStyle(item.startMinute, endMinute),
        left: `calc(${item.column * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        '--block-color': config.color,
        '--block-soft': config.soft,
      };
    },
    eventClass(item: PositionedOccurrence) {
      const duration =
        (this.isDragging(item) && this.drag.mode === 'resize'
          ? this.drag.endMinute
          : item.endMinute) - item.startMinute;
      return {
        'cal-event--compact': duration < 45,
        'cal-event--tall': duration >= 90,
        'cal-event--moving': this.isDragging(item) && this.drag.mode === 'move',
        'cal-event--resizing': this.isDragging(item) && this.drag.mode === 'resize',
        'cal-event--past': this.isPast(item),
      };
    },
    isPast(item: BlockOccurrence): boolean {
      const todayDate = today();
      if (item.date !== todayDate) return item.date < todayDate;
      return item.endMinute <= this.nowMinute;
    },
    eventTimeLabel(item: PositionedOccurrence): string {
      const end =
        this.isDragging(item) && this.drag.mode === 'resize' ? this.drag.endMinute : item.endMinute;
      return `${minutesToTime(item.startMinute)}–${minutesToTime(end)}`;
    },
    eventAriaLabel(item: BlockOccurrence): string {
      const repeat = describeRepeat(item.block);
      return [
        item.block.title,
        blockConfig(item.block.type).text,
        `${moment(item.date, DATE_FORMAT).format('dddd')} ${item.block.start} to ${item.block.end}`,
        repeat,
      ]
        .filter(Boolean)
        .join(', ');
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
  },
};
</script>

<style lang="scss" scoped>
.cal-page {
  padding: 1.4rem;
  color: #0f172a;
}

.cal-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.9rem;
  margin-bottom: 1rem;
}

.cal-subtitle {
  margin-top: 0.15rem;
  color: #52627a;
  font-size: 0.9rem;
}

.cal-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.cal-layout {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.cal-layout--wide {
  grid-template-columns: minmax(0, 1fr);
}

.cal-sidebar {
  display: grid;
  gap: 0.8rem;
}

.cal-panel {
  padding: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.cal-panel-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  color: #52627a;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cal-text-button,
.cal-icon-button {
  padding: 0.1rem 0.35rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #047857;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
}

.cal-text-button:hover,
.cal-icon-button:hover {
  background: rgba(16, 185, 129, 0.12);
}

/* Mini month */
.cal-month-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
}

.cal-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  color: #334155;
}

.cal-month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.cal-month-weekday {
  padding: 0.15rem 0;
  color: #94a3b8;
  font-size: 0.68rem;
  font-weight: 800;
  text-align: center;
}

.cal-month-day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 1.95rem;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #1e293b;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.cal-month-day:hover {
  background: rgba(16, 185, 129, 0.1);
}

.cal-month-day--outside {
  color: #b6c2d1;
}

.cal-month-day--in-range {
  background: rgba(16, 185, 129, 0.13);
  color: #065f46;
}

.cal-month-day--today span:first-child {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 999px;
  background: #ec4899;
  color: #ffffff;
}

.cal-month-dot {
  position: absolute;
  bottom: 0.12rem;
  width: 0.26rem;
  height: 0.26rem;
  border-radius: 999px;
  background: #10b981;
}

/* Stats */
.cal-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}

.cal-stat {
  padding: 0.45rem 0.5rem;
  border-top: 3px solid #94a3b8;
  border-radius: 7px;
  background: #f8fafc;
}

.cal-stat span {
  display: block;
  color: #52627a;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.cal-stat strong {
  font-size: 1rem;
}

.cal-stat--work {
  border-top-color: #10b981;
  background: rgba(236, 253, 245, 0.9);
}

.cal-stat--life {
  border-top-color: #ec4899;
  background: rgba(253, 242, 248, 0.9);
}

.cal-stat--total {
  border-top-color: #2563eb;
  background: rgba(239, 246, 255, 0.9);
}

/* Categories and templates */
.cal-category-list,
.cal-template-list {
  display: grid;
  gap: 0.25rem;
}

.cal-category,
.cal-template {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.38rem 0.45rem;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #1e293b;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.cal-category:hover,
.cal-template:hover {
  background: rgba(148, 163, 184, 0.14);
}

.cal-category-swatch {
  width: 0.8rem;
  height: 0.8rem;
  border: 2px solid var(--block-color);
  border-radius: 4px;
  background: var(--block-color);
}

.cal-category--hidden {
  color: #94a3b8;
}

.cal-category--hidden .cal-category-swatch {
  background: transparent;
}

.cal-category-hours,
.cal-template small {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 700;
}

.cal-category-name,
.cal-template-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Board */
.cal-board {
  min-width: 0;
  padding: 0;
  overflow: hidden;
}

.cal-scroll {
  height: min(74vh, 62rem);
  overflow: auto;
  overscroll-behavior: contain;
}

.cal-head-row,
.cal-body-row {
  display: grid;
  min-width: min-content;
}

.cal-head-row {
  position: sticky;
  top: 0;
  z-index: 6;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(6px);
}

.cal-corner {
  position: sticky;
  left: 0;
  z-index: 1;
  background: inherit;
}

.cal-day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.45rem 0.25rem 0.4rem;
  border-left: 1px solid rgba(148, 163, 184, 0.22);
}

.cal-day-head-button {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.12rem 0.5rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #334155;
  cursor: pointer;
}

.cal-day-head-button:hover {
  background: rgba(16, 185, 129, 0.12);
}

.cal-day-weekday {
  font-size: 0.74rem;
  font-weight: 800;
  text-transform: uppercase;
}

.cal-day-number {
  font-size: 1.15rem;
  font-weight: 800;
}

.cal-day-head--today .cal-day-head-button {
  background: #ec4899;
  color: #ffffff;
}

.cal-day-load {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 700;
}

.cal-rail {
  position: sticky;
  left: 0;
  z-index: 4;
  border-right: 1px solid rgba(148, 163, 184, 0.3);
  background: #ffffff;
}

.cal-rail-label {
  position: absolute;
  right: 0.45rem;
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
  transform: translateY(-50%);
}

.cal-column {
  position: relative;
  border-left: 1px solid rgba(148, 163, 184, 0.22);
  background-image: repeating-linear-gradient(
      to bottom,
      rgba(148, 163, 184, 0.3) 0,
      rgba(148, 163, 184, 0.3) 1px,
      transparent 1px,
      transparent 52px
    ),
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 26px,
      rgba(226, 232, 240, 0.6) 26px,
      rgba(226, 232, 240, 0.6) 27px,
      transparent 27px,
      transparent 52px
    );
  cursor: cell;
  touch-action: pan-x pan-y;
  user-select: none;
}

.cal-column--weekend {
  background-color: rgba(248, 250, 252, 0.8);
}

.cal-column--today {
  background-color: rgba(236, 253, 245, 0.45);
}

.cal-selection {
  position: absolute;
  right: 2px;
  left: 2px;
  z-index: 5;
  padding: 0.2rem 0.4rem;
  border: 2px dashed #10b981;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.14);
  color: #065f46;
  font-size: 0.74rem;
  font-weight: 800;
  pointer-events: none;
}

.cal-event {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.05rem;
  padding: 0.28rem 0.45rem 0.3rem 0.5rem;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-left: 4px solid var(--block-color);
  border-radius: 7px;
  background: linear-gradient(135deg, var(--block-soft), rgba(255, 255, 255, 0.95));
  color: #0f172a;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  cursor: grab;
  text-align: left;
  touch-action: none;
  transition: box-shadow 120ms ease, opacity 120ms ease;
}

.cal-event:hover,
.cal-event:focus-visible {
  z-index: 4;
  border-color: var(--block-color);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
  outline: none;
}

.cal-event-title {
  flex: 0 0 auto;
  width: 100%;
  overflow: hidden;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-event--tall .cal-event-title {
  display: -webkit-box;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.cal-event-time {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 0.25rem;
  color: #475569;
  font-size: 0.7rem;
  font-weight: 700;
}

.cal-event-notes {
  display: none;
  width: 100%;
  overflow: hidden;
  color: #52627a;
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-event--tall .cal-event-notes {
  display: block;
}

.cal-event--compact {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0;
  padding-bottom: 0;
}

.cal-event--compact .cal-event-title {
  width: auto;
  flex: 0 0 auto;
  max-width: 100%;
}

/* In short blocks the title wins; the time shrinks away first. */
.cal-event--compact .cal-event-time {
  flex: 0 1000 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.cal-event--past {
  opacity: 0.62;
}

.cal-event--moving {
  opacity: 0.35;
}

.cal-event--resizing {
  z-index: 5;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}

.cal-event--ghost {
  z-index: 6;
  right: 2px;
  left: 2px;
  border-style: dashed;
  border-left-style: solid;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.2);
  pointer-events: none;
}

.cal-event-repeat {
  color: var(--block-color);
}

.cal-event-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 7px;
  cursor: ns-resize;
}

.cal-event-resize::after {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 1.4rem;
  height: 3px;
  border-radius: 999px;
  background: var(--block-color);
  content: '';
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 120ms ease;
}

.cal-event:hover .cal-event-resize::after {
  opacity: 0.7;
}

.cal-now {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 5;
  height: 2px;
  background: #ec4899;
  pointer-events: none;
}

.cal-now::before {
  position: absolute;
  top: -4px;
  left: -5px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ec4899;
  content: '';
}

.cal-hint {
  margin: 0;
  padding: 0.5rem 0.8rem;
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  color: #64748b;
  font-size: 0.76rem;
}

/* Editor */
.cal-type-picker,
.cal-weekday-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.cal-type-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.cal-type-chip--active {
  border-color: var(--block-color);
  background: var(--block-soft);
  color: #0f172a;
  box-shadow: 0 0 0 2px var(--block-soft);
}

.cal-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.cal-validation {
  margin: -0.4rem 0 0.7rem;
  color: #be185d;
  font-size: 0.85rem;
  font-weight: 700;
}

.cal-weekday-picker {
  margin: -0.4rem 0 0.8rem;
}

.cal-weekday {
  width: 2.3rem;
  height: 2.3rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
}

.cal-weekday--active {
  border-color: #10b981;
  background: #10b981;
  color: #ffffff;
}

.cal-repeat-end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: -0.2rem 0 0.9rem;
}

.cal-repeat-end .form-control {
  width: auto;
}

.cal-editor-note {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.8rem;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.1);
  color: #065f46;
  font-size: 0.82rem;
  font-weight: 700;
}

.cal-editor-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.cal-editor-spacer {
  flex: 1;
}

/* Themes */
html[data-dashboard-theme='flower'] .cal-page {
  color: #102033;
}

html[data-dashboard-theme='flower'] .cal-panel,
html[data-dashboard-theme='flower'] .cal-rail {
  background: rgba(255, 253, 245, 0.95);
}

html[data-dashboard-theme='flower'] .cal-head-row {
  background: rgba(255, 253, 245, 0.97);
}

html[data-dashboard-theme='contrast'] .cal-page {
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .cal-panel,
html[data-dashboard-theme='contrast'] .cal-rail,
html[data-dashboard-theme='contrast'] .cal-head-row {
  border-color: rgba(148, 163, 184, 0.34);
  background: #111827;
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .cal-subtitle,
html[data-dashboard-theme='contrast'] .cal-panel-label,
html[data-dashboard-theme='contrast'] .cal-stat span,
html[data-dashboard-theme='contrast'] .cal-category-hours,
html[data-dashboard-theme='contrast'] .cal-template small,
html[data-dashboard-theme='contrast'] .cal-rail-label,
html[data-dashboard-theme='contrast'] .cal-day-load,
html[data-dashboard-theme='contrast'] .cal-hint,
html[data-dashboard-theme='contrast'] .cal-event-time,
html[data-dashboard-theme='contrast'] .cal-event-notes {
  color: #cbd5e1;
}

html[data-dashboard-theme='contrast'] .cal-month-day,
html[data-dashboard-theme='contrast'] .cal-category,
html[data-dashboard-theme='contrast'] .cal-template,
html[data-dashboard-theme='contrast'] .cal-day-head-button,
html[data-dashboard-theme='contrast'] .cal-icon-button,
html[data-dashboard-theme='contrast'] .cal-event {
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .cal-month-day--outside,
html[data-dashboard-theme='contrast'] .cal-category--hidden {
  color: #64748b;
}

html[data-dashboard-theme='contrast'] .cal-stat {
  background: #0f172a;
}

html[data-dashboard-theme='contrast'] .cal-column {
  background-color: #0b1220;
}

html[data-dashboard-theme='contrast'] .cal-column--today {
  background-color: rgba(16, 185, 129, 0.1);
}

html[data-dashboard-theme='contrast'] .cal-event {
  border-color: rgba(148, 163, 184, 0.3);
  background: linear-gradient(135deg, var(--block-soft), rgba(15, 23, 42, 0.96));
}

@media (max-width: 960px) {
  .cal-layout {
    grid-template-columns: 1fr;
  }

  .cal-sidebar {
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }
}

@media (max-width: 640px) {
  .cal-page {
    padding: 0.85rem;
  }

  .cal-editor-grid {
    grid-template-columns: 1fr 1fr;
  }

  .cal-editor-grid > :first-child {
    grid-column: 1 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cal-event,
  .cal-event-resize::after {
    transition: none;
  }
}
</style>
