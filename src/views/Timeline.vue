<template lang="pug">
div.timeline-page
  div.timeline-day-panel.mb-3
    div.timeline-day-main
      div.timeline-day-nav
        b-button(
          size="sm"
          variant="outline-secondary"
          title="Previous day"
          aria-label="Previous day"
          @click="moveSelectedDay(-1)"
        )
          icon(name="chevron-left")
        b-form-input.timeline-date-input(
          v-model="selectedDate"
          type="date"
          size="sm"
          aria-label="Selected day"
        )
        b-button(
          size="sm"
          variant="outline-secondary"
          title="Next day"
          aria-label="Next day"
          @click="moveSelectedDay(1)"
        )
          icon(name="chevron-right")
        b-button(size="sm" variant="primary" @click="goToToday") Today
      div.timeline-day-strip
        button.timeline-day-chip(
          v-for="day in dayOptions"
          :key="day.date"
          type="button"
          :class="{ 'timeline-day-chip--selected': day.selected, 'timeline-day-chip--today': day.today }"
          @click="selectDay(day.date)"
        )
          span.timeline-day-weekday {{ day.weekday }}
          strong {{ day.dayNumber }}
    div.timeline-day-actions
      b-button(
        size="sm"
        variant="outline-secondary"
        title="Refresh"
        aria-label="Refresh selected day"
        @click="refreshSelectedDay"
      )
        icon(name="sync")
        span Refresh
      div.small.text-muted(v-if="lastUpdate") Last update: {{ lastUpdate.fromNow() }}

  b-alert.mb-2(v-if="timeline_error", variant="danger", show)
    | {{ timeline_error }}

  div(v-if="buckets !== null")
    div.timeline-table-card
      div.timeline-table-header
        div
          h3.mb-1 Timeline
          div.text-muted Selected day with half-hour category blocks
        div.timeline-table-total
          strong {{ formatTimetableDuration(timetable_total_duration) }}
          span.ml-1.text-muted {{ timetable_block_count }} blocks
      div.timeline-table-empty(v-if="timetable_rows.length === 0")
        | No active window events match the selected day.
      div.timeline-schedule-scroll
        div.timeline-schedule
          div.timeline-schedule-day(
            v-for="day in timetable_schedule_days"
            :key="day.key"
          )
            div.timeline-schedule-date(v-if="show_timetable_date") {{ day.label }}
            div.timeline-schedule-body
              div.timeline-schedule-slot(v-for="slot in day.slots" :key="slot.key")
                div.timeline-schedule-time {{ slot.label }}
                div.timeline-schedule-track
                  div.timeline-schedule-block(
                    v-for="block in slot.blocks"
                    :key="block.key"
                    :class="{ 'timeline-schedule-block--not-work': !block.isWork }"
                    :style="{ borderColor: block.color }"
                  )
                    div.timeline-schedule-block-header
                      span.timeline-category-dot(:style="{ background: block.color }")
                      strong {{ block.categoryText }}
                      span.timeline-schedule-duration {{ formatTimetableDuration(block.duration) }}
                    div.timeline-schedule-block-meta
                      | {{ block.startLabel }}-{{ block.endLabel }}
                      span(v-if="block.appSummary") &nbsp; {{ block.appSummary }}
                    div.timeline-schedule-block-title(:title="block.titleSummary")
                      | {{ block.titleSummary }}
  div(v-else)
    h1.aw-loading Loading...
</template>

<script lang="ts">
import _ from 'lodash';
import moment from 'moment';
import { mapState } from 'pinia';
import { useSettingsStore } from '~/stores/settings';
import { useBucketsStore } from '~/stores/buckets';
import { getClient } from '~/util/awclient';
import { canonicalEvents } from '~/queries';
import { useCategoryStore } from '~/stores/categories';
import { seconds_to_duration } from '~/util/time';
import {
  addAfkGraceToActiveEvents,
  buildWorkSummaryQuery,
  getSupportedWorkReportHosts,
  getWorkReportHostOptions,
} from '~/util/workReport';
import {
  categorizeFocusFrogEvent,
  categoryColor,
  categoryKey,
  categoryLabel,
  isNotWorkCategory,
} from '~/util/focusfrogCategories';

import 'vue-awesome/icons/chevron-left';
import 'vue-awesome/icons/chevron-right';
import 'vue-awesome/icons/sync';

interface TimetableRow {
  key: string;
  startMs: number;
  endMs: number;
  duration: number;
  dateLabel: string;
  startLabel: string;
  endLabel: string;
  category: string[];
  categoryText: string;
  color: string;
  isWork: boolean;
  app: string;
  title: string;
}

interface TimetableScheduleBlock extends TimetableRow {
  appSummary: string;
  titleSummary: string;
}

interface TimetableScheduleSlot {
  key: string;
  label: string;
  blocks: TimetableScheduleBlock[];
}

interface TimetableScheduleDay {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
  slots: TimetableScheduleSlot[];
}

const TIMETABLE_SLOT_MINUTES = 30;

export default {
  name: 'Timeline',
  data() {
    return {
      all_buckets: null,
      hosts: null,
      buckets: null,
      clients: null,
      active_events: [] as any[],
      supported_hosts: [] as string[],
      timeline_error: '',
      daterange: null as [moment.Moment, moment.Moment] | null,
      selectedDate: moment().format('YYYY-MM-DD'),
      lastUpdate: null as moment.Moment | null,
      filter_hostname: null,
      filter_client: null,
      filter_duration: null,
      filter_afk: true,
      filter_merge_similar: false,
      filter_categories: [],
    };
  },
  computed: {
    ...mapState(useSettingsStore, ['always_active_pattern']),
    dayOptions() {
      const selected = this.getSelectedDayMoment();
      return Array.from({ length: 7 }, (_offset, index) => {
        const day = selected.clone().add(index - 3, 'days');
        return {
          date: day.format('YYYY-MM-DD'),
          weekday: day.format('ddd'),
          dayNumber: day.format('D'),
          selected: day.isSame(selected, 'day'),
          today: day.isSame(moment(), 'day'),
        };
      });
    },
    timetable_rows(): TimetableRow[] {
      const minDuration = Number(this.filter_duration || 0);
      const categoryStore = useCategoryStore();
      const rows = (this.active_events || [])
        .map((event, index) =>
          this.buildTimetableRow(event, index, categoryStore.classes_for_query)
        )
        .filter(Boolean)
        .filter((row: TimetableRow) => row.duration >= minDuration)
        .filter((row: TimetableRow) => this.rowMatchesSelectedCategories(row))
        .sort((a: TimetableRow, b: TimetableRow) => a.startMs - b.startMs);

      return this.filter_merge_similar ? this.mergeTimetableRowsByApp(rows) : rows;
    },
    timetable_schedule_days(): TimetableScheduleDay[] {
      if (this.daterange) {
        const label = moment(this.daterange[0]).format('ddd, MMM D');
        return [this.buildScheduleDay(label, this.timetable_rows as TimetableRow[])];
      }
      const groups = _.groupBy(this.timetable_rows, row => row.dateLabel);
      return Object.entries(groups)
        .map(([label, rows]) => this.buildScheduleDay(label, rows as TimetableRow[]))
        .sort((a, b) => a.startMs - b.startMs);
    },
    timetable_block_count() {
      return (this.timetable_schedule_days as TimetableScheduleDay[]).reduce(
        (dayTotal, day) =>
          dayTotal + day.slots.reduce((slotTotal, slot) => slotTotal + slot.blocks.length, 0),
        0
      );
    },
    timetable_total_duration() {
      return _.sumBy(this.timetable_rows, 'duration');
    },
    show_timetable_date() {
      if ((this.timetable_schedule_days as TimetableScheduleDay[]).length > 1) return true;
      if (!this.daterange) return false;
      return !moment(this.daterange[0]).isSame(this.daterange[1], 'day');
    },
  },
  watch: {
    selectedDate() {
      this.setSelectedDayRange();
    },
    daterange() {
      this.getBuckets();
    },
    filter_hostname() {
      this.getBuckets();
    },
    filter_client() {
      this.getBuckets();
    },
    filter_duration() {
      this.getBuckets();
    },
    filter_afk() {
      this.getBuckets();
    },
    filter_merge_similar() {
      this.getBuckets();
    },
    filter_categories() {
      this.getBuckets();
    },
  },
  mounted() {
    this.setSelectedDayRange();
  },
  methods: {
    getSelectedDayMoment: function () {
      const selected = moment(this.selectedDate, 'YYYY-MM-DD', true);
      return selected.isValid() ? selected : moment();
    },

    setSelectedDayRange: function () {
      const start = this.getSelectedDayMoment().startOf('day');
      this.daterange = [start, start.clone().add(1, 'day')];
    },

    selectDay: function (date: string) {
      this.selectedDate = date;
    },

    moveSelectedDay: function (direction: number) {
      this.selectedDate = this.getSelectedDayMoment().add(direction, 'day').format('YYYY-MM-DD');
    },

    goToToday: function () {
      const today = moment().format('YYYY-MM-DD');
      if (this.selectedDate === today) {
        this.refreshSelectedDay();
        return;
      }
      this.selectedDate = today;
    },

    refreshSelectedDay: function () {
      this.getBuckets();
    },

    getBuckets: async function () {
      if (this.daterange == null) return;

      this.timeline_error = '';
      try {
        const categoryStore = useCategoryStore();
        if (categoryStore.classes.length === 0) {
          categoryStore.load();
        }
        await useBucketsStore().ensureLoaded();

        this.all_buckets = Object.freeze(
          await useBucketsStore().getBucketsWithEvents({
            start: this.daterange[0].format(),
            end: this.daterange[1].format(),
          })
        );
      } catch (err) {
        console.error('Error loading timeline buckets:', err);
        this.timeline_error = 'Could not load timeline data.';
        this.buckets = [];
        this.active_events = [];
        return;
      }

      this.hosts = this.all_buckets
        .map(a => a.hostname)
        .filter((value, index, array) => array.indexOf(value) === index);
      this.clients = this.all_buckets
        .map(a => a.client)
        .filter((value, index, array) => array.indexOf(value) === index);

      let buckets = this.all_buckets;
      if (this.filter_hostname) {
        buckets = _.filter(buckets, b => b.hostname == this.filter_hostname);
      }
      if (this.filter_client) {
        buckets = _.filter(buckets, b => b.client == this.filter_client);
      }

      if (this.filter_duration > 0) {
        for (const bucket of buckets) {
          bucket.events = _.filter(bucket.events, e => e.duration >= this.filter_duration);
        }
      }

      if (this.filter_categories.length > 0) {
        const categoryStore = useCategoryStore();
        for (const bucket of buckets) {
          // Skip AFK buckets — they don't have meaningful categorization
          if (bucket.type === 'afkstatus') continue;
          bucket.events = _.filter(bucket.events, e => {
            const eventCat = categorizeFocusFrogEvent(e, categoryStore.classes_for_query || []);
            // Check if the event's category matches any selected filter category
            // (including parent matches: selecting "Work" also shows "Work > Programming")
            return this.filter_categories.some(filterCat =>
              _.isEqual(eventCat.slice(0, filterCat.length), filterCat)
            );
          });
        }
      }

      // AFK filtering: use query engine to filter window events by AFK status
      if (this.filter_afk) {
        buckets = await this._applyAfkFilter(buckets);
      }

      // Merge adjacent events by app name for window buckets.
      // Runs after AFK filtering so merges operate on already-filtered events.
      // Reduces visual clutter from apps that produce many small events (e.g.
      // Adobe Illustrator's TAB key toggling UI panels). See: activitywatch#1165
      if (this.filter_merge_similar) {
        buckets = this._applyMergeSimilar(buckets);
      }

      this.buckets = buckets;
      await this.getActiveEventsForTimetable();
      this.lastUpdate = moment();
    },

    getActiveEventsForTimetable: async function () {
      const bucketsStore = useBucketsStore();
      const allBuckets = bucketsStore.buckets || [];
      const supportedHosts = getSupportedWorkReportHosts(
        getWorkReportHostOptions(allBuckets)
          .filter(option => !option.disabled)
          .map(option => option.value),
        allBuckets
      );
      this.supported_hosts = supportedHosts;
      const hosts =
        this.filter_hostname === null
          ? supportedHosts
          : supportedHosts.includes(this.filter_hostname)
          ? [this.filter_hostname]
          : [];

      if (hosts.length === 0) {
        this.active_events = [];
        return;
      }

      try {
        const query = buildWorkSummaryQuery(hosts, '[]', []);
        const start = this.daterange[0].format();
        const end = this.daterange[1].format();
        const data = await getClient().query([`${start}/${end}`], [query]);
        this.active_events = addAfkGraceToActiveEvents(
          data[0]?.activeEvents || [],
          data[0]?.rawActiveEvents || []
        );
      } catch (err) {
        console.error('Error loading active timeline events:', err);
        this.timeline_error = 'Could not load active timeline events.';
        this.active_events = [];
      }
    },

    buildTimetableRow: function (event, index, categoryRules): TimetableRow {
      const start = moment(event.timestamp);
      const duration = Math.max(0, Number(event.duration || 0));
      const end = start.clone().add(duration, 'seconds');
      const category = categorizeFocusFrogEvent(event, categoryRules || []);
      const app = event.data?.app || 'Unknown';
      const title =
        event.data?.title ||
        event.data?.url ||
        event.data?.file ||
        event.data?.label ||
        event.data?.status ||
        app;

      return {
        key: `${event.id || 'event'}-${index}-${start.valueOf()}`,
        startMs: start.valueOf(),
        endMs: end.valueOf(),
        duration,
        dateLabel: start.format('ddd, MMM D'),
        startLabel: start.format('HH:mm'),
        endLabel: end.format('HH:mm'),
        category,
        categoryText: categoryLabel(category),
        color: categoryColor(category),
        isWork: !isNotWorkCategory(category),
        app,
        title,
      };
    },

    rowMatchesSelectedCategories(row: TimetableRow): boolean {
      if (this.filter_categories.length === 0) return true;
      return this.filter_categories.some(filterCat =>
        _.isEqual(row.category.slice(0, filterCat.length), filterCat)
      );
    },

    mergeTimetableRowsByApp(rows: TimetableRow[]): TimetableRow[] {
      const merged: TimetableRow[] = [];
      for (const row of rows) {
        const prev = merged[merged.length - 1];
        if (
          prev &&
          prev.app === row.app &&
          categoryKey(prev.category) === categoryKey(row.category) &&
          row.startMs - prev.endMs < 30000
        ) {
          prev.endMs = Math.max(prev.endMs, row.endMs);
          prev.duration = Math.max(0, (prev.endMs - prev.startMs) / 1000);
          prev.endLabel = moment(prev.endMs).format('HH:mm');
          if (prev.title !== row.title) {
            prev.title = `${prev.app} activity`;
          }
        } else {
          merged.push({ ...row });
        }
      }
      return merged;
    },

    buildScheduleDay(label: string, rows: TimetableRow[]): TimetableScheduleDay {
      const sortedRows = rows.slice().sort((a, b) => a.startMs - b.startMs);
      const selectedStart = this.daterange
        ? moment(this.daterange[0]).startOf('day')
        : sortedRows[0]
        ? moment(sortedRows[0].startMs).startOf('day')
        : moment().startOf('day');
      const dayStart = selectedStart.clone();
      const dayEnd = selectedStart.clone().add(1, 'day');

      const slots: TimetableScheduleSlot[] = [];
      for (
        const cursor = dayStart.clone();
        cursor.isBefore(dayEnd);
        cursor.add(TIMETABLE_SLOT_MINUTES, 'minutes')
      ) {
        const slotStart = cursor.valueOf();
        const slotEnd = cursor.clone().add(TIMETABLE_SLOT_MINUTES, 'minutes').valueOf();
        slots.push({
          key: `${label}-${cursor.valueOf()}`,
          label: cursor.format('HH:mm'),
          blocks: this.buildScheduleSlotBlocks(sortedRows, slotStart, slotEnd),
        });
      }

      return {
        key: label,
        label,
        startMs: dayStart.valueOf(),
        endMs: dayEnd.valueOf(),
        slots,
      };
    },

    buildScheduleSlotBlocks(
      rows: TimetableRow[],
      slotStartMs: number,
      slotEndMs: number
    ): TimetableScheduleBlock[] {
      const summarizeSet = (values: Set<string>, separator: string) => {
        const items = Array.from(values).filter(Boolean);
        const summary = items.slice(0, 3).join(separator);
        return items.length > 3 ? `${summary} +${items.length - 3}` : summary;
      };
      const blocks: Record<
        string,
        TimetableRow & {
          apps: Set<string>;
          titles: Set<string>;
        }
      > = {};

      for (const row of rows) {
        const startMs = Math.max(row.startMs, slotStartMs);
        const endMs = Math.min(row.endMs, slotEndMs);
        const overlapSeconds = Math.max(0, (endMs - startMs) / 1000);
        if (overlapSeconds <= 0) continue;

        const key = categoryKey(row.category);
        if (!blocks[key]) {
          blocks[key] = {
            ...row,
            key: `${slotStartMs}-${key}`,
            startMs,
            endMs,
            startLabel: moment(startMs).format('HH:mm'),
            endLabel: moment(endMs).format('HH:mm'),
            duration: 0,
            apps: new Set<string>(),
            titles: new Set<string>(),
          };
        }

        const block = blocks[key];
        block.startMs = Math.min(block.startMs, startMs);
        block.endMs = Math.max(block.endMs, endMs);
        block.startLabel = moment(block.startMs).format('HH:mm');
        block.endLabel = moment(block.endMs).format('HH:mm');
        block.duration += overlapSeconds;
        block.apps.add(row.app);
        block.titles.add(row.title);
      }

      return Object.values(blocks)
        .sort((a, b) => a.startMs - b.startMs)
        .map(block => {
          const appSummary = summarizeSet(block.apps, ', ');
          const titleSummary = summarizeSet(block.titles, ' | ');
          const row = { ...block };
          delete row.apps;
          delete row.titles;
          return {
            ...row,
            app: appSummary,
            title: titleSummary,
            appSummary,
            titleSummary,
          };
        });
    },

    formatTimetableDuration(seconds: number): string {
      return seconds_to_duration(seconds);
    },

    // Merges adjacent events with the same app name within window buckets.
    // This collapses rapid title changes (e.g. toggling UI panels) into single
    // blocks per app, fixing timeline flooding for apps like Adobe Illustrator.
    _applyMergeSimilar: function (buckets) {
      return buckets.map(bucket => {
        if (bucket.type !== 'currentwindow' || !bucket.events || bucket.events.length <= 1) {
          return bucket;
        }

        const sorted = [...bucket.events].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const merged = [];
        let current = { ...sorted[0] };

        for (let i = 1; i < sorted.length; i++) {
          const next = sorted[i];
          const currentEnd = new Date(current.timestamp).getTime() + current.duration * 1000;
          const nextStart = new Date(next.timestamp).getTime();
          const gap = nextStart - currentEnd;

          // Merge if same app and gap is small (< 30 seconds)
          if (current.data?.app && current.data.app === next.data?.app && gap < 30000) {
            const nextEnd = nextStart + next.duration * 1000;
            current.duration =
              (Math.max(currentEnd, nextEnd) - new Date(current.timestamp).getTime()) / 1000;
          } else {
            merged.push(current);
            current = { ...next };
          }
        }
        merged.push(current);

        return { ...bucket, events: merged };
      });
    },

    // Replaces raw window bucket events with AFK-filtered events via aw query engine.
    // Also hides AFK status buckets since they're used for filtering, not display.
    _applyAfkFilter: async function (buckets) {
      const bucketsStore = useBucketsStore();
      const result = [];

      for (const bucket of buckets) {
        // Hide AFK status buckets when AFK filtering is active
        if (bucket.type === 'afkstatus') {
          continue;
        }

        // For window buckets, replace events with AFK-filtered query results
        if (bucket.type === 'currentwindow' && bucket.hostname) {
          const afkBucketIds = bucketsStore.bucketsAFK(bucket.hostname);
          if (afkBucketIds.length > 0) {
            try {
              const filteredEvents = await this._queryAfkFilteredEvents(bucket.id, afkBucketIds[0]);
              // Create a copy with filtered events to avoid mutating frozen all_buckets
              result.push({ ...bucket, events: filteredEvents });
              continue;
            } catch (e) {
              console.warn('AFK filter query failed, falling back to raw events:', e);
            }
          }
        }

        // Keep other buckets unchanged
        result.push(bucket);
      }

      return result;
    },

    // Runs a canonicalEvents query to get window events filtered by AFK status,
    // respecting the user's always_active_pattern setting.
    _queryAfkFilteredEvents: async function (windowBucketId, afkBucketId) {
      const queryCode =
        canonicalEvents({
          bid_window: windowBucketId,
          bid_afk: afkBucketId,
          filter_afk: true,
          always_active_pattern: this.always_active_pattern || undefined,
          categories: [],
          filter_categories: null,
        }) + '\nRETURN = events;';

      const queryArray = queryCode
        .split(';')
        .map(s => s.trim())
        .filter(s => s)
        .map(s => s + ';');

      const start = this.daterange[0].format();
      const end = this.daterange[1].format();
      const timeperiods = [`${start}/${end}`];

      const data = await getClient().query(timeperiods, queryArray);
      return data[0] || [];
    },
  },
};
</script>

<style scoped>
.timeline-day-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.38);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
}

.timeline-day-main {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.timeline-day-nav,
.timeline-day-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.timeline-day-actions {
  justify-content: flex-end;
  min-width: 12rem;
}

.timeline-date-input {
  width: 11rem;
  min-width: 11rem;
}

.timeline-day-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.timeline-day-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 4.1rem;
  min-height: 2.15rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font: inherit;
  line-height: 1;
}

.timeline-day-chip:hover {
  border-color: rgba(37, 99, 235, 0.62);
  background: #e0f2fe;
}

.timeline-day-chip--selected {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.timeline-day-chip--today:not(.timeline-day-chip--selected) {
  border-color: rgba(16, 185, 129, 0.82);
}

.timeline-day-weekday {
  color: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.timeline-table-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

.timeline-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
}

.timeline-table-total {
  white-space: nowrap;
}

.timeline-table-empty {
  padding: 1rem;
  color: #6b7280;
}

.timeline-table-scroll {
  max-height: 620px;
  overflow: auto;
}

.timeline-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.timeline-table th,
.timeline-table td {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  vertical-align: top;
}

.timeline-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #334155;
  font-size: 0.75rem;
  letter-spacing: 0;
  text-transform: uppercase;
}

.timeline-table tbody tr:hover {
  background: #f8fafc;
}

.timeline-table-row--not-work {
  background: rgba(253, 242, 248, 0.5);
}

.timeline-table-time,
.timeline-table-duration {
  width: 5.5rem;
  white-space: nowrap;
}

.timeline-table-app {
  width: 9rem;
  font-weight: 600;
}

.timeline-table-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-category-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  padding: 0.18rem 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  font-weight: 600;
  white-space: nowrap;
}

.timeline-category-dot {
  flex: 0 0 auto;
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 999px;
}

.timeline-schedule-scroll {
  min-height: 34rem;
  max-height: 68vh;
  overflow: auto;
}

.timeline-schedule {
  min-width: 700px;
  padding: 0.75rem 1rem 1rem;
}

.timeline-schedule-day + .timeline-schedule-day {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.28);
}

.timeline-schedule-date {
  margin-bottom: 0.5rem;
  color: #334155;
  font-weight: 800;
}

.timeline-schedule-body {
  display: flex;
  flex-direction: column;
}

.timeline-schedule-slot {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  min-height: 3.25rem;
}

.timeline-schedule-time {
  padding-top: 0.55rem;
  padding-right: 0.75rem;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 800;
  text-align: right;
  white-space: nowrap;
}

.timeline-schedule-track {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0.45rem;
  min-height: 3.25rem;
  padding: 0.35rem 0 0.35rem 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.26);
  border-left: 2px solid rgba(100, 116, 139, 0.42);
}

.timeline-schedule-slot:first-child .timeline-schedule-track {
  border-top: 0;
}

.timeline-schedule-block {
  flex: 1 1 16rem;
  min-width: 13rem;
  padding: 0.5rem 0.65rem;
  overflow: hidden;
  border-left: 5px solid;
  border-radius: 7px;
  background: rgba(248, 250, 252, 0.95);
  box-shadow: 0 7px 20px rgba(15, 23, 42, 0.08);
}

.timeline-schedule-block--not-work {
  background: rgba(253, 242, 248, 0.88);
}

.timeline-schedule-block-header,
.timeline-schedule-block-meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.timeline-schedule-block-header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-schedule-duration {
  margin-left: auto;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 800;
  white-space: nowrap;
}

.timeline-schedule-block-meta,
.timeline-schedule-block-title {
  margin-top: 0.12rem;
  color: #64748b;
  font-size: 0.82rem;
}

.timeline-schedule-block-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .timeline-day-panel,
  .timeline-day-nav,
  .timeline-day-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .timeline-day-actions {
    min-width: 0;
  }

  .timeline-date-input {
    width: 100%;
    min-width: 0;
  }

  .timeline-table {
    min-width: 780px;
  }

  .timeline-table-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
