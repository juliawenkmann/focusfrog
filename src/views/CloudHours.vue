<template lang="pug">
div.cloud-hours
  header.cloud-hours-head
    div
      span.cloud-hours-kicker From your Mac
      h3 Hours
    div.cloud-hours-range(role="tablist" aria-label="Period")
      button(
        v-for="option in ranges"
        :key="option.value"
        type="button"
        role="tab"
        :aria-selected="range === option.value ? 'true' : 'false'"
        :class="{ 'cloud-hours-range--active': range === option.value }"
        @click="range = option.value"
      ) {{ option.label }}

  p.cloud-hours-updated(v-if="updatedLabel") {{ updatedLabel }}

  section.cloud-hours-empty(v-if="!summary")
    h4 No hours yet
    p
      | Open FocusFrog on your Mac and sign in there. While it is open, it sends your
      | work hours here every few minutes.

  template(v-else)
    div.cloud-hours-metrics
      article.cloud-hours-metric.cloud-hours-metric--work
        span Work
        strong {{ formatHours(summary.workDuration) }}
        small {{ workPercent }}% of active time
      article.cloud-hours-metric.cloud-hours-metric--life
        span Not work
        strong {{ formatHours(summary.notWorkDuration) }}
        small {{ 100 - workPercent }}%
      article.cloud-hours-metric
        span Active total
        strong {{ formatHours(summary.activeDuration) }}
        small(v-if="range === 'week'") {{ dayRows.length }} days
        small(v-else-if="range === 'sinceRecording'") {{ weekCount }} weeks
        small(v-else) today

    section.cloud-hours-days(v-if="range === 'week'" aria-label="Work per day")
      div.cloud-hours-day(v-for="row in dayRows" :key="row.date")
        span.cloud-hours-day-label {{ row.label }}
        div.cloud-hours-day-track
          span(:style="{ width: row.percent + '%' }")
        span.cloud-hours-day-value {{ formatHours(row.work) }}

    section.cloud-hours-categories(v-if="categoryRows.length" aria-label="Time per category")
      h4 Where the time went
      div.cloud-hours-category(v-for="row in categoryRows" :key="row.key")
        span.cloud-hours-category-dot(:style="{ background: row.color }")
        span.cloud-hours-category-name {{ row.label }}
        span.cloud-hours-category-value {{ formatHours(row.duration) }}
        div.cloud-hours-category-track
          span(:style="{ width: row.percent + '%', background: row.color }")
</template>

<script lang="ts">
import moment from 'moment';
import { useSettingsStore } from '~/stores/settings';
import type { DaySum } from '~/sync/daySums';
import { categoryColor, categoryKey, workSubcategoryLabel } from '~/util/focusfrogCategories';
import { onStoredValueChange, peekStoredValue } from '~/util/focusfrogStorage';
import { formatHoursMinutes, get_today_with_offset } from '~/util/time';
import {
  normalizeWeeklySummaryStore,
  sumWorkSummaries,
  WEEKLY_SUMMARY_SERVER_KEY,
} from '~/util/weeklySummaries';
import { currentWeekDates } from '~/util/workDay';
import type { WorkCategorySummary } from '~/util/workReport';

type HoursRange = 'today' | 'week' | 'sinceRecording';

const RANGES: { value: HoursRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'sinceRecording', label: 'All' },
];

// Hours on the phone: the daily and weekly sums the Mac sends (see sync/daySums.ts).
export default {
  name: 'CloudHours',
  data() {
    return {
      range: 'today' as HoursRange,
      days: {} as Record<string, DaySum>,
      weeks: {} as Record<string, WorkCategorySummary>,
      ranges: RANGES,
    };
  },
  computed: {
    todayKey(): string {
      return get_today_with_offset(useSettingsStore().startOfDay);
    },
    weekDates(): string[] {
      return currentWeekDates(this.todayKey);
    },
    weekCount(): number {
      return Object.keys(this.weeks).length + 1;
    },
    summary(): WorkCategorySummary | null {
      if (this.range === 'today') return this.days[this.todayKey] || null;
      const thisWeek = this.weekDates.map(date => this.days[date]).filter(Boolean);
      const finished =
        this.range === 'week'
          ? []
          : Object.entries(this.weeks)
              .filter(([weekStart]) => weekStart < this.weekDates[0])
              .map(([, week]) => week);
      const all = [...finished, ...thisWeek];
      return all.length ? sumWorkSummaries(all) : null;
    },
    workPercent(): number {
      const active = this.summary?.activeDuration || 0;
      return active > 0 ? Math.round(((this.summary?.workDuration || 0) / active) * 100) : 0;
    },
    dayRows(): { date: string; label: string; work: number; percent: number }[] {
      const work = this.weekDates.map(date => this.days[date]?.workDuration || 0);
      const most = Math.max(...work, 1);
      return this.weekDates.map((date, index) => ({
        date,
        label: moment(date).format('ddd'),
        work: work[index],
        percent: Math.round((work[index] / most) * 100),
      }));
    },
    categoryRows() {
      const rows = (this.summary?.categoryDurations || []).filter(row => row.duration >= 60);
      const total = rows.reduce((sum, row) => sum + row.duration, 0) || 1;
      return rows.slice(0, 12).map(row => ({
        key: categoryKey(row.category),
        label: workSubcategoryLabel(row.category),
        color: categoryColor(row.category),
        duration: row.duration,
        percent: Math.max(2, Math.round((row.duration / total) * 100)),
      }));
    },
    updatedLabel(): string {
      const today = this.days[this.todayKey];
      if (!today?.computedAt) return '';
      const updated = moment(today.computedAt);
      return `Updated ${updated.fromNow()} (${updated.format('HH:mm')})`;
    },
  },
  async mounted() {
    this.$once('hook:beforeDestroy', onStoredValueChange('daySums', this.setDays));
    this.$once('hook:beforeDestroy', onStoredValueChange(WEEKLY_SUMMARY_SERVER_KEY, this.setWeeks));
    const [days, weeks] = await Promise.all([
      peekStoredValue('daySums'),
      peekStoredValue(WEEKLY_SUMMARY_SERVER_KEY),
    ]);
    this.setDays(days.value);
    this.setWeeks(weeks.value);
  },
  methods: {
    // Frozen: the sums are only read, so Vue need not watch every day and category.
    setDays(value: unknown) {
      this.days = Object.freeze(value && typeof value === 'object' ? { ...value } : {});
    },
    setWeeks(value: unknown) {
      this.weeks = Object.freeze(normalizeWeeklySummaryStore(value));
    },
    formatHours: formatHoursMinutes,
  },
};
</script>

<style lang="scss" scoped>
.cloud-hours {
  display: grid;
  gap: 1rem;
}

.cloud-hours-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.8rem;
}

.cloud-hours-head h3 {
  margin: 0;
}

.cloud-hours-kicker {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #047857 !important;
}

.cloud-hours-range {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.1);
}

.cloud-hours-range button {
  min-height: 2.5rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-weight: 750;
  color: #102033;
}

.cloud-hours-range .cloud-hours-range--active {
  background: #10b981;
  color: #ffffff !important;
}

.cloud-hours-updated {
  margin: -0.4rem 0 0;
  font-size: 0.82rem;
  color: #475569 !important;
}

.cloud-hours-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.cloud-hours-metric,
.cloud-hours-days,
.cloud-hours-categories,
.cloud-hours-empty {
  padding: 0.9rem 1rem;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
}

.cloud-hours-metric {
  display: grid;
  gap: 0.15rem;
  border-top: 4px solid #94a3b8;
}

.cloud-hours-metric--work {
  border-top-color: #059669;
}

.cloud-hours-metric--life {
  border-top-color: #db2777;
}

.cloud-hours-metric span {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.cloud-hours-metric strong {
  font-size: 1.45rem;
  line-height: 1.15;
}

.cloud-hours-metric small {
  font-size: 0.75rem;
  color: #475569 !important;
}

.cloud-hours-day {
  display: grid;
  grid-template-columns: 2.6rem 1fr 4.2rem;
  align-items: center;
  gap: 0.6rem;
  min-height: 2rem;
}

.cloud-hours-day-label,
.cloud-hours-day-value {
  font-size: 0.85rem;
  font-weight: 700;
}

.cloud-hours-day-value {
  text-align: right;
}

.cloud-hours-day-track,
.cloud-hours-category-track {
  height: 0.55rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.cloud-hours-day-track span,
.cloud-hours-category-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #10b981;
}

.cloud-hours-categories h4,
.cloud-hours-empty h4 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}

.cloud-hours-category {
  display: grid;
  grid-template-columns: 0.7rem 1fr auto;
  align-items: center;
  gap: 0.25rem 0.55rem;
  padding: 0.35rem 0;
}

.cloud-hours-category-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
}

.cloud-hours-category-name {
  overflow: hidden;
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-hours-category-value {
  font-size: 0.85rem;
  font-weight: 750;
}

.cloud-hours-category-track {
  grid-column: 2 / 4;
  height: 0.35rem;
}

@media (max-width: 520px) {
  .cloud-hours-metrics {
    grid-template-columns: 1fr 1fr;
  }

  .cloud-hours-metric:last-child {
    grid-column: 1 / -1;
  }
}
</style>
