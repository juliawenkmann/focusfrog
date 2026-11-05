<template lang="pug">
div.cloud-account(v-if="cloud.available")
  button.cloud-account-toggle(
    ref="toggle"
    type="button"
    :data-state="cloud.status"
    :aria-expanded="open ? 'true' : 'false'"
    aria-controls="cloud-account-panel"
    :aria-label="'Phone sync: ' + cloud.statusLabel"
    :title="cloud.statusLabel"
    @click="open = !open"
  )
    icon(:name="cloud.signedIn ? 'lock' : 'lock-open'")
    span.cloud-account-dot(aria-hidden="true")
  div#cloud-account-panel.cloud-account-panel(
    v-if="open"
    role="dialog"
    aria-label="Phone sync"
    @keydown.esc="close"
  )
    div.cloud-account-head
      strong Phone sync
      button.cloud-account-close(type="button" aria-label="Close" @click="close")
        icon(name="times")
    p.cloud-account-emulator(v-if="cloud.emulators") Test data (local emulator)
    template(v-if="cloud.status === 'signedOut' || cloud.status === 'starting'")
      p.cloud-account-text
        | Sign in to keep your todos, dreams and time blocks in sync with your phone.
        | Only your account can see them.
      cloud-sign-in-form(@signed-in="close")
    template(v-else-if="cloud.status === 'error'")
      p.cloud-account-text FocusFrog could not reach the cloud: {{ cloud.error }}
    template(v-else)
      p.cloud-account-status(:data-state="cloud.status") {{ cloud.statusLabel }}
      p.cloud-account-text(v-if="cloud.email") Signed in as #[strong {{ cloud.email }}]
      p.cloud-account-text(v-if="cloud.status === 'notAllowed'")
        | FocusFrog only syncs for its owner. Sign out and use the owner account.
      button.btn.btn-outline-secondary.btn-sm(type="button" :disabled="signingOut" @click="signOut")
        | {{ signingOut ? 'Signing out…' : 'Sign out' }}
</template>

<script lang="ts">
import 'vue-awesome/icons/lock';
import 'vue-awesome/icons/lock-open';
import 'vue-awesome/icons/times';
import CloudSignInForm from '~/components/CloudSignInForm.vue';
import { useCloudStore } from '~/stores/cloud';

// The lock in the top bar: sign in to sync with the phone, see whether it is synced.
export default {
  name: 'CloudAccount',
  components: { CloudSignInForm },
  data() {
    return { open: false, signingOut: false };
  },
  computed: {
    cloud() {
      return useCloudStore();
    },
  },
  watch: {
    open(isOpen: boolean) {
      if (isOpen) document.addEventListener('pointerdown', this.closeOnOutsideClick);
      else document.removeEventListener('pointerdown', this.closeOnOutsideClick);
    },
  },
  beforeDestroy() {
    document.removeEventListener('pointerdown', this.closeOnOutsideClick);
  },
  methods: {
    close() {
      this.open = false;
      (this.$refs.toggle as HTMLElement | undefined)?.focus();
    },
    closeOnOutsideClick(event: PointerEvent) {
      if (!this.$el.contains(event.target as Node)) this.open = false;
    },
    async signOut() {
      this.signingOut = true;
      try {
        await this.cloud.signOut();
      } finally {
        this.signingOut = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.cloud-account {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 0.5rem;
}

.cloud-account-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: #102033;
  cursor: pointer;
}

.cloud-account-toggle .fa-icon {
  width: 0.85rem;
  fill: currentColor;
}

.cloud-account-dot {
  position: absolute;
  top: 0.1rem;
  right: 0.1rem;
  width: 0.6rem;
  height: 0.6rem;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #94a3b8;
}

.cloud-account-toggle[data-state='synced'] .cloud-account-dot {
  background: #10b981;
}

.cloud-account-toggle[data-state='saving'] .cloud-account-dot,
.cloud-account-toggle[data-state='starting'] .cloud-account-dot {
  background: #f59e0b;
}

.cloud-account-toggle[data-state='error'] .cloud-account-dot,
.cloud-account-toggle[data-state='notAllowed'] .cloud-account-dot {
  background: #ef4444;
}

.cloud-account-panel {
  position: absolute;
  z-index: 1050;
  top: calc(100% + 0.5rem);
  right: 0;
  width: min(22rem, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 16px;
  background: #ffffff;
  color: #102033;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.2);
}

.cloud-account-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 1rem;
}

.cloud-account-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.cloud-account-close .fa-icon {
  width: 0.7rem;
  fill: currentColor;
}

.cloud-account-text,
.cloud-account-status,
.cloud-account-emulator {
  margin: 0 0 0.7rem;
  font-size: 0.86rem;
  line-height: 1.4;
}

.cloud-account-emulator {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-weight: 700;
}

.cloud-account-status {
  font-weight: 750;
}

.cloud-account-status[data-state='synced'] {
  color: #047857;
}
</style>
