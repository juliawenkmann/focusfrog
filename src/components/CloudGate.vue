<template lang="pug">
main.cloud-gate
  section.cloud-gate-card
    img.cloud-gate-logo(src="/focusfrog-logo.svg" alt="" width="64" height="64")
    h1 FocusFrog
    p.cloud-gate-lead Your todos, dreams and hours — on your phone.
    p.cloud-gate-emulator(v-if="cloud.emulators") Test data (local emulator)
    template(v-if="cloud.status === 'starting' || cloud.status === 'off'")
      p.cloud-gate-wait(role="status") Opening FocusFrog…
    template(v-else-if="cloud.status === 'notAllowed'")
      p.cloud-gate-text
        | #[strong {{ cloud.email }}] cannot use this FocusFrog. Sign out and sign in with
        | the owner account.
      button.btn.btn-outline-secondary(type="button" @click="cloud.signOut()") Sign out
    template(v-else-if="cloud.status === 'error'")
      p.cloud-gate-text(role="alert") FocusFrog could not reach the cloud: {{ cloud.error }}
    template(v-else)
      p.cloud-gate-text Sign in once on this device. Only your account can see your data.
      cloud-sign-in-form
</template>

<script lang="ts">
import CloudSignInForm from '~/components/CloudSignInForm.vue';
import { useCloudStore } from '~/stores/cloud';

// The phone build's start screen: nothing of the owner's data shows until they sign in.
export default {
  name: 'CloudGate',
  components: { CloudSignInForm },
  computed: {
    cloud() {
      return useCloudStore();
    },
  },
};
</script>

<style lang="scss" scoped>
.cloud-gate {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: max(1.5rem, env(safe-area-inset-top)) 1rem max(1.5rem, env(safe-area-inset-bottom));
}

.cloud-gate-card {
  width: min(25rem, 100%);
  padding: 1.6rem 1.4rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  color: #102033;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px) saturate(1.5);
}

.cloud-gate-logo {
  display: block;
  width: 4rem;
  height: 4rem;
  margin-bottom: 0.6rem;
}

.cloud-gate-card h1 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 800;
}

.cloud-gate-lead {
  margin: 0.2rem 0 1rem;
  font-size: 1rem;
  color: #334155 !important;
}

.cloud-gate-text,
.cloud-gate-wait {
  margin: 0 0 0.9rem;
  font-size: 0.92rem;
  line-height: 1.45;
}

.cloud-gate-emulator {
  display: inline-block;
  margin: 0 0 0.8rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e !important;
  font-size: 0.8rem;
  font-weight: 700;
}
</style>
