<template lang="pug">
div.time-dashboard(:class="dashboardThemeClass")
  div.dashboard-header
    div
      h3.mb-1 FocusFrog
      div.text-muted {{ rangeSubtitle }}
    div.header-actions
      b-button-group.range-controls(size="sm")
        b-button(
          v-for="option in rangeOptions"
          :key="option.value"
          :variant="range === option.value ? 'primary' : 'outline-secondary'"
          :title="option.title || option.text"
          @click="setRange(option.value)"
        ) {{ option.text }}
      b-button(size="sm" variant="outline-primary" @click="openManualWorkModal()")
        icon(name="plus")
        span Add work time
      b-button(size="sm" variant="outline-secondary" @click="loadSummary" :disabled="loading")
        icon(name="sync")
        span Refresh

  b-modal(
    id="manual-work-modal"
    title="Add manual work time"
    centered
    hide-footer
    @hidden="resetManualWorkDraft"
  )
    section.manual-work-editor
      b-form(@submit.prevent="saveManualWorkEntry")
        div.manual-work-grid
          b-form-group(label="Date" label-for="manual-work-date")
            b-form-input#manual-work-date(
              v-model="manualWorkDraft.date"
              type="date"
              required
            )
          b-form-group(label="Start time" label-for="manual-work-start")
            b-form-input#manual-work-start(
              v-model="manualWorkDraft.startTime"
              type="time"
              step="900"
            )
        div.manual-work-grid
          b-form-group(label="Hours" label-for="manual-work-hours")
            b-form-input#manual-work-hours(
              v-model.number="manualWorkDraft.hours"
              type="number"
              min="0"
              max="24"
              step="1"
            )
          b-form-group(label="Minutes" label-for="manual-work-minutes")
            b-form-input#manual-work-minutes(
              v-model.number="manualWorkDraft.minutes"
              type="number"
              min="0"
              max="59"
              step="5"
            )
        div.manual-work-grid
          b-form-group(label="Category" label-for="manual-work-category")
            b-form-select#manual-work-category(
              v-model="manualWorkDraft.categoryKey"
              :options="manualWorkCategoryOptions"
            )
          b-form-group(label="Note" label-for="manual-work-note")
            b-form-input#manual-work-note(
              v-model.trim="manualWorkDraft.note"
              placeholder="Meeting, reading, workshop..."
              autocomplete="off"
            )
        div.manual-work-actions
          b-button(type="submit" variant="primary" :disabled="manualWorkDraftTotalMinutes <= 0")
            icon(name="plus")
            span Add
          b-button(variant="outline-secondary" type="button" @click="hideManualWorkModal")
            | Cancel

      div.manual-work-recent(v-if="manualWorkEntriesForRange.length > 0")
        div.section-label Recent manual work
        div.manual-work-entry(v-for="entry in manualWorkEntriesForRange.slice(0, 6)" :key="entry.id")
          div.manual-work-entry-main
            strong {{ formatManualWorkEntryDuration(entry) }}
            span {{ formatManualWorkEntryLabel(entry) }}
            span.manual-work-entry-category {{ formatManualWorkEntryCategory(entry) }}
            small(v-if="entry.note") {{ entry.note }}
          b-button(
            size="sm"
            variant="outline-danger"
            type="button"
            title="Remove manual work"
            @click="deleteManualWorkEntry(entry.id)"
          )
            icon(name="trash")

  b-alert.mt-3.mb-0(v-if="error" show variant="danger") {{ error }}
  b-alert.mt-3.mb-0(v-else-if="!loading && noSupportedHosts" show variant="warning")
    | No matching window and AFK buckets are available.

  div.summary-strip.mt-4
    div.metric-tile.metric-work
      div.metric-tile-head
        div.metric-label Work
        b-button.metric-add-time-button(
          size="sm"
          variant="outline-primary"
          type="button"
          title="Add manual work time"
          aria-label="Add manual work time"
          @click="openManualWorkModal()"
        )
          icon(name="plus")
      div.metric-value {{ formatHours(workSeconds) }}
      div.metric-note {{ workMetricNote }}
    div.metric-tile.metric-not-work
      div.metric-label Not work
      div.metric-value {{ formatHours(notWorkSeconds) }}
      div.metric-note {{ notWorkPercent }}% social, food, media
    div.metric-tile.metric-total
      div.metric-label Active total
      div.metric-value {{ formatHours(activeSeconds) }}
      div.metric-note {{ hostSummary }}

  div.balance-section.mt-4
    div.balance-header
      div
        div.section-label Work-life balance
        h5.mb-0 Weighted scale
        div.balance-note
          | Life is every elapsed hour not counted as work. Life counts x{{ lifeBalanceFactorLabel }}, so 40h work balances a full week.
      div.balance-status(:class="balanceStatusClass") {{ balanceStatusText }}
    div.balance-scale
      div.balance-pan.balance-pan-work
        span Work
        strong {{ formatDecimalHours(workSeconds) }} h
      div.balance-stand
        div.balance-beam(:style="{ transform: balanceBeamTransform }")
          span.balance-beam-end.balance-beam-work
          span.balance-beam-mid
          span.balance-beam-end.balance-beam-life
        div.balance-fulcrum
      div.balance-pan.balance-pan-life
        span Life x{{ lifeBalanceFactorLabel }}
        strong {{ formatDecimalHours(weightedLifeSeconds) }} h
        small {{ formatDecimalHours(lifeSeconds) }} h raw
    div.balance-weight-bar
      div.balance-weight-work(:style="{ width: balanceWorkWeightWidth }")
      div.balance-weight-life(:style="{ width: balanceLifeWeightWidth }")
    div.balance-details
      span Target: 40h work per 168h week
      span Work share now: {{ balanceWorkSharePercent }}%

  div.chart-section.mt-4(v-if="summary && activeSeconds > 0")
    div.chart-header
      div
        div.section-label Pie charts
        h5.mb-0 Work and work categories
      div.chart-total {{ formatHours(activeSeconds) }}
    div.pie-grid
      div.pie-panel
        div.pie-panel-header
          div.pie-panel-title Work vs not work
          div.chart-total {{ formatHours(activeSeconds) }}
        div.pie-panel-body
          div.pie-chart(:style="{ background: workSplitPieBackground }")
            div.pie-hole
              span Total
              strong {{ formatDecimalHours(activeSeconds) }} h
          div.pie-legend
            div.legend-row(v-for="row in workSplitRows" :key="row.label")
              span.legend-color(:style="{ background: row.color }")
              span.legend-name {{ row.label }}
              span.legend-hours {{ formatDecimalHours(row.duration) }} h
              span.legend-percent {{ row.percent }}%
      div.pie-panel
        div.pie-panel-header
          div.pie-panel-title Work sub-categories
          div.chart-total {{ formatHours(workSeconds) }}
        div.pie-panel-body(v-if="workSubcategoryRows.length > 0")
          div.pie-chart(:style="{ background: workSubcategoryPieBackground }")
            div.pie-hole
              span Work
              strong {{ formatDecimalHours(workSeconds) }} h
          div.pie-legend
            div.legend-row(v-for="row in workSubcategoryRows" :key="row.label")
              span.legend-color(:style="{ background: row.color }")
              span.legend-name {{ row.label }}
              span.legend-hours {{ formatDecimalHours(row.duration) }} h
              span.legend-percent {{ row.percent }}%
        div.pie-empty(v-else)
          | No work sub-categories found.

  div.timeline-section.mt-4(v-if="!noSupportedHosts")
    div.timeline-header
      div
        div.section-label Timeline
        h5.mb-0 Work vs not work
        div.timeline-range-note {{ timelineRangeSubtitle }}
      div.timeline-header-actions
        b-button-group.timeline-mode-controls(v-if="range === 'today'" size="sm")
          b-button(
            v-for="option in todayTimelineModeOptions"
            :key="option.value"
            :variant="todayTimelineMode === option.value ? 'primary' : 'outline-secondary'"
            @click="setTodayTimelineMode(option.value)"
          ) {{ option.text }}
        div.chart-total {{ formatHours(timelineTotalSeconds) }}
    div.timeline-legend
      span.timeline-legend-item
        span.timeline-legend-dot.timeline-legend-work
        span Work
      span.timeline-legend-item
        span.timeline-legend-dot.timeline-legend-not-work
        span Not work
      span.timeline-legend-item
        span.timeline-legend-dot.timeline-legend-total
        span Total
    div.timeline-empty(v-if="!loading && timelineChart.rows.length === 0")
      | No timeline data found for this range.
    div.timeline-chart(v-else)
      svg.timeline-svg(
        :style="{ minWidth: timelineChartMinWidth }"
        :viewBox="timelineViewBox"
        preserveAspectRatio="xMidYMid meet"
      )
        g.timeline-gridlines
          g(v-for="tick in timelineChart.yTicks" :key="'tick-' + tick.label")
            line.timeline-grid(
              :x1="timelineChart.left"
              :x2="timelineChart.right"
              :y1="tick.y"
              :y2="tick.y"
            )
            text.timeline-y-label(:x="timelineChart.left - 10" :y="tick.y + 4" text-anchor="end") {{ tick.label }}
        line.timeline-axis(
          :x1="timelineChart.left"
          :x2="timelineChart.left"
          :y1="timelineChart.top"
          :y2="timelineChart.bottom"
        )
        line.timeline-axis(
          :x1="timelineChart.left"
          :x2="timelineChart.right"
          :y1="timelineChart.bottom"
          :y2="timelineChart.bottom"
        )
        line.timeline-focus-line(
          v-if="timelineChart.selectedX !== null"
          :x1="timelineChart.selectedX"
          :x2="timelineChart.selectedX"
          :y1="timelineChart.top"
          :y2="timelineChart.bottom"
        )
        polyline.timeline-line.timeline-line-total(:points="timelineChart.totalPolyline")
        polyline.timeline-line.timeline-line-work(:points="timelineChart.workPolyline")
        polyline.timeline-line.timeline-line-not-work(:points="timelineChart.notWorkPolyline")
        g(v-for="point in timelineChart.totalPoints" :key="'total-' + point.label")
          circle.timeline-point.timeline-point-total(
            :class="{ 'timeline-point-selected': point.selected }"
            :cx="point.x"
            :cy="point.y"
            :r="point.selected ? timelineChart.selectedPointRadius : timelineChart.pointRadius"
          )
            title {{ point.title }}
        g(v-for="point in timelineChart.workPoints" :key="'work-' + point.label")
          circle.timeline-point.timeline-point-work(
            :class="{ 'timeline-point-selected': point.selected }"
            :cx="point.x"
            :cy="point.y"
            :r="point.selected ? timelineChart.selectedPointRadius : timelineChart.pointRadius"
          )
            title {{ point.title }}
        g(v-for="point in timelineChart.notWorkPoints" :key="'not-work-' + point.label")
          circle.timeline-point.timeline-point-not-work(
            :class="{ 'timeline-point-selected': point.selected }"
            :cx="point.x"
            :cy="point.y"
            :r="point.selected ? timelineChart.selectedPointRadius : timelineChart.pointRadius"
          )
            title {{ point.title }}
        g(v-for="row in timelineChart.rows" :key="'label-' + row.label")
          text.timeline-x-label(
            v-if="row.labelVisible"
            :class="{ 'timeline-x-label-selected': row.selected }"
            :x="row.x"
            :y="timelineChart.bottom + 24"
            text-anchor="middle"
          ) {{ row.label }}
        text.timeline-axis-title(:x="timelineChart.left" :y="timelineChart.top - 12") {{ timelineChart.axisTitle }}
        g(v-for="row in timelineChart.rows" :key="'hit-' + row.label")
          rect.timeline-hit-zone(
            :x="row.hitX"
            :y="timelineChart.top"
            :width="row.hitWidth"
            :height="timelineChart.bottom - timelineChart.top"
            tabindex="0"
            @focus="setTimelineSelectedIndex(row.index)"
            @mouseenter="setTimelineSelectedIndex(row.index)"
            @click="setTimelineSelectedIndex(row.index)"
          )
      div.timeline-day-summary(v-if="timelineSelectedRow")
        div.timeline-day-label {{ timelineSelectedRow.label }}
        div.timeline-day-metrics
          div.timeline-day-metric.timeline-day-work
            span Work
            div.timeline-day-value-group
              strong {{ formatDecimalHours(timelineSelectedRow.workDuration) }} h
              b-button.timeline-day-add-work(
                size="sm"
                variant="outline-primary"
                type="button"
                title="Add manual work time to this day"
                aria-label="Add manual work time to this day"
                @click="openManualWorkModal(timelineSelectedRow.date)"
              )
                icon(name="plus")
          div.timeline-day-metric.timeline-day-not-work
            span Not work
            strong {{ formatDecimalHours(timelineSelectedRow.notWorkDuration) }} h
          div.timeline-day-metric.timeline-day-total
            span Total
            strong {{ formatDecimalHours(timelineSelectedRow.activeDuration) }} h

  div.empty-state.mt-4(v-if="!loading && summary && activeSeconds === 0")
    | No active laptop time found for this range.

  div.dashboard-footer.mt-4
    b-button(to="/work-report" variant="outline-primary" size="sm")
      icon(name="briefcase")
      span Detailed report
    b-button(to="/widget" variant="outline-secondary" size="sm")
      icon(name="chart-pie")
      span Widget
    b-button(to="/buckets" variant="outline-secondary" size="sm")
      icon(name="database")
      span Raw data
    b-button(to="/settings/categorization" variant="outline-secondary" size="sm")
      icon(name="cog")
      span Categories

  div.loading-cover(v-if="loading")
    b-spinner(label="Loading")
</template>

<script lang="ts">
import moment from 'moment';
import { getClient } from '~/util/awclient';
import { useBucketsStore } from '~/stores/buckets';
import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import {
  get_day_start_with_offset,
  get_day_end_with_offset,
  get_offset_duration,
  get_today_with_offset,
} from '~/util/time';
import type { CategoryDuration, WorkCategorySummary } from '~/util/workReport';
import {
  addAfkGraceToActiveEvents,
  buildWorkSummaryQuery,
  getSupportedWorkReportHosts,
  getWorkReportHostOptions,
  sumEventDurations,
} from '~/util/workReport';
import {
  WORK_COLOR,
  NOT_WORK_COLOR,
  MESSAGE_CALLS_CATEGORY,
  categorizeFocusFrogEvent,
  categoryColor,
  categoryKey,
  isNotWorkCategory as isFocusFrogNotWorkCategory,
  workSubcategoryLabel,
} from '~/util/focusfrogCategories';

import 'vue-awesome/icons/briefcase';
import 'vue-awesome/icons/chart-pie';
import 'vue-awesome/icons/cog';
import 'vue-awesome/icons/database';
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/sync';
import 'vue-awesome/icons/trash';

interface DayRow {
  label: string;
  date: string;
  activeDuration: number;
  workDuration: number;
  notWorkDuration: number;
  categoryDurations: CategoryDuration[];
}

interface ManualWorkDraft {
  date: string;
  startTime: string;
  hours: number;
  minutes: number;
  categoryKey: string;
  note: string;
}

interface ManualWorkEntry {
  id: string;
  date: string;
  startTime: string;
  minutes: number;
  category: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface PieRow {
  label: string;
  duration: number;
  percent: number;
  color: string;
}

interface TimelineChartPoint {
  label: string;
  title: string;
  hours: number;
  x: number;
  y: number;
  selected: boolean;
}

interface TimelineChartRow {
  index: number;
  label: string;
  labelVisible: boolean;
  x: number;
  hitX: number;
  hitWidth: number;
  selected: boolean;
}

interface TimelineChartTick {
  label: string;
  value: number;
  y: number;
}

interface TimelineChartData {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  rows: TimelineChartRow[];
  yTicks: TimelineChartTick[];
  workPoints: TimelineChartPoint[];
  notWorkPoints: TimelineChartPoint[];
  totalPoints: TimelineChartPoint[];
  workPolyline: string;
  notWorkPolyline: string;
  totalPolyline: string;
  selectedX: number | null;
  pointRadius: number;
  selectedPointRadius: number;
  axisTitle: string;
}

type DashboardRange = 'today' | 'week' | 'sinceRecording';
type TodayTimelineMode = 'cumulative' | 'hourly';

const WEEKLY_WORK_TARGET_SECONDS = 40 * 3600;
const WEEK_SECONDS = 7 * 24 * 3600;
const LIFE_BALANCE_FACTOR =
  WEEKLY_WORK_TARGET_SECONDS / (WEEK_SECONDS - WEEKLY_WORK_TARGET_SECONDS);
const BALANCE_TOLERANCE = 0.08;
const MANUAL_WORK_STORAGE_KEY = 'timetracker.manualWork.v1';
const MANUAL_WORK_SERVER_KEY = 'manualWork';
const MANUAL_WORK_MODAL_ID = 'manual-work-modal';
const DAILY_MEETING_WORK_CATEGORY = ['Work', 'Meetings'];
const MANUAL_WORK_DEFAULT_CATEGORY = DAILY_MEETING_WORK_CATEGORY;
const MANUAL_WORK_CATEGORY_OPTIONS = [
  { category: DAILY_MEETING_WORK_CATEGORY, text: 'Meetings' },
  { category: ['Work', 'Planning'], text: 'Planning' },
  { category: ['Work', 'Writing'], text: 'Writing' },
  { category: ['Work', 'Programming'], text: 'Programming' },
  { category: ['Work', 'Email'], text: 'Email' },
  { category: ['Work', MESSAGE_CALLS_CATEGORY], text: MESSAGE_CALLS_CATEGORY },
  { category: ['Work', 'AI Chats'], text: 'AI Chats' },
  { category: ['Work', 'Manual time'], text: 'Manual time' },
  { category: ['Work'], text: 'Uncategorized work' },
].map(option => ({
  ...option,
  value: categoryKey(option.category),
}));
const DAILY_MEETING_WORK_MINUTES = 60;
const DAILY_MEETING_WORK_START_TIME = '12:00';

const WORK_SPLIT_COLORS = {
  work: WORK_COLOR,
  notWork: NOT_WORK_COLOR,
};

function buildPieBackground(rows: PieRow[], total: number): string {
  if (rows.length === 0 || total <= 0) return '#d1d5db';
  let cursor = 0;
  const stops = rows.map(row => {
    const start = cursor;
    const end = Math.min(100, cursor + (row.duration / total) * 100);
    cursor = end;
    return `${row.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  if (cursor < 100) stops.push(`#e5e7eb ${cursor.toFixed(2)}% 100%`);
  return `conic-gradient(${stops.join(', ')})`;
}

function formatTimelineTickLabel(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function formatTimelineMinuteTickLabel(minutes: number): string {
  return `${Math.round(minutes)}m`;
}

function getTimelineMaxHours(hours: number): number {
  if (hours <= 0.5) return 0.5;
  if (hours <= 2) return Math.ceil(hours * 2) / 2;
  if (hours <= 8) return Math.ceil(hours);
  return Math.ceil(hours / 2) * 2;
}

function getTimelineMaxMinutes(minutes: number): number {
  if (minutes <= 60) return 60;
  if (minutes <= 120) return 120;
  return Math.ceil(minutes / 60) * 60;
}

function getTimelineMinuteTickStep(maxMinutes: number): number {
  if (maxMinutes <= 60) return 15;
  if (maxMinutes <= 120) return 30;
  return 60;
}

function manualWorkCategoryFromKey(value: string): string[] {
  const matchingOption = MANUAL_WORK_CATEGORY_OPTIONS.find(option => option.value === value);
  return [...(matchingOption?.category || MANUAL_WORK_DEFAULT_CATEGORY)];
}

function normalizeManualWorkCategory(value: unknown): string[] {
  if (Array.isArray(value)) {
    const category = value.filter(item => typeof item === 'string') as string[];
    if (category.length > 0 && category[0] === 'Work') return [...category];
  }
  if (typeof value === 'string' && value) {
    const matchingOption = MANUAL_WORK_CATEGORY_OPTIONS.find(option => option.value === value);
    if (matchingOption) return [...matchingOption.category];
    try {
      return normalizeManualWorkCategory(JSON.parse(value));
    } catch {
      return [...MANUAL_WORK_DEFAULT_CATEGORY];
    }
  }
  return [...MANUAL_WORK_DEFAULT_CATEGORY];
}

function blankManualWorkDraft(): ManualWorkDraft {
  const now = moment();
  const rounded = now
    .clone()
    .subtract(1, 'hour')
    .minute(Math.floor(now.minute() / 15) * 15)
    .second(0)
    .millisecond(0);
  return {
    date: now.format('YYYY-MM-DD'),
    startTime: rounded.format('HH:mm'),
    hours: 1,
    minutes: 0,
    categoryKey: categoryKey(MANUAL_WORK_DEFAULT_CATEGORY),
    note: 'Meeting',
  };
}

export default {
  name: 'Home',
  data() {
    return {
      bucketsStore: useBucketsStore(),
      categoryStore: useCategoryStore(),
      settingsStore: useSettingsStore(),

      range: 'today' as DashboardRange,
      loading: false,
      error: '',
      supportedHosts: [] as string[],
      summary: null as WorkCategorySummary | null,
      timelineDailyRows: [] as DayRow[],
      timelineSelectedIndex: 0,
      todayTimelineMode: 'cumulative' as TodayTimelineMode,
      manualWorkEntries: [] as ManualWorkEntry[],
      manualWorkDraft: blankManualWorkDraft(),
    };
  },
  computed: {
    rangeOptions() {
      return [
        { value: 'today', text: 'Today' },
        { value: 'week', text: 'Week' },
        { value: 'sinceRecording', text: 'Since recording', title: 'Everything since recording' },
      ];
    },
    todayTimelineModeOptions() {
      return [
        { value: 'cumulative', text: 'Cumulative' },
        { value: 'hourly', text: 'Hourly' },
      ];
    },
    manualWorkCategoryOptions() {
      return MANUAL_WORK_CATEGORY_OPTIONS.map(option => ({
        value: option.value,
        text: option.text,
      }));
    },
    dashboardThemeClass(): string {
      const theme = this.settingsStore.focusFrogTheme;
      return `theme-${theme === 'contrast' || theme === 'flower' ? theme : 'bright'}`;
    },
    noSupportedHosts(): boolean {
      return this.supportedHosts.length === 0;
    },
    activeSeconds(): number {
      return Math.max(0, this.summary?.activeDuration || 0);
    },
    workSeconds(): number {
      return Math.min(this.activeSeconds, Math.max(0, this.summary?.workDuration || 0));
    },
    notWorkSeconds(): number {
      return Math.max(0, this.summary?.notWorkDuration || 0);
    },
    workPercent(): number {
      return this.activeSeconds > 0 ? Math.round((this.workSeconds / this.activeSeconds) * 100) : 0;
    },
    workMetricNote(): string {
      const manualSeconds = this.manualWorkSecondsForTimeperiods(this.getTimeperiods());
      const meetingSeconds = this.dailyMeetingWorkSecondsForTimeperiods(this.getTimeperiods());
      const additions = [];
      if (meetingSeconds > 0) additions.push(`meetings +${this.formatHours(meetingSeconds)}`);
      if (manualSeconds > 0) additions.push(`manual +${this.formatHours(manualSeconds)}`);
      return additions.length > 0
        ? `${this.workPercent}% incl. ${additions.join(', ')}`
        : `${this.workPercent}% incl. uncategorized`;
    },
    notWorkPercent(): number {
      return this.activeSeconds > 0 ? 100 - this.workPercent : 0;
    },
    manualWorkDraftTotalMinutes(): number {
      return (
        Math.max(0, Number(this.manualWorkDraft.hours || 0) * 60) +
        Math.max(0, Number(this.manualWorkDraft.minutes || 0))
      );
    },
    manualWorkEntriesForRange(): ManualWorkEntry[] {
      const timeperiods = this.getTimeperiods();
      return this.manualWorkEntries
        .filter(entry => this.manualWorkSecondsForEntryInTimeperiods(entry, timeperiods) > 0)
        .sort(
          (a, b) =>
            this.manualWorkEntryStartMoment(b).valueOf() -
            this.manualWorkEntryStartMoment(a).valueOf()
        );
    },
    balancePeriodSeconds(): number {
      const now = moment();
      return this.getTimeperiods().reduce((total, timeperiod) => {
        const [startIso, endIso] = timeperiod.split('/');
        const start = moment(startIso);
        const end = moment(endIso);
        if (!start.isValid() || !end.isValid()) return total;
        const clippedEnd = moment.min(end, now);
        if (!clippedEnd.isAfter(start)) return total;
        return total + clippedEnd.diff(start, 'seconds', true);
      }, 0);
    },
    lifeSeconds(): number {
      return Math.max(0, this.balancePeriodSeconds - this.workSeconds);
    },
    weightedLifeSeconds(): number {
      return this.lifeSeconds * LIFE_BALANCE_FACTOR;
    },
    lifeBalanceFactorLabel(): string {
      return LIFE_BALANCE_FACTOR.toFixed(2);
    },
    balanceWorkSharePercent(): number {
      return this.balancePeriodSeconds > 0
        ? Math.round((this.workSeconds / this.balancePeriodSeconds) * 100)
        : 0;
    },
    balanceWeightTotalSeconds(): number {
      return this.workSeconds + this.weightedLifeSeconds;
    },
    balanceWorkWeightWidth(): string {
      if (this.balanceWeightTotalSeconds <= 0) return '50%';
      return `${(this.workSeconds / this.balanceWeightTotalSeconds) * 100}%`;
    },
    balanceLifeWeightWidth(): string {
      if (this.balanceWeightTotalSeconds <= 0) return '50%';
      return `${(this.weightedLifeSeconds / this.balanceWeightTotalSeconds) * 100}%`;
    },
    balanceTiltRatio(): number {
      const reference = Math.max(this.workSeconds, this.weightedLifeSeconds, 1);
      return (this.weightedLifeSeconds - this.workSeconds) / reference;
    },
    balanceBeamTransform(): string {
      const degrees = Math.max(-9, Math.min(9, this.balanceTiltRatio * 9));
      return `rotate(${degrees.toFixed(1)}deg)`;
    },
    balanceStatusText(): string {
      if (Math.abs(this.balanceTiltRatio) <= BALANCE_TOLERANCE) return 'Balanced';
      return this.balanceTiltRatio < 0 ? 'Work-heavy' : 'Life-heavy';
    },
    balanceStatusClass(): string {
      if (Math.abs(this.balanceTiltRatio) <= BALANCE_TOLERANCE) return 'balance-even';
      return this.balanceTiltRatio < 0 ? 'balance-work-heavy' : 'balance-life-heavy';
    },
    hostSummary(): string {
      if (this.supportedHosts.length === 0) return 'No active host';
      if (this.supportedHosts.length === 1) return this.supportedHosts[0];
      return `${this.supportedHosts.length} devices`;
    },
    rangeSubtitle(): string {
      if (this.range === 'today') {
        return moment(get_today_with_offset(this.settingsStore.startOfDay)).format('dddd, MMM D');
      }
      if (this.range === 'week') {
        const start = this.getCurrentWeekStartDay();
        const end = start.clone().add(6, 'days');
        return `${start.format('MMM D')} - ${end.format('MMM D')}`;
      }
      return 'Since recording';
    },
    timelineRangeSubtitle(): string {
      if (this.range === 'sinceRecording') return 'Everything since recording';
      if (this.range === 'week') return 'Monday to Sunday';
      return this.todayTimelineMode === 'hourly'
        ? 'Work in each hour today'
        : 'Cumulative today by hour';
    },
    workSplitRows(): PieRow[] {
      const total = this.activeSeconds;
      return [
        {
          label: 'Work',
          duration: this.workSeconds,
          percent: total > 0 ? Math.round((this.workSeconds / total) * 100) : 0,
          color: WORK_SPLIT_COLORS.work,
        },
        {
          label: 'Not work',
          duration: this.notWorkSeconds,
          percent: total > 0 ? Math.round((this.notWorkSeconds / total) * 100) : 0,
          color: WORK_SPLIT_COLORS.notWork,
        },
      ];
    },
    workSubcategoryRows(): PieRow[] {
      const total = this.workSeconds;
      const rows = (this.summary?.categoryDurations || []).filter(
        row => !this.isNotWorkCategory(row.category) && row.duration > 0
      );
      return rows.map(row => ({
        label: workSubcategoryLabel(row.category),
        duration: row.duration,
        percent: total > 0 ? Math.round((row.duration / total) * 100) : 0,
        color: categoryColor(row.category),
      }));
    },
    workSplitPieBackground(): string {
      return buildPieBackground(this.workSplitRows, this.activeSeconds);
    },
    workSubcategoryPieBackground(): string {
      return buildPieBackground(this.workSubcategoryRows, this.workSeconds);
    },
    timelineTotalSeconds(): number {
      if (this.range === 'today' && this.todayTimelineMode === 'cumulative') {
        return this.timelineDailyRows[this.timelineDailyRows.length - 1]?.activeDuration || 0;
      }
      return this.timelineDailyRows.reduce((total, row) => total + row.activeDuration, 0);
    },
    timelineSelectedRow(): DayRow | null {
      if (this.timelineDailyRows.length === 0) return null;
      const index = Math.min(
        this.timelineDailyRows.length - 1,
        Math.max(0, this.timelineSelectedIndex)
      );
      return this.timelineDailyRows[index];
    },
    timelineViewBox(): string {
      return `0 0 ${this.timelineChart.width} ${this.timelineChart.height}`;
    },
    timelineChartMinWidth(): string {
      if (this.range === 'sinceRecording') return '0px';
      return `${this.timelineChart.width}px`;
    },
    timelineChart(): TimelineChartData {
      const dayCount = this.timelineDailyRows.length;
      const isTodayCumulative = this.range === 'today';
      const usesMinuteAxis = this.range === 'today' && this.todayTimelineMode === 'hourly';
      const width =
        this.range === 'sinceRecording'
          ? 700
          : isTodayCumulative
          ? Math.max(720, 74 + dayCount * 46)
          : Math.max(700, 74 + dayCount * 72);
      const height = 300;
      const left = 54;
      const right = width - 20;
      const chartTop = 34;
      const bottom = height - 44;
      const plotWidth = right - left;
      const plotHeight = bottom - chartTop;
      const compactSinceRecording = this.range === 'sinceRecording' && dayCount > 7;
      const compactTodayCumulative = isTodayCumulative && dayCount > 14;
      const maxVisibleLabels = compactSinceRecording
        ? Math.max(2, Math.floor(plotWidth / 56))
        : compactTodayCumulative
        ? Math.max(2, Math.floor(plotWidth / 52))
        : dayCount;
      const labelStride =
        (compactSinceRecording || compactTodayCumulative) && dayCount > maxVisibleLabels
          ? Math.ceil(dayCount / maxVisibleLabels)
          : 1;
      const pointRadius =
        compactSinceRecording && dayCount > 60
          ? 2.6
          : compactSinceRecording && dayCount > 28
          ? 3.2
          : 4.8;
      const selectedPointRadius = compactSinceRecording && dayCount > 28 ? 5.2 : 6.2;
      const maxObservedHours = Math.max(
        0,
        ...this.timelineDailyRows.map(row => row.activeDuration / 3600)
      );
      const maxObservedMinutes = Math.max(
        0,
        ...this.timelineDailyRows.map(row => row.activeDuration / 60)
      );
      const maxAxisValue = usesMinuteAxis
        ? getTimelineMaxMinutes(maxObservedMinutes)
        : getTimelineMaxHours(maxObservedHours);
      const xForIndex = (index: number) =>
        this.timelineDailyRows.length <= 1
          ? left + plotWidth / 2
          : left + (plotWidth / (this.timelineDailyRows.length - 1)) * index;
      const hitWidth =
        this.timelineDailyRows.length <= 1
          ? plotWidth
          : plotWidth / (this.timelineDailyRows.length - 1);
      const yForValue = (value: number) => bottom - (value / maxAxisValue) * plotHeight;
      const pointFor = (
        row: DayRow,
        index: number,
        kind: 'Work' | 'Not work' | 'Total',
        duration: number
      ): TimelineChartPoint => {
        const hours = duration / 3600;
        const axisValue = usesMinuteAxis ? duration / 60 : hours;
        return {
          label: row.label,
          title: `${row.label}: ${kind} ${this.formatDecimalHours(duration)} h`,
          hours,
          x: xForIndex(index),
          y: yForValue(axisValue),
          selected: index === this.timelineSelectedIndex,
        };
      };

      const rows = this.timelineDailyRows.map((row, index) => ({
        index,
        label: row.label,
        labelVisible:
          (!compactSinceRecording && !compactTodayCumulative) ||
          index === 0 ||
          index === dayCount - 1 ||
          index === this.timelineSelectedIndex ||
          index % labelStride === 0,
        x: xForIndex(index),
        hitX:
          this.timelineDailyRows.length <= 1
            ? left
            : Math.max(left, xForIndex(index) - hitWidth / 2),
        hitWidth:
          this.timelineDailyRows.length <= 1
            ? plotWidth
            : index === 0 || index === this.timelineDailyRows.length - 1
            ? hitWidth / 2
            : hitWidth,
        selected: index === this.timelineSelectedIndex,
      }));
      const workPoints = this.timelineDailyRows.map((row, index) =>
        pointFor(row, index, 'Work', row.workDuration)
      );
      const notWorkPoints = this.timelineDailyRows.map((row, index) =>
        pointFor(row, index, 'Not work', row.notWorkDuration)
      );
      const totalPoints = this.timelineDailyRows.map((row, index) =>
        pointFor(row, index, 'Total', row.activeDuration)
      );
      const toPolyline = (points: TimelineChartPoint[]) =>
        points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
      const minuteTickStep = getTimelineMinuteTickStep(maxAxisValue);
      const yTickValues = usesMinuteAxis
        ? Array.from(
            { length: Math.floor(maxAxisValue / minuteTickStep) + 1 },
            (_value, index) => index * minuteTickStep
          )
        : Array.from({ length: 5 }, (_value, index) => (maxAxisValue / 4) * index);
      const yTicks = yTickValues.map(value => {
        return {
          label: usesMinuteAxis
            ? formatTimelineMinuteTickLabel(value)
            : formatTimelineTickLabel(value),
          value,
          y: yForValue(value),
        };
      });

      return {
        width,
        height,
        left,
        right,
        top: chartTop,
        bottom,
        rows,
        yTicks,
        workPoints,
        notWorkPoints,
        totalPoints,
        workPolyline: toPolyline(workPoints),
        notWorkPolyline: toPolyline(notWorkPoints),
        totalPolyline: toPolyline(totalPoints),
        selectedX:
          this.timelineDailyRows.length === 0
            ? null
            : xForIndex(
                Math.min(this.timelineDailyRows.length - 1, Math.max(0, this.timelineSelectedIndex))
              ),
        pointRadius,
        selectedPointRadius,
        axisTitle: usesMinuteAxis ? 'minutes' : 'hours',
      };
    },
  },
  async mounted() {
    this.categoryStore.load();
    this.loadManualWorkEntries();
    await this.loadServerManualWorkEntries();
    await this.bucketsStore.ensureLoaded();
    this.supportedHosts = getSupportedWorkReportHosts(
      getWorkReportHostOptions(this.bucketsStore.buckets || [])
        .filter(option => !option.disabled)
        .map(option => option.value),
      this.bucketsStore.buckets || []
    );
    await this.loadSummary();
  },
  methods: {
    async setRange(range: DashboardRange) {
      if (this.range === range) return;
      this.range = range;
      await this.loadSummary();
    },

    async setTodayTimelineMode(mode: TodayTimelineMode) {
      if (this.todayTimelineMode === mode) return;
      this.todayTimelineMode = mode;
      if (this.range === 'today') {
        await this.loadSummary();
      }
    },

    showManualWorkModal() {
      this.$root.$emit('bv::show::modal', MANUAL_WORK_MODAL_ID);
    },

    hideManualWorkModal() {
      this.$root.$emit('bv::hide::modal', MANUAL_WORK_MODAL_ID);
    },

    openManualWorkModal(date?: string) {
      const draft = blankManualWorkDraft();
      if (date && moment(date, 'YYYY-MM-DD', true).isValid()) {
        draft.date = date;
      }
      this.manualWorkDraft = draft;
      this.$nextTick(() => this.showManualWorkModal());
    },

    resetManualWorkDraft() {
      this.manualWorkDraft = blankManualWorkDraft();
    },

    normalizeManualWorkEntry(entry: any): ManualWorkEntry | null {
      if (!entry || typeof entry !== 'object') return null;
      const date = typeof entry.date === 'string' ? entry.date : '';
      if (!moment(date, 'YYYY-MM-DD', true).isValid()) return null;
      const minutes = Math.max(0, Math.round(Number(entry.minutes || 0)));
      if (minutes <= 0) return null;
      const startTime =
        typeof entry.startTime === 'string' && /^\d{2}:\d{2}$/.test(entry.startTime)
          ? entry.startTime
          : '';
      const category = normalizeManualWorkCategory(entry.category || entry.categoryKey);
      const now = moment().toISOString();
      return {
        id:
          typeof entry.id === 'string' && entry.id
            ? entry.id
            : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        startTime,
        minutes,
        category,
        note: typeof entry.note === 'string' ? entry.note : '',
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : now,
      };
    },

    loadManualWorkEntries() {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(MANUAL_WORK_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        this.manualWorkEntries = Array.isArray(parsed)
          ? parsed
              .map(entry => this.normalizeManualWorkEntry(entry))
              .filter((entry): entry is ManualWorkEntry => Boolean(entry))
          : [];
      } catch (err) {
        console.error('Could not load manual work entries:', err);
        this.manualWorkEntries = [];
      }
    },

    saveManualWorkEntries(syncServer = true) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MANUAL_WORK_STORAGE_KEY, JSON.stringify(this.manualWorkEntries));
      }
      if (!syncServer || typeof fetch === 'undefined') return;
      fetch(`/focusfrog-storage/${MANUAL_WORK_SERVER_KEY}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: this.manualWorkEntries }),
      }).catch(err => {
        console.warn('Could not save FocusFrog manual work entries:', err);
      });
    },

    async loadServerManualWorkEntries() {
      if (typeof fetch === 'undefined') return;
      try {
        const response = await fetch(`/focusfrog-storage/${MANUAL_WORK_SERVER_KEY}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          if (this.manualWorkEntries.length > 0) this.saveManualWorkEntries();
          return;
        }
        const payload = await response.json();
        const serverEntries = Array.isArray(payload?.value)
          ? payload.value
              .map(entry => this.normalizeManualWorkEntry(entry))
              .filter((entry): entry is ManualWorkEntry => Boolean(entry))
          : [];
        if (serverEntries.length === 0) {
          if (this.manualWorkEntries.length > 0) this.saveManualWorkEntries();
          return;
        }

        const byId = new Map<string, ManualWorkEntry>();
        [...serverEntries, ...this.manualWorkEntries].forEach(entry => {
          const existing = byId.get(entry.id);
          if (
            !existing ||
            moment(entry.updatedAt).valueOf() >= moment(existing.updatedAt).valueOf()
          ) {
            byId.set(entry.id, entry);
          }
        });
        this.manualWorkEntries = Array.from(byId.values()).sort(
          (a, b) =>
            this.manualWorkEntryStartMoment(b).valueOf() -
            this.manualWorkEntryStartMoment(a).valueOf()
        );
        this.saveManualWorkEntries(false);
      } catch (err) {
        console.warn('Could not load FocusFrog manual work entries:', err);
      }
    },

    async saveManualWorkEntry() {
      const minutes = this.manualWorkDraftTotalMinutes;
      if (minutes <= 0 || !this.manualWorkDraft.date) return;
      const now = moment().toISOString();
      const entry = this.normalizeManualWorkEntry({
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: this.manualWorkDraft.date,
        startTime: this.manualWorkDraft.startTime,
        minutes,
        category: manualWorkCategoryFromKey(this.manualWorkDraft.categoryKey),
        note: this.manualWorkDraft.note,
        createdAt: now,
        updatedAt: now,
      });
      if (!entry) return;
      this.manualWorkEntries = [entry, ...this.manualWorkEntries];
      this.saveManualWorkEntries();
      this.hideManualWorkModal();
      await this.loadSummary();
    },

    async deleteManualWorkEntry(id: string) {
      const nextEntries = this.manualWorkEntries.filter(entry => entry.id !== id);
      if (nextEntries.length === this.manualWorkEntries.length) return;
      this.manualWorkEntries = nextEntries;
      this.saveManualWorkEntries();
      await this.loadSummary();
    },

    manualWorkEntryStartMoment(entry: ManualWorkEntry): moment.Moment {
      const startTime = entry.startTime || '12:00';
      const start = moment(`${entry.date} ${startTime}`, 'YYYY-MM-DD HH:mm', true);
      return start.isValid() ? start : moment(entry.date, 'YYYY-MM-DD').startOf('day');
    },

    manualWorkSecondsForEntryInRange(
      entry: ManualWorkEntry,
      rangeStart: moment.Moment,
      rangeEnd: moment.Moment
    ): number {
      if (!rangeStart.isValid() || !rangeEnd.isValid() || !rangeEnd.isAfter(rangeStart)) return 0;
      if (!entry.startTime) {
        const entryDay = moment(entry.date, 'YYYY-MM-DD');
        if (!entryDay.isValid()) return 0;
        return entryDay.isSameOrAfter(rangeStart.clone().startOf('day')) &&
          entryDay.isSameOrBefore(rangeEnd.clone().subtract(1, 'millisecond').startOf('day'))
          ? entry.minutes * 60
          : 0;
      }
      const entryStart = this.manualWorkEntryStartMoment(entry);
      const entryEnd = entryStart.clone().add(entry.minutes, 'minutes');
      const clippedStart = moment.max(entryStart, rangeStart);
      const clippedEnd = moment.min(entryEnd, rangeEnd);
      return Math.max(0, clippedEnd.diff(clippedStart, 'seconds', true));
    },

    manualWorkSecondsForEntryInTimeperiods(entry: ManualWorkEntry, timeperiods: string[]): number {
      return timeperiods.reduce((total, timeperiod) => {
        const [startIso, endIso] = timeperiod.split('/');
        return (
          total + this.manualWorkSecondsForEntryInRange(entry, moment(startIso), moment(endIso))
        );
      }, 0);
    },

    manualWorkSecondsForTimeperiods(timeperiods: string[]): number {
      return this.manualWorkEntries.reduce(
        (total, entry) => total + this.manualWorkSecondsForEntryInTimeperiods(entry, timeperiods),
        0
      );
    },

    dailyMeetingWorkEntryForDate(date: string): ManualWorkEntry {
      return {
        id: `daily-meeting-credit-${date}`,
        date,
        startTime: DAILY_MEETING_WORK_START_TIME,
        minutes: DAILY_MEETING_WORK_MINUTES,
        category: [...DAILY_MEETING_WORK_CATEGORY],
        note: 'Meetings',
        createdAt: date,
        updatedAt: date,
      };
    },

    dailyMeetingWorkEntriesForTimeperiods(timeperiods: string[]): ManualWorkEntry[] {
      const todayKey = moment(get_today_with_offset(this.settingsStore.startOfDay)).format(
        'YYYY-MM-DD'
      );
      const dates = new Set<string>();
      timeperiods.forEach(timeperiod => {
        const [startIso] = timeperiod.split('/');
        const start = moment(startIso);
        if (!start.isValid()) return;
        const dateKey = start.format('YYYY-MM-DD');
        if (dateKey <= todayKey) dates.add(dateKey);
      });
      return Array.from(dates)
        .sort()
        .map(date => this.dailyMeetingWorkEntryForDate(date));
    },

    dailyMeetingWorkSecondsForTimeperiods(timeperiods: string[]): number {
      return this.dailyMeetingWorkEntriesForTimeperiods(timeperiods).reduce(
        (total, entry) => total + this.manualWorkSecondsForEntryInTimeperiods(entry, timeperiods),
        0
      );
    },

    dailyMeetingWorkSecondsForRange(rangeStart: moment.Moment, rangeEnd: moment.Moment): number {
      if (!rangeStart.isValid() || !rangeEnd.isValid() || !rangeEnd.isAfter(rangeStart)) return 0;
      const todayKey = moment(get_today_with_offset(this.settingsStore.startOfDay)).format(
        'YYYY-MM-DD'
      );
      const dates = new Set<string>();
      const lastDay = rangeEnd.clone().subtract(1, 'millisecond').startOf('day');
      for (
        let cursor = rangeStart.clone().startOf('day');
        cursor.isSameOrBefore(lastDay);
        cursor = cursor.add(1, 'day')
      ) {
        const dateKey = cursor.format('YYYY-MM-DD');
        if (dateKey <= todayKey) dates.add(dateKey);
      }
      return Array.from(dates).reduce((total, date) => {
        const entry = this.dailyMeetingWorkEntryForDate(date);
        return total + this.manualWorkSecondsForEntryInRange(entry, rangeStart, rangeEnd);
      }, 0);
    },

    addWorkCategoryDuration(
      categoryDurations: CategoryDuration[],
      category: string[],
      seconds: number
    ): CategoryDuration[] {
      if (seconds <= 0) return categoryDurations;
      const key = categoryKey(category);
      const categoryMap: Record<string, CategoryDuration> = {};
      categoryDurations.forEach(row => {
        categoryMap[categoryKey(row.category)] = { category: row.category, duration: row.duration };
      });
      categoryMap[key] = categoryMap[key] || {
        category,
        duration: 0,
      };
      categoryMap[key].duration += seconds;
      return Object.values(categoryMap).sort((a, b) => b.duration - a.duration);
    },

    manualWorkCategoryForEntry(entry: ManualWorkEntry): string[] {
      return normalizeManualWorkCategory(entry.category);
    },

    addManualWorkCategoryDurationsForTimeperiods(
      categoryDurations: CategoryDuration[],
      timeperiods: string[]
    ): CategoryDuration[] {
      return this.manualWorkEntries.reduce((nextDurations, entry) => {
        const seconds = this.manualWorkSecondsForEntryInTimeperiods(entry, timeperiods);
        return this.addWorkCategoryDuration(
          nextDurations,
          this.manualWorkCategoryForEntry(entry),
          seconds
        );
      }, categoryDurations);
    },

    addManualWorkCategoryDurationsForRange(
      categoryDurations: CategoryDuration[],
      rangeStart: moment.Moment,
      rangeEnd: moment.Moment
    ): CategoryDuration[] {
      return this.manualWorkEntries.reduce((nextDurations, entry) => {
        const seconds = this.manualWorkSecondsForEntryInRange(entry, rangeStart, rangeEnd);
        return this.addWorkCategoryDuration(
          nextDurations,
          this.manualWorkCategoryForEntry(entry),
          seconds
        );
      }, categoryDurations);
    },

    addDailyMeetingWorkCategoryDuration(
      categoryDurations: CategoryDuration[],
      meetingSeconds: number
    ): CategoryDuration[] {
      return this.addWorkCategoryDuration(
        categoryDurations,
        DAILY_MEETING_WORK_CATEGORY,
        meetingSeconds
      );
    },

    applyManualWorkToSummary(
      summary: WorkCategorySummary,
      timeperiods: string[]
    ): WorkCategorySummary {
      const manualSeconds = this.manualWorkSecondsForTimeperiods(timeperiods);
      const meetingSeconds = this.dailyMeetingWorkSecondsForTimeperiods(timeperiods);
      const extraWorkSeconds = manualSeconds + meetingSeconds;
      if (extraWorkSeconds <= 0) return summary;
      let categoryDurations = summary.categoryDurations;
      categoryDurations = this.addManualWorkCategoryDurationsForTimeperiods(
        categoryDurations,
        timeperiods
      );
      categoryDurations = this.addDailyMeetingWorkCategoryDuration(
        categoryDurations,
        meetingSeconds
      );
      return {
        activeDuration: summary.activeDuration + extraWorkSeconds,
        workDuration: summary.workDuration + extraWorkSeconds,
        notWorkDuration: summary.notWorkDuration,
        categoryDurations,
      };
    },

    formatManualWorkEntryDuration(entry: ManualWorkEntry): string {
      return this.formatHours(entry.minutes * 60);
    },

    formatManualWorkEntryLabel(entry: ManualWorkEntry): string {
      const date = moment(entry.date, 'YYYY-MM-DD').format('MMM D');
      return entry.startTime ? `${date}, ${entry.startTime}` : date;
    },

    formatManualWorkEntryCategory(entry: ManualWorkEntry): string {
      return workSubcategoryLabel(this.manualWorkCategoryForEntry(entry));
    },

    async loadSummary() {
      this.error = '';
      this.summary = null;
      this.timelineDailyRows = [];

      if (this.supportedHosts.length === 0) return;

      this.loading = true;
      try {
        const client = getClient();
        const query = buildWorkSummaryQuery(this.supportedHosts, '[]', []);
        const timeperiods = this.getTimeperiods();
        const results = await client.query(timeperiods, [query]);

        const totals = results.reduce(
          (acc, result) => {
            const activeEvents = this.getGraceAdjustedEvents(result);
            const summary = this.summarizeActiveEvents(
              activeEvents,
              sumEventDurations(activeEvents)
            );
            acc.activeDuration += summary.activeDuration;
            acc.workDuration += summary.workDuration;
            acc.notWorkDuration += summary.notWorkDuration;
            for (const row of summary.categoryDurations) {
              const key = categoryKey(row.category);
              acc.categoryMap[key] = acc.categoryMap[key] || {
                category: row.category,
                duration: 0,
              };
              acc.categoryMap[key].duration += row.duration;
            }
            return acc;
          },
          {
            activeDuration: 0,
            workDuration: 0,
            notWorkDuration: 0,
            categoryMap: {} as Record<string, CategoryDuration>,
          }
        );

        this.summary = this.applyManualWorkToSummary(
          {
            activeDuration: totals.activeDuration,
            workDuration: totals.workDuration,
            notWorkDuration: totals.notWorkDuration,
            categoryDurations: (Object.values(totals.categoryMap) as CategoryDuration[]).sort(
              (a, b) => b.duration - a.duration
            ),
          },
          timeperiods
        );
        const timelineTimeperiods = this.getTimelineTimeperiods();
        const timelineResults =
          JSON.stringify(timelineTimeperiods) === JSON.stringify(timeperiods)
            ? results
            : await client.query(timelineTimeperiods, [query]);
        this.timelineDailyRows =
          this.range === 'today'
            ? this.buildTodayRows(
                this.getGraceAdjustedEvents(timelineResults[0] || {}),
                timelineTimeperiods[0]
              )
            : timelineResults.map((result, index) => {
                const activeEvents = this.getGraceAdjustedEvents(result);
                const summary = this.summarizeActiveEvents(
                  activeEvents,
                  sumEventDurations(activeEvents)
                );
                const adjustedSummary = this.applyManualWorkToSummary(summary, [
                  timelineTimeperiods[index],
                ]);
                const date = timelineTimeperiods[index].split('/')[0];
                const dateKey = moment(date).format('YYYY-MM-DD');
                return {
                  label: this.getDayLabel(date, this.range === 'sinceRecording'),
                  date: dateKey,
                  activeDuration: adjustedSummary.activeDuration,
                  workDuration: adjustedSummary.workDuration,
                  notWorkDuration: adjustedSummary.notWorkDuration,
                  categoryDurations: adjustedSummary.categoryDurations,
                };
              });
        this.timelineSelectedIndex = Math.max(0, this.timelineDailyRows.length - 1);
      } catch (err) {
        console.error('Error loading dashboard summary:', err);
        this.error = 'Could not load time data.';
      } finally {
        this.loading = false;
      }
    },

    categorizeEvent(event: any): string[] {
      return categorizeFocusFrogEvent(event, this.categoryStore.classes_for_query || []);
    },

    getGraceAdjustedEvents(result: any): any[] {
      return addAfkGraceToActiveEvents(result.activeEvents || [], result.rawActiveEvents || []);
    },

    isNotWorkCategory(category: string[]): boolean {
      return isFocusFrogNotWorkCategory(category);
    },

    getDayLabel(date: string, includeMonth: boolean): string {
      return moment(date).format(includeMonth ? 'MMM D' : 'ddd D');
    },

    setTimelineSelectedIndex(index: number) {
      if (this.timelineDailyRows.length === 0) {
        this.timelineSelectedIndex = 0;
        return;
      }
      this.timelineSelectedIndex = Math.min(this.timelineDailyRows.length - 1, Math.max(0, index));
    },

    summarizeActiveEvents(events: any[], activeDuration: number): WorkCategorySummary {
      const categoryMap: Record<string, CategoryDuration> = {};
      let notWorkDuration = 0;

      for (const event of events) {
        const duration = Math.max(0, Number(event.duration || 0));
        const category = this.categorizeEvent(event);
        const key = categoryKey(category);
        categoryMap[key] = categoryMap[key] || { category, duration: 0 };
        categoryMap[key].duration += duration;
        if (this.isNotWorkCategory(category)) {
          notWorkDuration += duration;
        }
      }

      const activeSeconds = Math.max(0, activeDuration);
      const boundedNotWork = Math.min(activeSeconds, notWorkDuration);
      return {
        activeDuration: activeSeconds,
        workDuration: Math.max(0, activeSeconds - boundedNotWork),
        notWorkDuration: boundedNotWork,
        categoryDurations: Object.values(categoryMap).sort((a, b) => b.duration - a.duration),
      };
    },

    summarizeActiveEventsUntil(
      events: any[],
      rangeStart: moment.Moment,
      rangeEnd: moment.Moment
    ): WorkCategorySummary {
      const categoryMap: Record<string, CategoryDuration> = {};
      let activeSeconds = 0;
      let notWorkDuration = 0;

      for (const event of events) {
        const eventDuration = Math.max(0, Number(event.duration || 0));
        const eventStart = moment(event.timestamp);
        if (!eventStart.isValid() || eventDuration <= 0) continue;

        const eventEnd = eventStart.clone().add(eventDuration, 'seconds');
        const clippedStart = moment.max(eventStart, rangeStart);
        const clippedEnd = moment.min(eventEnd, rangeEnd);
        const duration = Math.max(0, clippedEnd.diff(clippedStart, 'seconds', true));
        if (duration <= 0) continue;

        const category = this.categorizeEvent(event);
        const key = categoryKey(category);
        categoryMap[key] = categoryMap[key] || { category, duration: 0 };
        categoryMap[key].duration += duration;
        activeSeconds += duration;
        if (this.isNotWorkCategory(category)) {
          notWorkDuration += duration;
        }
      }

      const boundedNotWork = Math.min(activeSeconds, notWorkDuration);
      const manualSeconds = this.manualWorkEntries.reduce(
        (total, entry) =>
          total + this.manualWorkSecondsForEntryInRange(entry, rangeStart, rangeEnd),
        0
      );
      const meetingSeconds = this.dailyMeetingWorkSecondsForRange(rangeStart, rangeEnd);
      const extraWorkSeconds = manualSeconds + meetingSeconds;
      let categoryDurations = Object.values(categoryMap);
      categoryDurations = this.addManualWorkCategoryDurationsForRange(
        categoryDurations,
        rangeStart,
        rangeEnd
      );
      categoryDurations = this.addDailyMeetingWorkCategoryDuration(
        categoryDurations,
        meetingSeconds
      );
      return {
        activeDuration: activeSeconds + extraWorkSeconds,
        workDuration: Math.max(0, activeSeconds - boundedNotWork) + extraWorkSeconds,
        notWorkDuration: boundedNotWork,
        categoryDurations,
      };
    },

    buildTodayRows(events: any[], timeperiod: string): DayRow[] {
      return this.todayTimelineMode === 'hourly'
        ? this.buildTodayHourlyRows(events, timeperiod)
        : this.buildTodayCumulativeRows(events, timeperiod);
    },

    buildTodayCumulativeRows(events: any[], timeperiod: string): DayRow[] {
      const [startIso, endIso] = timeperiod.split('/');
      const dayStart = moment(startIso);
      const dayEnd = moment(endIso);
      if (!dayStart.isValid() || !dayEnd.isValid()) return [];

      const now = moment();
      let visibleEnd = now.clone();
      if (visibleEnd.isBefore(dayStart)) visibleEnd = dayStart.clone();
      if (visibleEnd.isAfter(dayEnd)) visibleEnd = dayEnd.clone();

      const anchors: moment.Moment[] = [dayStart.clone()];
      for (
        let cursor = dayStart.clone().add(1, 'hour');
        cursor.isSameOrBefore(visibleEnd);
        cursor = cursor.add(1, 'hour')
      ) {
        anchors.push(cursor.clone());
      }
      if (!anchors[anchors.length - 1].isSame(visibleEnd)) {
        anchors.push(visibleEnd.clone());
      }

      return anchors.map((anchor, index) => {
        const summary = this.summarizeActiveEventsUntil(events, dayStart, anchor);
        const isCurrentPoint = index === anchors.length - 1 && anchor.isSame(visibleEnd);
        return {
          label:
            isCurrentPoint && !anchor.isSame(dayStart, 'hour') ? 'Now' : anchor.format('HH:mm'),
          date: dayStart.format('YYYY-MM-DD'),
          activeDuration: summary.activeDuration,
          workDuration: summary.workDuration,
          notWorkDuration: summary.notWorkDuration,
          categoryDurations: summary.categoryDurations,
        };
      });
    },

    buildTodayHourlyRows(events: any[], timeperiod: string): DayRow[] {
      const [startIso, endIso] = timeperiod.split('/');
      const dayStart = moment(startIso);
      const dayEnd = moment(endIso);
      if (!dayStart.isValid() || !dayEnd.isValid()) return [];

      const now = moment();
      let visibleEnd = now.clone();
      if (visibleEnd.isBefore(dayStart)) visibleEnd = dayStart.clone();
      if (visibleEnd.isAfter(dayEnd)) visibleEnd = dayEnd.clone();

      const rows: DayRow[] = [];
      for (
        let cursor = dayStart.clone();
        cursor.isBefore(visibleEnd);
        cursor = cursor.add(1, 'hour')
      ) {
        const hourStart = cursor.clone();
        const hourEnd = moment.min(cursor.clone().add(1, 'hour'), visibleEnd);
        const summary = this.summarizeActiveEventsUntil(events, hourStart, hourEnd);
        rows.push({
          label: hourStart.format('HH:mm'),
          date: dayStart.format('YYYY-MM-DD'),
          activeDuration: summary.activeDuration,
          workDuration: summary.workDuration,
          notWorkDuration: summary.notWorkDuration,
          categoryDurations: summary.categoryDurations,
        });
      }

      return rows;
    },

    getTimeperiods(): string[] {
      const offset = this.settingsStore.startOfDay;
      const today = moment(get_today_with_offset(offset));

      if (this.range === 'today') {
        return [
          get_day_start_with_offset(today, offset) + '/' + get_day_end_with_offset(today, offset),
        ];
      }

      if (this.range === 'week') {
        return this.getCurrentWeekTimeperiods();
      }

      const start =
        this.range === 'sinceRecording'
          ? this.getRecordingStartDay()
          : today.clone().subtract(6, 'days');
      const days = today.diff(start, 'days') + 1;

      return Array.from({ length: days }, (_value, index) => {
        const date = start.clone().add(index, 'days');
        return (
          get_day_start_with_offset(date, offset) + '/' + get_day_end_with_offset(date, offset)
        );
      });
    },

    formatHours(seconds: number): string {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      if (hours === 0) return `${minutes}m`;
      if (minutes === 60) return `${hours + 1}h 0m`;
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    },

    formatDecimalHours(seconds: number): string {
      return (seconds / 3600).toFixed(1);
    },

    getTimelineTimeperiods(): string[] {
      if (this.range === 'sinceRecording') return this.getTimeperiods();
      if (this.range === 'week') return this.getCurrentWeekTimeperiods();
      return this.getTimeperiods();
    },

    getCurrentWeekStartDay(): moment.Moment {
      return moment(get_today_with_offset(this.settingsStore.startOfDay)).startOf('isoWeek');
    },

    getCurrentWeekTimeperiods(): string[] {
      const offset = this.settingsStore.startOfDay;
      const start = this.getCurrentWeekStartDay();
      return Array.from({ length: 7 }, (_value, index) => {
        const date = start.clone().add(index, 'days');
        return (
          get_day_start_with_offset(date, offset) + '/' + get_day_end_with_offset(date, offset)
        );
      });
    },

    getRecordingStartDay(): moment.Moment {
      const offset = this.settingsStore.startOfDay;
      const today = moment(get_today_with_offset(offset));
      const supportedHosts = new Set(this.supportedHosts);
      const candidates = (this.bucketsStore.buckets || [])
        .filter(bucket => {
          const host = bucket.hostname || bucket.data?.hostname;
          return supportedHosts.has(host) && ['currentwindow', 'afkstatus'].includes(bucket.type);
        })
        .flatMap(bucket => [bucket.metadata?.start, bucket.first_seen, bucket.created])
        .filter(value => Boolean(value))
        .map(value => moment(value))
        .filter(value => value.isValid());

      if (candidates.length === 0) return today;

      return moment.min(candidates).clone().subtract(get_offset_duration(offset)).startOf('day');
    },
  },
};
</script>

<style scoped>
.time-dashboard {
  position: relative;
  min-height: 360px;
  --work-color: #059669;
  --not-work-color: #db2777;
}

.time-dashboard.theme-bright {
  margin: -1rem;
  padding: 1rem;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(248, 251, 255, 0.96) 0%, rgba(255, 247, 242, 0.9) 47%),
    linear-gradient(315deg, rgba(236, 253, 245, 0.95) 0%, rgba(239, 246, 255, 0.95) 68%);
  color: #0f172a !important;
}

.time-dashboard.theme-contrast {
  margin: -1rem;
  padding: 1rem;
  border-radius: 8px;
  background: #0f131a;
  color: #ffffff !important;
}

.time-dashboard.theme-flower {
  margin: -1rem;
  padding: 1rem;
  border-radius: 8px;
  background: linear-gradient(
    135deg,
    rgba(255, 252, 248, 0.76),
    rgba(253, 242, 248, 0.7) 58%,
    rgba(240, 253, 244, 0.7)
  );
  color: #10213a !important;
  backdrop-filter: blur(8px);
}

.time-dashboard.theme-flower::before {
  position: absolute;
  right: 1rem;
  bottom: 0.4rem;
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(31, 59, 99, 0.2) 0 10%, transparent 11%),
    radial-gradient(circle at 50% 0%, rgba(96, 165, 250, 0.18) 0 20%, transparent 21%),
    radial-gradient(circle at 100% 50%, rgba(96, 165, 250, 0.16) 0 20%, transparent 21%),
    radial-gradient(circle at 50% 100%, rgba(96, 165, 250, 0.16) 0 20%, transparent 21%),
    radial-gradient(circle at 0% 50%, rgba(96, 165, 250, 0.16) 0 20%, transparent 21%);
  content: '';
  opacity: 0.7;
  pointer-events: none;
}

.time-dashboard.theme-flower > * {
  position: relative;
}

.time-dashboard.theme-contrast,
.time-dashboard.theme-contrast *,
.time-dashboard.theme-contrast .text-muted {
  color: #ffffff !important;
}

.time-dashboard.theme-bright h3,
.time-dashboard.theme-bright h5 {
  color: #0f172a !important;
}

.time-dashboard.theme-bright .text-muted {
  color: #475569 !important;
}

.time-dashboard.theme-flower h3,
.time-dashboard.theme-flower h5,
.time-dashboard.theme-flower .metric-value,
.time-dashboard.theme-flower .chart-total,
.time-dashboard.theme-flower .pie-panel-title,
.time-dashboard.theme-flower .legend-name,
.time-dashboard.theme-flower .legend-hours,
.time-dashboard.theme-flower .legend-percent {
  color: #10213a !important;
}

.time-dashboard.theme-flower .text-muted,
.time-dashboard.theme-flower .metric-note,
.time-dashboard.theme-flower .pie-hole span,
.time-dashboard.theme-flower .pie-empty,
.time-dashboard.theme-flower .timeline-range-note {
  color: #38506f !important;
}

.theme-bright .btn-outline-secondary,
.theme-bright .btn-outline-primary {
  border-color: rgba(100, 116, 139, 0.55);
  background: rgba(255, 255, 255, 0.74);
  color: #334155 !important;
}

.theme-bright .btn-outline-secondary:hover,
.theme-bright .btn-outline-primary:hover {
  border-color: rgba(37, 99, 235, 0.52);
  background: #e0f2fe;
  color: #0f172a !important;
}

.theme-bright .btn-primary,
.theme-bright .btn-primary span {
  color: #ffffff !important;
}

.theme-flower .btn-outline-secondary,
.theme-flower .btn-outline-primary {
  border-color: rgba(30, 64, 110, 0.44);
  background: rgba(255, 253, 245, 0.94);
  color: #102a4c !important;
}

.theme-flower .btn-outline-secondary:hover,
.theme-flower .btn-outline-primary:hover {
  border-color: rgba(30, 64, 110, 0.56);
  background: #dbeafe;
  color: #102a4c !important;
}

.theme-flower .btn-primary,
.theme-flower .btn-primary span {
  border-color: #10b981;
  background: #10b981;
  color: #ffffff !important;
}

.theme-contrast .btn-outline-secondary,
.theme-contrast .btn-outline-primary {
  border-color: rgba(255, 255, 255, 0.78);
  background: rgba(15, 19, 26, 0.9);
  color: #ffffff !important;
}

.theme-contrast .btn-outline-secondary:hover,
.theme-contrast .btn-outline-primary:hover {
  border-color: #ffffff;
  background: #343a40;
  color: #ffffff !important;
}

.dashboard-header,
.dashboard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.header-actions,
.dashboard-footer {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.range-controls {
  white-space: nowrap;
}

.manual-work-editor {
  color: #0f172a;
}

.manual-work-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.manual-work-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}

.manual-work-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.manual-work-recent {
  display: grid;
  gap: 0.45rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.5);
}

.manual-work-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.48);
  border-left: 5px solid #059669;
  border-radius: 6px;
  background: rgba(248, 250, 252, 0.86);
}

.manual-work-entry-main {
  display: grid;
  min-width: 0;
  gap: 0.05rem;
}

.manual-work-entry-main strong,
.manual-work-entry-main span {
  color: #0f172a !important;
}

.manual-work-entry-main small {
  color: #475569 !important;
  overflow-wrap: anywhere;
}

.manual-work-entry-main .manual-work-entry-category {
  color: #047857 !important;
  font-size: 0.82rem;
  font-weight: 850;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.75rem;
}

.metric-tile {
  position: relative;
  min-height: 118px;
  padding: 1rem;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #111827;
  border-left: 7px solid #4b5563;
  color: #111827 !important;
}

.metric-work {
  border-left-color: var(--work-color);
}

.metric-not-work {
  border-left-color: var(--not-work-color);
}

.metric-total {
  border-left-color: #1d4ed8;
}

.metric-tile-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.metric-add-time-button,
.timeline-day-add-work {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 999px;
  line-height: 1;
}

.metric-add-time-button .fa-icon,
.timeline-day-add-work .fa-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.metric-work .metric-add-time-button,
.timeline-day-work .timeline-day-add-work {
  border-color: rgba(5, 150, 105, 0.72);
  background: rgba(236, 253, 245, 0.88);
  color: var(--work-color) !important;
}

.metric-work .metric-add-time-button:hover,
.metric-work .metric-add-time-button:focus,
.timeline-day-work .timeline-day-add-work:hover,
.timeline-day-work .timeline-day-add-work:focus {
  border-color: var(--work-color);
  background: var(--work-color);
  color: #ffffff !important;
}

.theme-bright .metric-tile {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-left: 1px solid rgba(148, 163, 184, 0.42);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.09);
}

.theme-bright .metric-tile::before {
  position: absolute;
  inset: 0 0 auto;
  height: 5px;
  content: '';
}

.theme-bright .metric-work {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.92), rgba(255, 255, 255, 0.9));
}

.theme-bright .metric-work::before {
  background: var(--work-color);
}

.theme-bright .metric-not-work {
  background: linear-gradient(180deg, rgba(255, 247, 237, 0.94), rgba(255, 255, 255, 0.9));
}

.theme-bright .metric-not-work::before {
  background: var(--not-work-color);
}

.theme-bright .metric-total {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.94), rgba(255, 255, 255, 0.9));
}

.theme-bright .metric-total::before {
  background: linear-gradient(90deg, #2563eb, #06b6d4);
}

.theme-flower .metric-tile {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(30, 64, 110, 0.3);
  border-left: 1px solid rgba(30, 64, 110, 0.3);
  background: rgba(255, 253, 245, 0.97);
  box-shadow: 0 14px 34px rgba(15, 38, 71, 0.12);
}

.theme-flower .metric-tile::before {
  position: absolute;
  inset: 0 0 auto;
  height: 5px;
  content: '';
}

.theme-flower .metric-work {
  background: linear-gradient(180deg, rgba(240, 253, 244, 0.96), rgba(255, 253, 245, 0.98));
}

.theme-flower .metric-work::before {
  background: var(--work-color);
}

.theme-flower .metric-not-work {
  background: linear-gradient(180deg, rgba(252, 231, 243, 0.96), rgba(255, 253, 245, 0.98));
}

.theme-flower .metric-not-work::before {
  background: var(--not-work-color);
}

.theme-flower .metric-total {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 253, 245, 0.98));
}

.theme-flower .metric-total::before {
  background: linear-gradient(90deg, #10b981, #38bdf8, #ec4899);
}

.theme-contrast .metric-tile {
  border-color: #ffffff;
  background: #151922;
  color: #ffffff !important;
}

.theme-contrast .metric-work {
  border-left-color: var(--work-color);
}

.theme-contrast .metric-not-work {
  border-left-color: var(--not-work-color);
}

.theme-contrast .metric-total {
  border-left-color: #93c5fd;
}

.metric-label,
.section-label {
  color: #111827 !important;
  font-size: 0.86rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
}

.metric-value {
  margin-top: 0.35rem;
  font-size: 2rem;
  font-weight: 750;
  line-height: 1.15;
  color: #111827 !important;
  overflow-wrap: anywhere;
}

.metric-note {
  margin-top: 0.35rem;
  color: #374151 !important;
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}

.theme-bright .metric-label,
.theme-bright .section-label {
  color: #334155 !important;
}

.theme-bright .metric-value,
.theme-bright .chart-total,
.theme-bright .pie-panel-title,
.theme-bright .legend-name,
.theme-bright .legend-hours,
.theme-bright .legend-percent {
  color: #0f172a !important;
}

.theme-bright .metric-note,
.theme-bright .pie-hole span,
.theme-bright .pie-empty {
  color: #475569 !important;
}

.theme-flower .metric-label,
.theme-flower .section-label {
  color: #047857 !important;
}

.theme-contrast .metric-label,
.theme-contrast .section-label,
.theme-contrast .metric-value,
.theme-contrast .metric-note,
.theme-contrast .chart-total,
.theme-contrast .pie-panel-title,
.theme-contrast .legend-name,
.theme-contrast .legend-hours,
.theme-contrast .legend-percent,
.theme-contrast .pie-hole span,
.theme-contrast .pie-hole strong,
.theme-contrast .pie-empty {
  color: #ffffff !important;
}

.balance-section {
  padding: 1rem;
  border: 1px solid #111827;
  border-radius: 6px;
  background: #ffffff;
  color: #111827 !important;
}

.balance-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.balance-note {
  max-width: 44rem;
  margin-top: 0.15rem;
  color: #475569 !important;
  font-size: 0.92rem;
  font-weight: 650;
}

.balance-status {
  padding: 0.35rem 0.75rem;
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 999px;
  font-weight: 850;
  white-space: nowrap;
}

.balance-even {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8 !important;
}

.balance-work-heavy {
  background: rgba(5, 150, 105, 0.13);
  color: #047857 !important;
}

.balance-life-heavy {
  background: rgba(219, 39, 119, 0.12);
  color: #be185d !important;
}

.balance-scale {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(220px, 1.25fr) minmax(130px, 1fr);
  align-items: end;
  gap: 1rem;
  margin-top: 1rem;
}

.balance-pan {
  display: flex;
  min-height: 5.6rem;
  flex-direction: column;
  justify-content: center;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.9);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
}

.balance-pan span {
  color: #334155 !important;
  font-size: 0.82rem;
  font-weight: 850;
  text-transform: uppercase;
}

.balance-pan strong {
  color: #0f172a !important;
  font-size: 1.65rem;
  font-weight: 850;
  line-height: 1.08;
}

.balance-pan small {
  color: #64748b !important;
  font-weight: 700;
}

.balance-pan-work {
  border-top: 4px solid var(--work-color);
}

.balance-pan-life {
  border-top: 4px solid var(--not-work-color);
}

.balance-stand {
  position: relative;
  min-height: 6.7rem;
}

.balance-beam {
  position: absolute;
  top: 2rem;
  left: 6%;
  right: 6%;
  height: 0.62rem;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--work-color), #2563eb 50%, var(--not-work-color));
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
  transform-origin: center;
  transition: transform 180ms ease;
}

.balance-beam-end,
.balance-beam-mid {
  position: absolute;
  top: 50%;
  display: block;
  border-radius: 50%;
  transform: translateY(-50%);
}

.balance-beam-end {
  width: 1.2rem;
  height: 1.2rem;
  border: 2px solid #ffffff;
}

.balance-beam-work {
  left: -0.15rem;
  background: var(--work-color);
}

.balance-beam-life {
  right: -0.15rem;
  background: var(--not-work-color);
}

.balance-beam-mid {
  left: calc(50% - 0.45rem);
  width: 0.9rem;
  height: 0.9rem;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.35);
}

.balance-fulcrum {
  position: absolute;
  bottom: 0.15rem;
  left: 50%;
  width: 0;
  height: 0;
  border-right: 2.25rem solid transparent;
  border-bottom: 4.35rem solid rgba(15, 23, 42, 0.72);
  border-left: 2.25rem solid transparent;
  transform: translateX(-50%);
}

.balance-weight-bar {
  display: flex;
  height: 0.78rem;
  margin-top: 1rem;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(100, 116, 139, 0.34);
}

.balance-weight-work {
  background: var(--work-color);
}

.balance-weight-life {
  background: var(--not-work-color);
}

.balance-details {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.65rem;
  color: #475569 !important;
  font-size: 0.9rem;
  font-weight: 700;
  flex-wrap: wrap;
}

.theme-bright .balance-section,
.theme-bright .chart-section,
.theme-bright .timeline-section {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.07);
}

.theme-flower .balance-section,
.theme-flower .chart-section,
.theme-flower .timeline-section {
  border: 1px solid rgba(30, 64, 110, 0.3);
  background: rgba(255, 253, 245, 0.96);
  box-shadow: 0 12px 30px rgba(15, 38, 71, 0.12);
}

.theme-flower .balance-pan {
  border-color: rgba(30, 64, 110, 0.24);
  background: rgba(255, 253, 245, 0.9);
  box-shadow: 0 10px 22px rgba(15, 38, 71, 0.08);
}

.theme-flower .balance-note,
.theme-flower .balance-details,
.theme-flower .balance-pan span,
.theme-flower .balance-pan small {
  color: #38506f !important;
}

.theme-flower .balance-pan strong {
  color: #10213a !important;
}

.theme-flower .balance-fulcrum {
  border-bottom-color: rgba(30, 64, 110, 0.66);
}

.theme-contrast .balance-section,
.theme-contrast .chart-section,
.theme-contrast .timeline-section {
  border-color: #ffffff;
  background: #151922;
  color: #ffffff !important;
}

.theme-contrast .balance-note,
.theme-contrast .balance-details,
.theme-contrast .balance-pan span,
.theme-contrast .balance-pan small,
.theme-contrast .balance-pan strong {
  color: #ffffff !important;
}

.theme-contrast .balance-pan {
  border-color: rgba(255, 255, 255, 0.42);
  background: #0f131a;
  box-shadow: none;
}

.theme-contrast .balance-status {
  border-color: #ffffff;
}

.theme-contrast .balance-even,
.theme-contrast .balance-work-heavy,
.theme-contrast .balance-life-heavy {
  color: #ffffff !important;
}

.theme-contrast .balance-fulcrum {
  border-bottom-color: rgba(255, 255, 255, 0.76);
}

.theme-contrast .balance-beam-mid {
  background: #0f131a;
  box-shadow: 0 0 0 2px #ffffff;
}

.theme-contrast .balance-weight-bar {
  background: #343a40;
  box-shadow: inset 0 0 0 1px #ffffff;
}

.chart-section {
  padding: 1rem;
  border: 1px solid #111827;
  border-radius: 6px;
  background: #ffffff;
  color: #111827 !important;
}

.timeline-section {
  padding: 1rem;
  border: 1px solid #111827;
  border-radius: 6px;
  background: #ffffff;
  color: #111827 !important;
}

.chart-header,
.timeline-header {
  display: flex;
  gap: 0.75rem;
}

.chart-header,
.timeline-header {
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
}

.chart-total {
  color: #111827 !important;
  font-size: 1.05rem;
  font-weight: 800;
}

.timeline-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.timeline-mode-controls .btn {
  min-width: 5.6rem;
  font-weight: 750;
}

.timeline-range-note {
  margin-top: 0.12rem;
  color: #475569 !important;
  font-size: 0.88rem;
  font-weight: 650;
}

.pie-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.2rem;
  margin-top: 1rem;
}

.pie-panel {
  min-width: 0;
}

.pie-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}

.pie-panel-title {
  color: #111827 !important;
  font-size: 1rem;
  font-weight: 850;
}

.pie-panel-body {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.pie-empty {
  padding: 0.9rem 0;
  color: #374151 !important;
  font-weight: 700;
}

.pie-chart {
  position: relative;
  width: min(190px, 42vw);
  aspect-ratio: 1;
  flex: 0 0 auto;
  border: 2px solid #111827;
  border-radius: 50%;
}

.pie-hole {
  position: absolute;
  inset: 28%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid #111827;
  border-radius: 50%;
  background: #ffffff;
  color: #111827 !important;
  text-align: center;
}

.pie-hole span {
  color: #374151 !important;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}

.pie-hole strong {
  color: #111827 !important;
  font-size: 1rem;
}

.theme-bright .pie-chart {
  border-color: rgba(15, 23, 42, 0.75);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
}

.theme-bright .pie-hole {
  border-color: rgba(15, 23, 42, 0.55);
  background: rgba(255, 255, 255, 0.94);
}

.theme-bright .pie-hole strong {
  color: #0f172a !important;
}

.theme-flower .pie-hole {
  border-color: rgba(15, 23, 42, 0.42);
  background: rgba(255, 255, 255, 0.96);
}

.time-dashboard.theme-flower .pie-hole span {
  color: #475569 !important;
}

.time-dashboard.theme-flower .pie-hole strong {
  color: #0f172a !important;
}

.theme-contrast .pie-chart,
.theme-contrast .pie-hole,
.theme-contrast .legend-color {
  border-color: #ffffff;
}

.theme-contrast .pie-hole {
  background: #151922;
}

.pie-legend {
  display: grid;
  flex: 1 1 260px;
  gap: 0.45rem;
}

.legend-row {
  display: grid;
  grid-template-columns: 0.9rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.55rem;
  color: #111827 !important;
  font-size: 0.92rem;
}

.legend-color {
  width: 0.9rem;
  height: 0.9rem;
  border: 1px solid #111827;
}

.legend-name {
  min-width: 0;
  color: #111827 !important;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.legend-hours,
.legend-percent {
  color: #111827 !important;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.theme-bright .legend-color {
  border-color: rgba(15, 23, 42, 0.68);
  border-radius: 3px;
}

.timeline-legend {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.8rem;
  flex-wrap: wrap;
}

.timeline-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #111827 !important;
  font-size: 0.88rem;
  font-weight: 750;
}

.timeline-legend-dot {
  width: 0.7rem;
  height: 0.7rem;
  border: 1px solid #111827;
  border-radius: 50%;
}

.timeline-legend-work,
.timeline-point-work {
  fill: var(--work-color);
  background: var(--work-color);
}

.timeline-legend-not-work,
.timeline-point-not-work {
  fill: var(--not-work-color);
  background: var(--not-work-color);
}

.timeline-legend-total,
.timeline-point-total {
  fill: #1d4ed8;
  background: #1d4ed8;
}

.timeline-chart {
  margin-top: 0.85rem;
  overflow-x: auto;
}

.timeline-empty {
  margin-top: 0.85rem;
  padding: 0.9rem;
  border: 1px dashed #64748b;
  border-radius: 6px;
  color: #374151 !important;
  font-weight: 700;
}

.timeline-svg {
  display: block;
  width: 100%;
  min-width: 520px;
  height: 300px;
}

.timeline-axis {
  stroke: #111827;
  stroke-width: 2;
}

.timeline-grid {
  stroke: rgba(17, 24, 39, 0.16);
  stroke-width: 1;
}

.timeline-focus-line {
  stroke: rgba(15, 23, 42, 0.28);
  stroke-width: 2;
}

.timeline-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3.2;
}

.timeline-line-work {
  stroke: var(--work-color);
}

.timeline-line-not-work {
  stroke: var(--not-work-color);
}

.timeline-line-total {
  stroke: #1d4ed8;
  stroke-dasharray: 7 6;
}

.timeline-point {
  stroke: #ffffff;
  stroke-width: 2;
}

.timeline-point-selected {
  stroke: #111827;
  stroke-width: 2.6;
}

.timeline-y-label,
.timeline-x-label,
.timeline-axis-title {
  fill: #374151;
  font-size: 0.78rem;
  font-weight: 750;
}

.timeline-axis-title {
  text-transform: uppercase;
}

.timeline-x-label-selected {
  fill: #111827;
  font-weight: 900;
}

.timeline-hit-zone {
  cursor: pointer;
  fill: transparent;
  outline: none;
  pointer-events: all;
}

.timeline-hit-zone:focus {
  stroke: rgba(37, 99, 235, 0.58);
  stroke-width: 1.5;
}

.timeline-day-summary {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  margin-top: 0.8rem;
  flex-wrap: wrap;
}

.timeline-day-label {
  display: flex;
  align-items: center;
  min-width: 92px;
  padding: 0.65rem 0.8rem;
  border: 1px solid #111827;
  border-radius: 6px;
  background: #f8fafc;
  color: #111827 !important;
  font-weight: 850;
}

.timeline-day-metrics {
  display: grid;
  flex: 1 1 360px;
  grid-template-columns: repeat(3, minmax(108px, 1fr));
  gap: 0.55rem;
}

.timeline-day-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  min-height: 52px;
  padding: 0.6rem 0.75rem;
  border: 1px solid #111827;
  border-radius: 6px;
  background: #ffffff;
  color: #111827 !important;
}

.timeline-day-metric span {
  color: #374151 !important;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
}

.timeline-day-metric strong {
  color: #111827 !important;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
}

.timeline-day-value-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
}

.timeline-day-work {
  border-left: 5px solid var(--work-color);
}

.timeline-day-not-work {
  border-left: 5px solid var(--not-work-color);
}

.timeline-day-total {
  border-left: 5px solid #1d4ed8;
}

.theme-bright .timeline-legend-item {
  color: #0f172a !important;
}

.theme-bright .timeline-range-note {
  color: #475569 !important;
}

.theme-bright .timeline-legend-dot {
  border-color: rgba(15, 23, 42, 0.55);
}

.theme-bright .timeline-axis {
  stroke: rgba(15, 23, 42, 0.74);
}

.theme-bright .timeline-grid {
  stroke: rgba(100, 116, 139, 0.24);
}

.theme-bright .timeline-focus-line {
  stroke: rgba(15, 23, 42, 0.26);
}

.theme-bright .timeline-y-label,
.theme-bright .timeline-x-label,
.theme-bright .timeline-axis-title {
  fill: #475569;
}

.theme-bright .timeline-x-label-selected {
  fill: #0f172a;
}

.theme-bright .timeline-line-work {
  stroke: var(--work-color);
}

.theme-bright .timeline-line-not-work {
  stroke: var(--not-work-color);
}

.theme-bright .timeline-line-total {
  stroke: #2563eb;
}

.theme-bright .timeline-point-work {
  fill: var(--work-color);
}

.theme-bright .timeline-point-not-work {
  fill: var(--not-work-color);
}

.theme-bright .timeline-point-total {
  fill: #2563eb;
}

.theme-bright .timeline-empty {
  border-color: rgba(100, 116, 139, 0.48);
  background: rgba(255, 255, 255, 0.7);
  color: #334155 !important;
}

.theme-bright .timeline-day-label,
.theme-bright .timeline-day-metric {
  border-color: rgba(148, 163, 184, 0.42);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}

.theme-bright .timeline-day-label,
.theme-bright .timeline-day-metric strong {
  color: #0f172a !important;
}

.theme-bright .timeline-day-metric span {
  color: #475569 !important;
}

.theme-bright .timeline-day-work {
  border-left-color: var(--work-color);
}

.theme-bright .timeline-day-not-work {
  border-left-color: var(--not-work-color);
}

.theme-bright .timeline-day-total {
  border-left-color: #2563eb;
}

.theme-contrast .timeline-legend-item {
  color: #ffffff !important;
}

.theme-contrast .timeline-range-note {
  color: #ffffff !important;
}

.theme-contrast .timeline-legend-dot {
  border-color: #ffffff;
}

.theme-contrast .timeline-axis {
  stroke: #ffffff;
}

.theme-contrast .timeline-grid {
  stroke: rgba(255, 255, 255, 0.24);
}

.theme-contrast .timeline-focus-line {
  stroke: rgba(255, 255, 255, 0.48);
}

.theme-contrast .timeline-y-label,
.theme-contrast .timeline-x-label,
.theme-contrast .timeline-axis-title {
  fill: #ffffff;
}

.theme-contrast .timeline-x-label-selected {
  fill: #ffffff;
}

.theme-contrast .timeline-line-work {
  stroke: var(--work-color);
}

.theme-contrast .timeline-line-not-work {
  stroke: var(--not-work-color);
}

.theme-contrast .timeline-line-total {
  stroke: #93c5fd;
}

.theme-contrast .timeline-point-work {
  fill: var(--work-color);
}

.theme-contrast .timeline-point-not-work {
  fill: var(--not-work-color);
}

.theme-contrast .timeline-point-total {
  fill: #93c5fd;
}

.theme-contrast .timeline-point-selected {
  stroke: #ffffff;
}

.theme-contrast .timeline-empty,
.theme-contrast .timeline-day-label,
.theme-contrast .timeline-day-metric {
  border-color: #ffffff;
  background: #0f131a;
  color: #ffffff !important;
}

.theme-contrast .timeline-day-label,
.theme-contrast .timeline-day-metric span,
.theme-contrast .timeline-day-metric strong {
  color: #ffffff !important;
}

.theme-contrast .timeline-day-work {
  border-left-color: var(--work-color);
}

.theme-contrast .timeline-day-not-work {
  border-left-color: var(--not-work-color);
}

.theme-contrast .timeline-day-total {
  border-left-color: #93c5fd;
}

.empty-state {
  padding: 0.9rem 0;
  color: #374151;
}

.loading-cover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.72);
}

.theme-bright .loading-cover {
  background: rgba(248, 251, 255, 0.78);
}

.theme-contrast .loading-cover {
  background: rgba(15, 19, 26, 0.78);
}

@media (max-width: 575.98px) {
  .dashboard-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions > *,
  .dashboard-footer > * {
    width: 100%;
  }

  .metric-value {
    font-size: 1.6rem;
  }

  .metric-add-time-button,
  .timeline-day-add-work {
    width: 2.25rem;
    height: 2.25rem;
  }

  .manual-work-grid {
    grid-template-columns: 1fr;
  }

  .balance-scale {
    grid-template-columns: 1fr;
  }

  .balance-stand {
    min-height: 5.6rem;
  }

  .pie-panel-body {
    align-items: stretch;
    flex-direction: column;
  }

  .pie-legend {
    width: 100%;
  }

  .timeline-svg {
    min-width: 620px;
  }

  .timeline-day-summary {
    flex-direction: column;
  }

  .timeline-day-metrics {
    grid-template-columns: 1fr;
  }

  .pie-chart {
    align-self: center;
    width: min(230px, 72vw);
  }
}
</style>
