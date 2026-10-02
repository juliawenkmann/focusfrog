<template lang="pug">
div#wrapper(v-if="loaded")
  div.flower-petal-field(aria-hidden="true")
    span.flower-petal-fall(
      v-for="petal in 14"
      :key="petal"
      :class="`flower-petal-fall--${petal}`"
    )

  aw-header(v-if="!chromeless")
  frog-reminder(v-if="!chromeless")

  div(:class="{'container': !fullContainer, 'container-fluid': fullContainer}").px-0.px-md-2
    div.aw-container.my-sm-3.p-3(:class="{ 'aw-container-widget': chromeless }")
      error-boundary
        user-satisfaction-poll(v-if="!chromeless")
        new-release-notification(v-if="!chromeless && isNewReleaseCheckEnabled")
        router-view

  aw-footer(v-if="!chromeless")
</template>

<script lang="ts">
import { useSettingsStore } from '~/stores/settings';
import { useServerStore } from '~/stores/server';
import FrogReminder from '~/components/FrogReminder.vue';

export default {
  components: {
    FrogReminder,
  },
  data: function () {
    return {
      activityViews: [],
      isNewReleaseCheckEnabled: !process.env.VUE_APP_ON_ANDROID,
      loaded: false,
    };
  },

  computed: {
    fullContainer() {
      return this.$route.meta.fullContainer;
    },
    chromeless() {
      return Boolean(this.$route.meta.chromeless);
    },
  },

  async beforeCreate() {
    // Get Theme From LocalStorage
    const settingsStore = useSettingsStore();
    await settingsStore.ensureLoaded();
    document.documentElement.dataset.dashboardTheme =
      settingsStore.focusFrogTheme === 'contrast'
        ? 'contrast'
        : settingsStore.focusFrogTheme === 'flower'
        ? 'flower'
        : 'bright';

    // FocusFrog's bright, contrast, and flower palettes all live in dark.css.
    // Load it independently of ActivityWatch's legacy light/dark preference.
    // A fresh query value avoids an installed browser's service worker serving
    // an older copy after FocusFrog itself has been upgraded.
    const existingThemeLink = document.querySelector('#focusfrog-theme-stylesheet');
    existingThemeLink?.remove();
    const themeLink = document.createElement('link');
    themeLink.id = 'focusfrog-theme-stylesheet';
    themeLink.href = `/dark.css?focusfrog=${Date.now()}`;
    themeLink.rel = 'stylesheet';
    await new Promise<void>(resolve => {
      themeLink.addEventListener('load', () => resolve(), { once: true });
      themeLink.addEventListener('error', () => resolve(), { once: true });
      document.head.appendChild(themeLink);
    });

    this.loaded = true;
  },

  mounted: async function () {
    const serverStore = useServerStore();
    await serverStore.getInfo();
  },
};
</script>

<style lang="scss">
.flower-petal-field {
  position: fixed;
  z-index: 0;
  inset: -12vh 0 0;
  display: none;
  height: 124vh;
  overflow: hidden;
  pointer-events: none;
}

html[data-dashboard-theme='flower'] .flower-petal-field {
  display: block;
}

html[data-dashboard-theme='flower'] #wrapper > :not(.flower-petal-field):not(.frog-reminder) {
  position: relative;
  z-index: 1;
}

.flower-petal-fall {
  --petal-drift: 5vw;
  --petal-scale: 1;
  --petal-spin: 480deg;

  position: absolute;
  top: 0;
  left: 5%;
  width: 0.72rem;
  height: 1rem;
  border: 1px solid rgba(190, 94, 129, 0.22);
  border-radius: 78% 12% 72% 18%;
  background: radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.92) 0 8%, transparent 9%),
    linear-gradient(145deg, rgba(255, 208, 222, 0.94), rgba(226, 117, 158, 0.88));
  box-shadow: 0 4px 9px rgba(112, 45, 75, 0.13);
  opacity: 0;
  animation: focusfrog-petal-fall 18s linear infinite;
  will-change: transform, opacity;
}

.flower-petal-fall:nth-child(2n) {
  border-color: rgba(173, 123, 194, 0.2);
  background: radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.9) 0 8%, transparent 9%),
    linear-gradient(145deg, rgba(239, 220, 249, 0.94), rgba(183, 129, 205, 0.84));
}

.flower-petal-fall:nth-child(3n) {
  width: 0.58rem;
  height: 0.84rem;
  border-color: rgba(211, 132, 147, 0.2);
  background: linear-gradient(145deg, rgba(255, 230, 232, 0.95), rgba(232, 148, 164, 0.82));
}

.flower-petal-fall--1 {
  left: 2%;
  animation-delay: -4s;
  animation-duration: 19s;
}

.flower-petal-fall--2 {
  --petal-drift: -4vw;
  --petal-scale: 0.78;

  left: 8%;
  animation-delay: -14s;
  animation-duration: 23s;
}

.flower-petal-fall--3 {
  --petal-drift: 7vw;
  --petal-scale: 1.08;

  left: 15%;
  animation-delay: -8s;
  animation-duration: 26s;
}

.flower-petal-fall--4 {
  --petal-drift: -5vw;
  --petal-scale: 0.7;

  left: 24%;
  animation-delay: -18s;
  animation-duration: 29s;
}

.flower-petal-fall--5 {
  --petal-drift: 4vw;
  --petal-scale: 0.88;

  left: 35%;
  animation-delay: -11s;
  animation-duration: 24s;
}

.flower-petal-fall--6 {
  --petal-drift: -6vw;
  --petal-scale: 0.72;

  left: 46%;
  animation-delay: -22s;
  animation-duration: 31s;
}

.flower-petal-fall--7 {
  --petal-drift: 6vw;
  --petal-scale: 0.9;

  left: 57%;
  animation-delay: -5s;
  animation-duration: 27s;
}

.flower-petal-fall--8 {
  --petal-drift: -5vw;
  --petal-scale: 0.68;

  left: 67%;
  animation-delay: -16s;
  animation-duration: 30s;
}

.flower-petal-fall--9 {
  --petal-drift: 8vw;
  --petal-scale: 1.02;

  left: 76%;
  animation-delay: -9s;
  animation-duration: 25s;
}

.flower-petal-fall--10 {
  --petal-drift: -4vw;
  --petal-scale: 0.74;

  left: 84%;
  animation-delay: -20s;
  animation-duration: 28s;
}

.flower-petal-fall--11 {
  --petal-drift: 5vw;
  --petal-scale: 0.94;

  left: 91%;
  animation-delay: -12s;
  animation-duration: 22s;
}

.flower-petal-fall--12 {
  --petal-drift: -7vw;
  --petal-scale: 0.65;

  left: 97%;
  animation-delay: -25s;
  animation-duration: 32s;
}

.flower-petal-fall--13 {
  --petal-drift: 3vw;
  --petal-scale: 0.62;

  left: 19%;
  animation-delay: -28s;
  animation-duration: 34s;
}

.flower-petal-fall--14 {
  --petal-drift: -3vw;
  --petal-scale: 0.64;

  left: 80%;
  animation-delay: -30s;
  animation-duration: 36s;
}

@keyframes focusfrog-petal-fall {
  0% {
    opacity: 0;
    transform: translate3d(0, -8vh, 0) rotate(0deg) scale(var(--petal-scale));
  }

  10% {
    opacity: 0.54;
  }

  72% {
    opacity: 0.46;
  }

  100% {
    opacity: 0;
    transform: translate3d(var(--petal-drift), 124vh, 0) rotate(var(--petal-spin))
      scale(var(--petal-scale));
  }
}

@media (prefers-reduced-motion: reduce) {
  .flower-petal-fall {
    display: none;
    animation: none;
  }
}
</style>
