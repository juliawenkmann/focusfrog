<template lang="pug">
div.focusfrog-widget.time-dashboard(:class="dashboardThemeClass")
  div.widget-card
    div.widget-header
      div
        div.section-label FocusFrog widget
        h3.mb-0 Today
        div.widget-subtitle {{ todayLabel }}
      div.widget-actions
        b-button(size="sm" variant="outline-secondary" to="/home" title="Open FocusFrog")
          icon(name="external-link-alt")
        b-button(size="sm" variant="outline-secondary" @click="loadSummary" :disabled="loading" title="Refresh")
          icon(name="sync")

    b-alert.mt-3.mb-0(v-if="error" show variant="danger") {{ error }}
    b-alert.mt-3.mb-0(v-else-if="!loading && noSupportedHosts" show variant="warning")
      | No matching window and AFK buckets are available.

    div.widget-body(v-if="summary && activeSeconds > 0")
      div.widget-donut-column
        div.widget-donut(:style="{ background: workSplitPieBackground }")
          div.widget-donut-hole
            span Total
            strong {{ formatHours(activeSeconds) }}
        div.widget-legend
          div.widget-legend-row(v-for="row in workSplitRows" :key="row.label")
            span.widget-legend-color(:style="{ background: row.color }")
            span.widget-legend-label {{ row.label }}
            strong {{ row.percent }}%

      div.widget-metrics
        div.widget-metric.widget-metric-work
          span Work
          strong {{ formatHours(workSeconds) }}
          small {{ workPercent }}%
        div.widget-metric.widget-metric-not-work
          span Not work
          strong {{ formatHours(notWorkSeconds) }}
          small {{ notWorkPercent }}%
        div.widget-metric.widget-metric-total
          span Active total
          strong {{ formatHours(activeSeconds) }}
          small {{ hostSummary }}

    div.widget-empty(v-if="!loading && summary && activeSeconds === 0")
      | No active laptop time found today.

    div.widget-footer(v-if="lastUpdated")
      span Updated {{ lastUpdatedLabel }}

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
  get_day_end_with_offset,
  get_day_start_with_offset,
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
  categorizeFocusFrogEvent,
  categoryKey,
  isNotWorkCategory as isFocusFrogNotWorkCategory,
} from '~/util/focusfrogCategories';

import 'vue-awesome/icons/external-link-alt';
import 'vue-awesome/icons/sync';

interface PieRow {
  label: string;
  duration: number;
  percent: number;
  color: string;
}

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

export default {
  name: 'Widget',
  data() {
    return {
      bucketsStore: useBucketsStore(),
      categoryStore: useCategoryStore(),
      settingsStore: useSettingsStore(),

      loading: false,
      error: '',
      supportedHosts: [] as string[],
      summary: null as WorkCategorySummary | null,
      lastUpdated: null as Date | null,
      refreshTimer: null as number | null,
    };
  },
  computed: {
    dashboardThemeClass(): string {
      const theme = this.settingsStore.focusFrogTheme;
      return `theme-${theme === 'contrast' || theme === 'flower' ? theme : 'bright'}`;
    },
    noSupportedHosts(): boolean {
      return this.supportedHosts.length === 0;
    },
    todayLabel(): string {
      return moment(get_today_with_offset(this.settingsStore.startOfDay)).format('dddd, MMM D');
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
    notWorkPercent(): number {
      return this.activeSeconds > 0 ? 100 - this.workPercent : 0;
    },
    hostSummary(): string {
      if (this.supportedHosts.length === 0) return 'No active host';
      if (this.supportedHosts.length === 1) return this.supportedHosts[0];
      return `${this.supportedHosts.length} devices`;
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
    workSplitPieBackground(): string {
      return buildPieBackground(this.workSplitRows, this.activeSeconds);
    },
    lastUpdatedLabel(): string {
      return this.lastUpdated ? moment(this.lastUpdated).fromNow() : '';
    },
  },
  async mounted() {
    await this.refreshContext();
    await this.loadSummary();
    this.refreshTimer = window.setInterval(() => {
      this.loadSummary();
    }, 60 * 1000);
  },
  beforeDestroy() {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
    }
  },
  methods: {
    async refreshContext() {
      await this.settingsStore.ensureLoaded();
      this.categoryStore.load();
      await this.bucketsStore.ensureLoaded();
      this.supportedHosts = getSupportedWorkReportHosts(
        getWorkReportHostOptions(this.bucketsStore.buckets || [])
          .filter(option => !option.disabled)
          .map(option => option.value),
        this.bucketsStore.buckets || []
      );
    },

    getTodayTimeperiod(): string {
      const offset = this.settingsStore.startOfDay;
      const today = moment(get_today_with_offset(offset));
      return (
        get_day_start_with_offset(today, offset) + '/' + get_day_end_with_offset(today, offset)
      );
    },

    async loadSummary() {
      this.error = '';
      this.summary = null;

      if (this.supportedHosts.length === 0) return;

      this.loading = true;
      try {
        const client = getClient();
        const query = buildWorkSummaryQuery(this.supportedHosts, '[]', []);
        const results = await client.query([this.getTodayTimeperiod()], [query]);
        const activeEvents = this.getGraceAdjustedEvents(results[0] || {});
        this.summary = this.summarizeActiveEvents(activeEvents, sumEventDurations(activeEvents));
        this.lastUpdated = new Date();
      } catch (err) {
        console.error('Error loading widget summary:', err);
        this.error = 'Could not load widget data.';
      } finally {
        this.loading = false;
      }
    },

    getGraceAdjustedEvents(result: any): any[] {
      return addAfkGraceToActiveEvents(result.activeEvents || [], result.rawActiveEvents || []);
    },

    categorizeEvent(event: any): string[] {
      return categorizeFocusFrogEvent(event, this.categoryStore.classes_for_query || []);
    },

    isNotWorkCategory(category: string[]): boolean {
      return isFocusFrogNotWorkCategory(category);
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

    formatHours(seconds: number): string {
      const totalMinutes = Math.round(seconds / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours === 0) return `${minutes}m`;
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    },
  },
};
</script>

<style scoped lang="scss">
.focusfrog-widget {
  --work-color: #059669;
  --not-work-color: #db2777;
  --total-color: #2563eb;
  position: relative;
  max-width: 760px;
  min-height: 420px;
  margin: 0 auto;
  color: #0f172a;
}

.widget-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.48);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.14);
}

.widget-header,
.widget-body,
.widget-footer {
  position: relative;
  z-index: 1;
}

.widget-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.25rem 0.25rem;
}

.widget-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.45rem;
}

.section-label {
  color: #334155;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.widget-subtitle {
  margin-top: 0.15rem;
  color: #475569;
  font-size: 1rem;
}

.widget-body {
  display: grid;
  grid-template-columns: minmax(220px, 0.95fr) minmax(260px, 1.05fr);
  gap: 1rem;
  padding: 1rem 1.25rem 1.15rem;
}

.widget-donut-column {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.widget-donut {
  display: grid;
  flex: 0 0 auto;
  width: min(210px, 42vw);
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid rgba(15, 23, 42, 0.75);
  border-radius: 50%;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.12);
}

.widget-donut-hole {
  display: grid;
  width: 46%;
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid rgba(100, 116, 139, 0.75);
  border-radius: 50%;
  background: #ffffff;
  color: #0f172a;
  text-align: center;
}

.widget-donut-hole span {
  color: #475569;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.widget-donut-hole strong {
  margin-top: -0.7rem;
  font-size: 1.08rem;
  line-height: 1;
}

.widget-legend {
  display: grid;
  min-width: 9rem;
  gap: 0.4rem;
}

.widget-legend-row {
  display: grid;
  grid-template-columns: 0.72rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.42rem;
  color: #0f172a;
  font-weight: 700;
}

.widget-legend-color {
  width: 0.72rem;
  height: 0.72rem;
  border: 1px solid rgba(15, 23, 42, 0.78);
  border-radius: 0.2rem;
}

.widget-legend-label {
  min-width: 0;
}

.widget-metrics {
  display: grid;
  gap: 0.75rem;
}

.widget-metric {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.15rem 0.75rem;
  min-height: 5.6rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-top-width: 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
}

.widget-metric span {
  align-self: end;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
}

.widget-metric strong {
  grid-column: 1 / 2;
  color: #0f172a;
  font-size: clamp(1.8rem, 5vw, 2.55rem);
  line-height: 1;
}

.widget-metric small {
  grid-row: 1 / 3;
  grid-column: 2 / 3;
  align-self: center;
  color: #475569;
  font-weight: 800;
}

.widget-metric-work {
  border-top-color: var(--work-color);
  background: linear-gradient(180deg, rgba(5, 150, 105, 0.11), rgba(255, 255, 255, 0.9));
}

.widget-metric-not-work {
  border-top-color: var(--not-work-color);
  background: linear-gradient(180deg, rgba(219, 39, 119, 0.1), rgba(255, 255, 255, 0.9));
}

.widget-metric-total {
  border-top-color: var(--total-color);
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.11), rgba(255, 255, 255, 0.9));
}

.widget-empty {
  padding: 1rem 1.25rem 1.4rem;
  color: #334155;
}

.widget-footer {
  display: flex;
  justify-content: flex-end;
  padding: 0 1.25rem 1rem;
  color: #475569;
  font-size: 0.84rem;
}

.loading-cover {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.theme-contrast {
  color: #ffffff;
}

.theme-contrast .widget-card {
  border-color: #ffffff;
  background: #0f131a;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.46);
}

.theme-contrast .section-label,
.theme-contrast .widget-subtitle,
.theme-contrast .widget-empty,
.theme-contrast .widget-footer,
.theme-contrast .widget-legend-row,
.theme-contrast .widget-metric span,
.theme-contrast .widget-metric small,
.theme-contrast .widget-metric strong {
  color: #ffffff !important;
}

.theme-contrast .widget-metric {
  border-color: #ffffff;
  background: #141922;
}

.theme-contrast .widget-metric-work {
  border-top-color: var(--work-color);
}

.theme-contrast .widget-metric-not-work {
  border-top-color: var(--not-work-color);
}

.theme-contrast .widget-metric-total {
  border-top-color: #3b82f6;
}

.theme-contrast .widget-donut,
.theme-contrast .widget-donut-hole,
.theme-contrast .widget-legend-color {
  border-color: #ffffff;
}

.theme-contrast .widget-donut-hole {
  background: #111827;
}

.theme-contrast .widget-donut-hole span,
.theme-contrast .widget-donut-hole strong {
  color: #ffffff !important;
}

.theme-contrast .loading-cover {
  background: rgba(15, 19, 26, 0.8);
}

.theme-flower .widget-card {
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 22px 56px rgba(42, 55, 83, 0.16);
}

.theme-flower .widget-card::before {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 16% 12%, rgba(219, 39, 119, 0.12), transparent 28%),
    radial-gradient(circle at 82% 14%, rgba(20, 184, 166, 0.13), transparent 30%),
    linear-gradient(135deg, rgba(255, 247, 237, 0.9), rgba(240, 253, 250, 0.68));
  content: '';
}

.theme-flower .section-label,
.theme-flower .widget-subtitle,
.theme-flower .widget-empty,
.theme-flower .widget-footer,
.theme-flower .widget-legend-row,
.theme-flower .widget-metric span,
.theme-flower .widget-metric small {
  color: #26364d !important;
}

.theme-flower .widget-donut-hole {
  background: #ffffff;
}

@media (max-width: 650px) {
  .focusfrog-widget {
    max-width: 100%;
  }

  .widget-header {
    align-items: stretch;
    flex-direction: column;
  }

  .widget-actions {
    justify-content: flex-end;
  }

  .widget-body {
    grid-template-columns: 1fr;
  }

  .widget-donut-column {
    flex-wrap: wrap;
  }

  .widget-donut {
    width: min(210px, 72vw);
  }
}
</style>
