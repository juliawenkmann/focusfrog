<template lang="pug">
div(:class="{'fixed-top-padding': fixedTopMenu}")
  b-navbar.aw-navbar(toggleable="lg" :fixed="fixedTopMenu ? 'top' : null")
    b-navbar-brand.app-brand(to="/home" aria-label="FocusFrog home")
      span.brand-logo(aria-hidden="true")
        span.brand-logo-eye.brand-logo-eye--left
          span.brand-logo-pupil
        span.brand-logo-eye.brand-logo-eye--right
          span.brand-logo-pupil
        span.brand-logo-face
          span.brand-logo-hand.brand-logo-hand--left
          span.brand-logo-hand.brand-logo-hand--right
          span.brand-logo-center
          span.brand-logo-mouth
      span.brand-copy
        span.brand-name FocusFrog
        span.brand-tagline eat the frog first
    b-navbar-toggle(target="nav-collapse")

    b-collapse#nav-collapse(is-nav)
      b-navbar-nav
        b-nav-item(to="/home")
          div.px-2.px-lg-1
            icon(name="clock")
            | Hours

        b-nav-item(to="/timeline" style="font-color: #000;")
          div.px-2.px-lg-1
            icon(name="stream")
            | Timeline

        b-nav-item(to="/pomodoro")
          div.px-2.px-lg-1
            icon(name="clock")
            | Pomodoro
        b-nav-item(to="/todos")
          div.px-2.px-lg-1
            icon(name="tasks")
            | Todos
        b-nav-item(to="/time-blocking")
          div.px-2.px-lg-1
            icon(name="calendar-week")
            | Time Blocking

      b-navbar-nav.ml-auto
        b-nav-form.app-theme-toggle-form
          b-button-group.app-theme-toggle(size="sm" aria-label="FocusFrog theme")
            b-button(
              v-for="option in focusFrogThemeOptions"
              :key="option.value"
              :variant="focusFrogTheme === option.value ? 'primary' : 'outline-secondary'"
              :title="option.title"
              :aria-label="option.title"
              @click="setFocusFrogTheme(option.value)"
            )
              span.theme-flower-symbol(v-if="option.value === 'flower'" aria-hidden="true")
                span.theme-flower-petal.theme-flower-petal--1
                span.theme-flower-petal.theme-flower-petal--2
                span.theme-flower-petal.theme-flower-petal--3
                span.theme-flower-petal.theme-flower-petal--4
                span.theme-flower-petal.theme-flower-petal--5
                span.theme-flower-petal.theme-flower-petal--6
                span.theme-flower-center
              icon(v-else :name="option.icon")

        b-nav-item(to="/settings")
          div.px-2.px-lg-1
            icon(name="cog")
            | Settings
</template>

<style lang="scss" scoped>
.fixed-top-padding {
  padding-bottom: 3.5em;
}
</style>

<script lang="ts">
// only import the icons you use to reduce bundle size
import 'vue-awesome/icons/clock';
import 'vue-awesome/icons/stream';
import 'vue-awesome/icons/cog';
import 'vue-awesome/icons/calendar-week';
import 'vue-awesome/icons/tasks';
import 'vue-awesome/icons/moon';
import 'vue-awesome/icons/sun';

import { mapState } from 'pinia';
import { useSettingsStore } from '~/stores/settings';

export default {
  name: 'Header',
  data() {
    return {
      // Make configurable?
      fixedTopMenu: this.$isAndroid,
    };
  },
  computed: {
    ...mapState(useSettingsStore, ['focusFrogTheme']),
    focusFrogThemeOptions() {
      return [
        {
          value: 'bright',
          text: 'Bright',
          icon: 'sun',
          title: 'Use the brighter FocusFrog style',
        },
        {
          value: 'contrast',
          text: 'Contrast',
          icon: 'moon',
          title: 'Use the higher-contrast FocusFrog style',
        },
        {
          value: 'flower',
          text: 'Flower',
          icon: '',
          title: 'Use the nostalgic flower FocusFrog style',
        },
      ];
    },
  },
  watch: {
    focusFrogTheme(theme) {
      this.applyFocusFrogTheme(theme);
    },
  },
  mounted() {
    this.applyFocusFrogTheme(this.focusFrogTheme);
  },
  methods: {
    applyFocusFrogTheme(theme) {
      if (typeof document === 'undefined') return;
      document.documentElement.dataset.dashboardTheme =
        theme === 'contrast' ? 'contrast' : theme === 'flower' ? 'flower' : 'bright';
    },
    async setFocusFrogTheme(theme) {
      const nextTheme =
        theme === 'contrast' ? 'contrast' : theme === 'flower' ? 'flower' : 'bright';
      this.applyFocusFrogTheme(nextTheme);
      if (this.focusFrogTheme === nextTheme) return;
      await useSettingsStore().update({ focusFrogTheme: nextTheme });
    },
  },
};
</script>

<style lang="scss" scoped>
@use '../style/globals' as *;

.aw-navbar {
  background-color: white;
  border: solid $lightBorderColor;
  border-width: 0 0 1px 0;
  min-height: 3.6rem;
}

.aw-navbar .navbar-brand:not(.app-brand),
.aw-navbar .abs-center {
  display: none !important;
}

.app-brand {
  display: flex !important;
  align-items: center;
  gap: 0.55rem;
  margin-right: 0.95rem;
  padding: 0.22rem 0.7rem 0.22rem 0.2rem;
  border-radius: 999px;
  color: #102033 !important;
  text-decoration: none;
}

.app-brand:hover,
.app-brand:focus {
  background-color: rgba(5, 150, 105, 0.1);
  color: #102033 !important;
  text-decoration: none;
}

.brand-logo {
  position: relative;
  flex: 0 0 auto;
  width: 2.4rem;
  height: 2.35rem;
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 50%;
  background: linear-gradient(135deg, #f8fbff 0%, #ffffff 56%, #fff7ed 100%);
  box-shadow: 0 9px 20px rgba(15, 23, 42, 0.14);
  overflow: visible;
}

.brand-logo-face {
  position: absolute;
  inset: 0.42rem 0.12rem 0.08rem;
  border: 2px solid #047857;
  border-radius: 54% 54% 48% 48%;
  background: radial-gradient(circle at 28% 74%, rgba(236, 72, 153, 0.35) 0 9%, transparent 10%),
    radial-gradient(circle at 72% 74%, rgba(236, 72, 153, 0.35) 0 9%, transparent 10%),
    radial-gradient(circle at 50% 53%, rgba(255, 255, 255, 0.74) 0 18%, transparent 19%),
    conic-gradient(from 0deg, rgba(255, 255, 255, 0.75) 0deg 4deg, transparent 4deg 30deg),
    linear-gradient(135deg, #16a34a 0%, #86efac 100%);
  box-shadow: inset 0 -0.16rem 0 rgba(4, 120, 87, 0.22), inset 0 0.16rem 0 rgba(255, 255, 255, 0.42);
}

.brand-logo-eye {
  position: absolute;
  top: 0.05rem;
  z-index: 3;
  width: 0.77rem;
  height: 0.77rem;
  border: 2px solid #047857;
  border-radius: 50%;
  background: radial-gradient(circle at 68% 28%, #ffffff 0 10%, transparent 11%), #f8fafc;
  box-shadow: 0 0.08rem 0 rgba(4, 120, 87, 0.2);
}

.brand-logo-eye--left {
  left: 0.2rem;
}

.brand-logo-eye--right {
  right: 0.2rem;
}

.brand-logo-pupil {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.27rem;
  height: 0.27rem;
  border-radius: 50%;
  background: #0f172a;
  transform: translate(-50%, -50%);
}

.brand-logo-pupil::after {
  position: absolute;
  top: 0.04rem;
  left: 0.05rem;
  width: 0.08rem;
  height: 0.08rem;
  border-radius: 50%;
  background: #ffffff;
  content: '';
}

.brand-logo-hand {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  height: 0.08rem;
  border-radius: 999px;
  background: #102033;
  transform-origin: left center;
}

.brand-logo-hand--left {
  width: 0.62rem;
  background: #059669;
  transform: rotate(-138deg);
}

.brand-logo-hand--right {
  width: 0.62rem;
  background: #db2777;
  transform: rotate(-42deg);
}

.brand-logo-center {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 0.2rem;
  height: 0.2rem;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #2563eb;
  transform: translate(-50%, -50%);
}

.brand-logo-mouth {
  position: absolute;
  bottom: 0.26rem;
  left: 50%;
  width: 0.72rem;
  height: 0.3rem;
  border-bottom: 0.09rem solid #9d174d;
  border-radius: 0 0 999px 999px;
  transform: translateX(-50%);
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.02;
}

.brand-name {
  color: #102033 !important;
  font-size: 1.08rem;
  font-weight: 800;
}

.brand-tagline {
  color: #64748b !important;
  font-size: 0.68rem;
  font-weight: 650;
}

.nav-item {
  align-items: center;

  margin-left: 0.2em;
  margin-right: 0.2em;
  border-radius: 0.5em;

  &:hover {
    background-color: #ddd;
  }
}

.app-theme-toggle-form {
  align-items: center;
  margin: 0.25rem 0.55rem 0.25rem 0;
}

.app-theme-toggle {
  align-items: center;
}

.app-theme-toggle .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  width: 2.25rem;
  min-height: 2rem;
  padding-right: 0;
  padding-left: 0;
  border-color: rgba(100, 116, 139, 0.55);
  font-weight: 650;
  line-height: 1;
}

.app-theme-toggle .btn-primary {
  border-color: #2563eb;
  background: #2563eb;
}

.theme-flower-symbol {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  margin: 0 auto;
}

.theme-flower-petal,
.theme-flower-center {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
}

.theme-flower-petal {
  width: 0.38rem;
  height: 0.52rem;
  border: 1px solid rgba(30, 64, 110, 0.28);
  border-radius: 999px 999px 760px 760px;
  background: linear-gradient(180deg, #bfdbfe, #3b82f6);
  transform: translate(-50%, -50%) rotate(var(--theme-flower-angle)) translateY(-0.34rem);
  transform-origin: 50% 50%;
}

.theme-flower-petal--1 {
  --theme-flower-angle: 0deg;
}

.theme-flower-petal--2 {
  --theme-flower-angle: 60deg;
}

.theme-flower-petal--3 {
  --theme-flower-angle: 120deg;
}

.theme-flower-petal--4 {
  --theme-flower-angle: 180deg;
}

.theme-flower-petal--5 {
  --theme-flower-angle: 240deg;
}

.theme-flower-petal--6 {
  --theme-flower-angle: 300deg;
}

.theme-flower-center {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: #fffdf4;
  box-shadow: inset 0 0 0 1px rgba(30, 64, 110, 0.28);
  transform: translate(-50%, -50%);
}

@media (max-width: 991.98px) {
  .app-brand {
    margin-right: auto;
  }

  .brand-tagline {
    display: none;
  }

  .app-theme-toggle-form {
    margin-left: 0.2rem;
  }
}
</style>

<style lang="scss">
// Needed because dropdown somehow doesn't properly work with scoping
.nav-item {
  .nav-link {
    color: #555 !important;
  }
}

html[data-dashboard-theme='bright'] .aw-navbar {
  background: linear-gradient(135deg, rgba(248, 251, 255, 0.98), rgba(255, 247, 242, 0.94)),
    linear-gradient(315deg, rgba(236, 253, 245, 0.98), rgba(239, 246, 255, 0.98));
  border-color: rgba(148, 163, 184, 0.45);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

html[data-dashboard-theme='bright'] .aw-navbar .nav-link,
html[data-dashboard-theme='bright'] .aw-navbar .nav-link span,
html[data-dashboard-theme='bright'] .aw-navbar .nav-link div,
html[data-dashboard-theme='bright'] .aw-navbar .fa-icon,
html[data-dashboard-theme='bright'] .aw-navbar .dropdown-toggle {
  color: #0f172a !important;
  fill: #0f172a !important;
}

html[data-dashboard-theme='bright'] .aw-navbar .nav-item:hover {
  background-color: #e0f2fe;
}

html[data-dashboard-theme='bright'] .aw-navbar .app-theme-toggle .btn-outline-secondary {
  background-color: rgba(255, 255, 255, 0.72);
  color: #0f172a;
}

html[data-dashboard-theme='bright'] .aw-navbar .app-theme-toggle .btn-outline-secondary .fa-icon {
  fill: #0f172a !important;
}

html[data-dashboard-theme='bright'] .aw-navbar .app-brand,
html[data-dashboard-theme='bright'] .aw-navbar .app-brand:hover,
html[data-dashboard-theme='bright'] .aw-navbar .app-brand:focus {
  color: #0f172a !important;
}

html[data-dashboard-theme='bright'] .aw-navbar .app-brand:hover,
html[data-dashboard-theme='bright'] .aw-navbar .app-brand:focus {
  background-color: rgba(5, 150, 105, 0.12);
}

html[data-dashboard-theme='bright'] .aw-navbar .brand-name {
  color: #0f172a !important;
}

html[data-dashboard-theme='bright'] .aw-navbar .brand-tagline {
  color: #475569 !important;
}

html[data-dashboard-theme='flower'] body {
  background: linear-gradient(rgba(255, 252, 247, 0.16), rgba(255, 247, 245, 0.26)),
    url('~@/assets/focusfrog-flower-clean-bg-v2.webp') center center / cover no-repeat fixed,
    #fff8f3 !important;
  color: #10213a !important;
}

html[data-dashboard-theme='flower'] .aw-navbar {
  background: linear-gradient(135deg, rgba(255, 253, 245, 0.98), rgba(239, 246, 255, 0.96)),
    linear-gradient(315deg, rgba(219, 234, 254, 0.9), rgba(255, 253, 245, 0.72));
  border-color: rgba(30, 64, 110, 0.24);
  box-shadow: 0 8px 24px rgba(15, 38, 71, 0.1);
}

html[data-dashboard-theme='flower'] .aw-container {
  position: relative;
  overflow: hidden;
  background: rgba(255, 252, 248, 0.91) !important;
  border-color: rgba(30, 64, 110, 0.28) !important;
  box-shadow: 0 24px 58px rgba(97, 57, 76, 0.16) !important;
  backdrop-filter: blur(12px) saturate(0.94);
}

html[data-dashboard-theme='flower'] .aw-container:has(.todos-page) {
  background: rgba(255, 252, 248, 0.3) !important;
  backdrop-filter: blur(9px) saturate(0.94);
}

html[data-dashboard-theme='flower'] .aw-container::before {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 0 0, rgba(255, 219, 230, 0.18), transparent 24rem),
    radial-gradient(circle at 100% 100%, rgba(211, 235, 221, 0.2), transparent 26rem);
  content: '';
  pointer-events: none;
}

html[data-dashboard-theme='flower'] .aw-container > * {
  position: relative;
}

html[data-dashboard-theme='flower'] .aw-navbar .nav-link,
html[data-dashboard-theme='flower'] .aw-navbar .nav-link span,
html[data-dashboard-theme='flower'] .aw-navbar .nav-link div,
html[data-dashboard-theme='flower'] .aw-navbar .fa-icon,
html[data-dashboard-theme='flower'] .aw-navbar .dropdown-toggle {
  color: #102a4c !important;
  fill: #102a4c !important;
}

html[data-dashboard-theme='flower'] .aw-navbar .nav-item:hover {
  background-color: rgba(219, 234, 254, 0.72);
}

html[data-dashboard-theme='flower'] .aw-navbar .app-theme-toggle .btn-outline-secondary {
  border-color: rgba(30, 64, 110, 0.42);
  background-color: rgba(255, 253, 245, 0.94);
  color: #102a4c;
}

html[data-dashboard-theme='flower'] .aw-navbar .app-theme-toggle .btn-outline-secondary .fa-icon {
  fill: #102a4c !important;
}

html[data-dashboard-theme='flower'] .aw-navbar .app-theme-toggle .btn-primary {
  border-color: #ec4899;
  background: #ec4899;
  color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .aw-navbar .app-brand,
html[data-dashboard-theme='flower'] .aw-navbar .app-brand:hover,
html[data-dashboard-theme='flower'] .aw-navbar .app-brand:focus {
  color: #102a4c !important;
}

html[data-dashboard-theme='flower'] .aw-navbar .app-brand:hover,
html[data-dashboard-theme='flower'] .aw-navbar .app-brand:focus {
  background-color: rgba(219, 234, 254, 0.56);
}

html[data-dashboard-theme='flower'] .aw-navbar .brand-name {
  color: #102a4c !important;
}

html[data-dashboard-theme='flower'] .aw-navbar .brand-tagline {
  color: #38506f !important;
}

html[data-dashboard-theme='flower'] .aw-navbar .brand-logo {
  border-color: rgba(30, 64, 110, 0.28);
  background: linear-gradient(135deg, #fffdf4 0%, #ffffff 56%, #fdf2f8 100%);
}

html[data-dashboard-theme='flower'] .btn-primary {
  border-color: #10b981 !important;
  background-color: #10b981 !important;
  color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .btn-outline-secondary,
html[data-dashboard-theme='flower'] .btn-outline-primary,
html[data-dashboard-theme='flower'] .btn-outline-dark {
  border-color: rgba(30, 64, 110, 0.44) !important;
  background-color: rgba(255, 253, 245, 0.94) !important;
  color: #102a4c !important;
}

html[data-dashboard-theme='flower'] .btn-outline-secondary:hover,
html[data-dashboard-theme='flower'] .btn-outline-primary:hover,
html[data-dashboard-theme='flower'] .btn-outline-dark:hover {
  border-color: rgba(30, 64, 110, 0.56) !important;
  background-color: #dbeafe !important;
  color: #102a4c !important;
}

html[data-dashboard-theme='flower'] .todos-page,
html[data-dashboard-theme='flower'] .timeline-page,
html[data-dashboard-theme='flower'] .settings-layout,
html[data-dashboard-theme='flower'] .settings-title,
html[data-dashboard-theme='flower'] .modal-content {
  color: #10213a !important;
}

html[data-dashboard-theme='flower'] .todos-page h3,
html[data-dashboard-theme='flower'] .todos-page h5,
html[data-dashboard-theme='flower'] .timeline-page h3,
html[data-dashboard-theme='flower'] .settings-title,
html[data-dashboard-theme='flower'] .settings-section__title,
html[data-dashboard-theme='flower'] .modal-title {
  color: #071b33 !important;
}

html[data-dashboard-theme='flower'] .text-muted,
html[data-dashboard-theme='flower'] .todo-card-meta,
html[data-dashboard-theme='flower'] .todo-card-notes,
html[data-dashboard-theme='flower'] .todo-mini-meta,
html[data-dashboard-theme='flower'] .todo-matrix-axis,
html[data-dashboard-theme='flower'] .todo-plan-subtle,
html[data-dashboard-theme='flower'] .todo-drag-handle,
html[data-dashboard-theme='flower'] .todo-calendar-lane-label,
html[data-dashboard-theme='flower'] .todo-empty,
html[data-dashboard-theme='flower'] .timeline-table-empty,
html[data-dashboard-theme='flower'] .timeline-schedule-block-meta,
html[data-dashboard-theme='flower'] .timeline-schedule-block-title,
html[data-dashboard-theme='flower'] .settings-content .text-muted,
html[data-dashboard-theme='flower'] .settings-content small,
html[data-dashboard-theme='flower'] .settings-section .form-text {
  color: #38506f !important;
  opacity: 1 !important;
}

html[data-dashboard-theme='flower'] .todo-section,
html[data-dashboard-theme='flower'] .todo-plan-view,
html[data-dashboard-theme='flower'] .todo-plan-panel,
html[data-dashboard-theme='flower'] .todo-plan-card,
html[data-dashboard-theme='flower'] .todo-plan-choice,
html[data-dashboard-theme='flower'] .todo-calendar-view,
html[data-dashboard-theme='flower'] .todo-matrix-view,
html[data-dashboard-theme='flower'] .todo-matrix-quadrant,
html[data-dashboard-theme='flower'] .todo-matrix-card,
html[data-dashboard-theme='flower'] .todo-card,
html[data-dashboard-theme='flower'] .todo-mini-card,
html[data-dashboard-theme='flower'] .todo-check-button,
html[data-dashboard-theme='flower'] .todo-priority-flag,
html[data-dashboard-theme='flower'] .timeline-day-panel,
html[data-dashboard-theme='flower'] .timeline-table-card,
html[data-dashboard-theme='flower'] .timeline-schedule-block,
html[data-dashboard-theme='flower'] .modal-content {
  border-color: rgba(30, 64, 110, 0.32) !important;
  background: rgba(255, 253, 245, 0.97) !important;
  color: #10213a !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-section,
html[data-dashboard-theme='flower'] .todos-page .todo-plan-view,
html[data-dashboard-theme='flower'] .todos-page .todo-calendar-view,
html[data-dashboard-theme='flower'] .todos-page .todo-matrix-view {
  background: rgba(255, 253, 245, 0.68) !important;
  backdrop-filter: blur(6px) saturate(0.96);
}

html[data-dashboard-theme='flower'] .todos-page .todo-plan-panel,
html[data-dashboard-theme='flower'] .todos-page .todo-matrix-quadrant {
  background: rgba(255, 253, 245, 0.9) !important;
}

html[data-dashboard-theme='flower'] .timeline-schedule-block--not-work,
html[data-dashboard-theme='flower'] .todo-card--upcoming,
html[data-dashboard-theme='flower'] .todo-matrix-quadrant--delegate {
  background: #f8fbff !important;
}

html[data-dashboard-theme='flower'] .todo-card--due,
html[data-dashboard-theme='flower'] .todo-plan-panel--selected,
html[data-dashboard-theme='flower'] .todo-calendar-day-header--today {
  background: linear-gradient(
    180deg,
    rgba(239, 246, 255, 0.96),
    rgba(255, 253, 245, 0.98)
  ) !important;
}

html[data-dashboard-theme='flower'] .todo-check-button,
html[data-dashboard-theme='flower'] .todo-check-button--action,
html[data-dashboard-theme='flower'] .todo-check-button--mini {
  border-color: rgba(16, 185, 129, 0.58) !important;
  background: #ffffff !important;
  color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .todo-check-button:hover,
html[data-dashboard-theme='flower'] .todo-check-button:focus {
  border-color: #10b981 !important;
  background: #ecfdf5 !important;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.14) !important;
}

html[data-dashboard-theme='flower'] .todo-check-button--complete,
html[data-dashboard-theme='flower'] .todo-check-button--done {
  border-color: #10b981 !important;
  background: #10b981 !important;
  color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .todo-count,
html[data-dashboard-theme='flower'] .todo-plan-index {
  background: #ecfdf5 !important;
  color: #047857 !important;
}

html[data-dashboard-theme='flower'] .todo-plan-card--frog .todo-plan-index,
html[data-dashboard-theme='flower'] .todo-frog-badge {
  border-color: #ec4899 !important;
  background: #fdf2f8 !important;
  color: #9d174d !important;
}

html[data-dashboard-theme='flower'] .custom-control-label::before {
  border-color: rgba(16, 185, 129, 0.56) !important;
  background-color: #fffdf5 !important;
}

html[data-dashboard-theme='flower'] .custom-control-label::after {
  background-color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .custom-control-input:checked ~ .custom-control-label::before {
  border-color: #10b981 !important;
  background-color: #10b981 !important;
}

html[data-dashboard-theme='flower'] .custom-control-input:focus ~ .custom-control-label::before {
  box-shadow: 0 0 0 0.2rem rgba(16, 185, 129, 0.22) !important;
}

html[data-dashboard-theme='flower'] .custom-switch .custom-control-label::before {
  background-color: #fdf2f8 !important;
  border-color: rgba(236, 72, 153, 0.46) !important;
}

html[data-dashboard-theme='flower']
  .custom-switch
  .custom-control-input:checked
  ~ .custom-control-label::before {
  background-color: #10b981 !important;
  border-color: #10b981 !important;
}

html[data-dashboard-theme='flower'] .settings-nav .nav-link {
  color: #38506f !important;
}

html[data-dashboard-theme='flower'] .settings-nav .nav-link:hover {
  background-color: #dbeafe !important;
  color: #102a4c !important;
}

html[data-dashboard-theme='flower'] .settings-nav .nav-link.active,
html[data-dashboard-theme='flower'] .settings-nav .nav-link.active:hover {
  background-color: #10b981 !important;
  color: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .aw-navbar {
  background: #0f131a;
  border-color: #ffffff;
}

html[data-dashboard-theme='contrast'] .aw-navbar .nav-link,
html[data-dashboard-theme='contrast'] .aw-navbar .nav-link span,
html[data-dashboard-theme='contrast'] .aw-navbar .nav-link div,
html[data-dashboard-theme='contrast'] .aw-navbar .fa-icon,
html[data-dashboard-theme='contrast'] .aw-navbar .dropdown-toggle {
  color: #ffffff !important;
  fill: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .aw-navbar .nav-item:hover {
  background-color: #343a40;
}

html[data-dashboard-theme='contrast'] .aw-navbar .app-theme-toggle .btn-outline-secondary {
  border-color: #ffffff;
  background-color: #151922;
  color: #ffffff;
}

html[data-dashboard-theme='contrast'] .aw-navbar .app-theme-toggle .btn-primary {
  border-color: #ffffff;
}

html[data-dashboard-theme='contrast'] .aw-navbar .app-brand,
html[data-dashboard-theme='contrast'] .aw-navbar .app-brand:hover,
html[data-dashboard-theme='contrast'] .aw-navbar .app-brand:focus {
  color: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .aw-navbar .app-brand:hover,
html[data-dashboard-theme='contrast'] .aw-navbar .app-brand:focus {
  background-color: rgba(255, 255, 255, 0.12);
}

html[data-dashboard-theme='contrast'] .aw-navbar .brand-name,
html[data-dashboard-theme='contrast'] .aw-navbar .brand-tagline {
  color: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .aw-navbar .brand-logo {
  border-color: #ffffff;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #eff6ff 100%);
}

html[data-dashboard-theme='contrast'] .badge-info {
  border: 1px solid #93c5fd !important;
  background-color: #1d4ed8 !important;
  color: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .settings-content .text-muted,
html[data-dashboard-theme='contrast'] .settings-content small,
html[data-dashboard-theme='contrast'] .settings-section .form-text,
html[data-dashboard-theme='contrast'] .settings-section .text-muted,
html[data-dashboard-theme='contrast'] .settings-section .col-form-label,
html[data-dashboard-theme='contrast'] .settings-section legend {
  color: #dbeafe !important;
  opacity: 1 !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-view {
  background: rgba(255, 253, 245, 0.68) !important;
  border-color: rgba(167, 103, 127, 0.28) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-grid {
  background: rgba(255, 247, 243, 0.48) !important;
  border-color: rgba(167, 103, 127, 0.34) !important;
  box-shadow: 0 14px 34px rgba(112, 64, 82, 0.11) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-day {
  background: rgba(255, 251, 246, 0.58) !important;
  border-color: rgba(167, 103, 127, 0.24) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-day:nth-child(even) {
  background: rgba(252, 244, 249, 0.56) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-day-header {
  background: linear-gradient(
    145deg,
    rgba(255, 247, 242, 0.94),
    rgba(249, 235, 243, 0.86)
  ) !important;
  border-color: rgba(167, 103, 127, 0.26) !important;
  color: #17324d !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-day-header span {
  color: #8f5268 !important;
  font-weight: 800;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-day-header strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.8rem;
  min-height: 1.8rem;
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #176b54 !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-day-header--today {
  background: linear-gradient(
    145deg,
    rgba(225, 248, 236, 0.95),
    rgba(255, 232, 241, 0.9)
  ) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-lane {
  background: rgba(255, 253, 249, 0.26) !important;
  border-color: rgba(167, 103, 127, 0.2) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-lane:hover {
  background: rgba(229, 248, 238, 0.58) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-lane--over {
  background: rgba(219, 245, 232, 0.72) !important;
  box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.62) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-lane-label {
  color: #8f5268 !important;
  letter-spacing: 0.035em;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-view .todo-mini-card {
  background: rgba(255, 253, 249, 0.88) !important;
  border-color: rgba(167, 103, 127, 0.28) !important;
  box-shadow: 0 6px 16px rgba(103, 61, 78, 0.1) !important;
  color: #17324d !important;
  backdrop-filter: blur(5px);
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-view .todo-mini-card:hover {
  border-color: rgba(16, 185, 129, 0.52) !important;
  box-shadow: 0 9px 20px rgba(103, 61, 78, 0.15) !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-view .todo-mini-meta,
html[data-dashboard-theme='flower'] .todos-page .todo-calendar-view .todo-drag-handle {
  color: #536882 !important;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-scroll {
  scrollbar-color: rgba(190, 112, 143, 0.58) rgba(255, 247, 243, 0.45);
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-scroll::-webkit-scrollbar {
  height: 0.7rem;
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(255, 247, 243, 0.45);
}

html[data-dashboard-theme='flower'] .todos-page .todo-calendar-scroll::-webkit-scrollbar-thumb {
  border: 2px solid rgba(255, 247, 243, 0.62);
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.62), rgba(236, 72, 153, 0.55));
}
</style>
