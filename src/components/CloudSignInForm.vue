<template lang="pug">
form.cloud-signin(novalidate @submit.prevent="submit('signIn')")
  label.cloud-signin-field
    span Email
    input.form-control(
      v-model.trim="email"
      type="email"
      name="email"
      autocomplete="username"
      inputmode="email"
      required
      :disabled="busy"
    )
  label.cloud-signin-field
    span Password
    input.form-control(
      v-model="password"
      type="password"
      name="password"
      :autocomplete="creating ? 'new-password' : 'current-password'"
      minlength="6"
      required
      :disabled="busy"
    )
  p.cloud-signin-error(v-if="message" role="alert") {{ message }}
  p.cloud-signin-note(v-else-if="note" role="status") {{ note }}
  div.cloud-signin-actions
    button.btn.btn-primary(type="submit" :disabled="busy")
      | {{ busy && action === 'signIn' ? 'Signing in…' : 'Sign in' }}
    button.btn.btn-outline-secondary(type="button" :disabled="busy" @click="submit('createAccount')")
      | {{ busy && action === 'createAccount' ? 'Creating…' : 'Create account' }}
  button.cloud-signin-link(type="button" :disabled="busy" @click="resetPassword") Forgot password?
</template>

<script lang="ts">
import { useCloudStore } from '~/stores/cloud';

type Action = 'signIn' | 'createAccount' | 'reset';

// Email and password sign-in, shared by the lock panel and the phone's start screen.
export default {
  name: 'CloudSignInForm',
  data() {
    return {
      email: '',
      password: '',
      action: '' as Action | '',
      message: '',
      note: '',
      creating: false,
    };
  },
  computed: {
    busy(): boolean {
      return Boolean(this.action);
    },
  },
  methods: {
    // Runs one account action with the form busy, showing its error if it fails.
    async run(action: Action, missing: string, task: () => Promise<void>) {
      this.message = missing;
      this.note = '';
      if (missing) return;
      this.action = action;
      try {
        await task();
      } catch (error) {
        this.message = (error as Error).message;
      } finally {
        this.action = '';
      }
    },
    submit(action: 'signIn' | 'createAccount') {
      this.creating = action === 'createAccount';
      const missing = this.email && this.password ? '' : 'Please enter your email and password.';
      return this.run(action, missing, async () => {
        await useCloudStore()[action](this.email, this.password);
        this.password = '';
        this.$emit('signed-in');
      });
    },
    resetPassword() {
      const missing = this.email
        ? ''
        : 'Enter your email first, then tap “Forgot password?” again.';
      return this.run('reset', missing, async () => {
        await useCloudStore().sendPasswordReset(this.email);
        this.note = 'If this account exists, an email to reset the password is on its way.';
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.cloud-signin {
  display: grid;
  gap: 0.7rem;
}

.cloud-signin-field {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
}

.cloud-signin-field .form-control {
  min-height: 2.75rem;
  font-size: 1rem;
}

.cloud-signin-error,
.cloud-signin-note {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.35;
}

.cloud-signin-error {
  color: #b91c1c !important;
}

.cloud-signin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cloud-signin-actions .btn {
  flex: 1 1 8rem;
  min-height: 2.75rem;
  font-weight: 750;
}

.cloud-signin-link {
  justify-self: start;
  padding: 0.25rem 0;
  border: 0;
  background: none;
  color: #334155 !important;
  font-size: 0.82rem;
  text-decoration: underline;
  cursor: pointer;
}
</style>
