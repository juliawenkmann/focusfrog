<template lang="pug">
section.bg-pictures(aria-labelledby="bg-pictures-title")
  div.bg-pictures-head
    strong#bg-pictures-title Background pictures
    span.bg-pictures-hint For the flower styles. Click one to use it.
  div.bg-pictures-group
    span.bg-pictures-group-title Yours
    span.bg-pictures-hint Only your account can see them.
  div.bg-pictures-grid
    div.bg-picture(
      v-for="(picture, index) in pictures"
      :key="picture.id"
      :class="{ 'bg-picture--current': picture.id === currentId }"
    )
      button.bg-picture-use(
        type="button"
        :style="{ backgroundImage: 'url(' + picture.url + ')' }"
        :aria-label="'Use picture ' + (index + 1)"
        :aria-pressed="picture.id === currentId ? 'true' : 'false'"
        title="Use this picture"
        @click="usePicture(picture.id)"
      )
      button.bg-picture-remove(
        v-if="canRemove"
        type="button"
        :class="{ 'bg-picture-remove--confirm': confirmingId === picture.id }"
        :disabled="removingId === picture.id"
        :aria-label="confirmingId === picture.id ? 'Remove picture ' + (index + 1) + ' for good' : 'Remove picture ' + (index + 1)"
        :title="confirmingId === picture.id ? 'Click again to remove it' : 'Remove this picture'"
        @click="removePicture(picture.id)"
      )
        span(v-if="confirmingId === picture.id") Remove?
        icon(v-else name="times")
    label.bg-picture.bg-picture-add(
      :class="{ 'bg-picture-add--busy': uploading }"
      title="Add pictures"
    )
      input.bg-picture-input(
        type="file"
        accept="image/*"
        multiple
        :disabled="uploading"
        @change="addPictures"
      )
      icon(name="plus")
      span {{ uploading ? 'Adding…' : 'Add' }}
  p.bg-pictures-note(v-if="!loaded && pictures.length === 0") Your pictures show here once FocusFrog has reached the cloud.
  p.bg-pictures-note(v-else-if="pictures.length === 0") No pictures yet. Added ones join the flower backgrounds.
  p.bg-pictures-error(v-if="error" role="alert") {{ error }}
  div.bg-pictures-group.bg-pictures-group--built-in
    span.bg-pictures-group-title Built in
  div.bg-pictures-grid
    div.bg-picture(
      v-for="picture in builtIn"
      :key="picture.id"
      :class="{ 'bg-picture--current': picture.id === currentId }"
    )
      button.bg-picture-use(
        type="button"
        :aria-label="'Use ' + picture.name"
        :aria-pressed="picture.id === currentId ? 'true' : 'false'"
        :title="picture.name"
        @click="usePicture(picture.id)"
      )
        img.bg-picture-img(:src="picture.url" alt="" decoding="async")
      button.bg-picture-remove(
        v-if="canRemove"
        type="button"
        :class="{ 'bg-picture-remove--confirm': confirmingId === picture.id }"
        :aria-label="confirmingId === picture.id ? 'Remove ' + picture.name + ' from the list' : 'Remove ' + picture.name"
        :title="confirmingId === picture.id ? 'Click again to remove it' : 'Remove this picture'"
        @click="removeBuiltIn(picture.id)"
      )
        span(v-if="confirmingId === picture.id") Remove?
        icon(v-else name="times")
  template(v-if="removed.length")
    button.bg-pictures-toggle(
      type="button"
      :aria-expanded="showRemoved ? 'true' : 'false'"
      @click="showRemoved = !showRemoved"
    ) {{ showRemoved ? 'Hide removed' : 'Show removed (' + removed.length + ')' }}
    div.bg-pictures-grid(v-if="showRemoved")
      div.bg-picture.bg-picture--removed(v-for="picture in removed" :key="picture.id")
        button.bg-picture-use(
          type="button"
          :aria-label="'Bring back ' + picture.name"
          :title="'Bring back ' + picture.name"
          @click="restoreBuiltIn(picture.id)"
        )
          img.bg-picture-img(:src="picture.url" alt="" decoding="async")
          span.bg-picture-restore(aria-hidden="true")
            icon(name="undo")
</template>

<script lang="ts">
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/times';
import 'vue-awesome/icons/undo';
import { useSettingsStore } from '~/stores/settings';
import {
  backgroundPictures,
  refreshBackgroundPictures,
  removeBackgroundPicture,
  showFlowerBackground,
  uploadBackgroundPicture,
} from '~/sync/backgroundPictures';
import { FLOWER_BACKGROUNDS, nextFlowerBackground } from '~/util/flowerBackgrounds';
import { showsFlowerPictures } from '~/util/focusFrogTheme';

// The pictures that come with FocusFrog, named after their ids ('botanical-night' → 'Botanical night').
const BUILT_IN = FLOWER_BACKGROUNDS.map(background => ({
  id: background.id,
  url: background.url,
  name: background.id.charAt(0).toUpperCase() + background.id.slice(1).replace(/-/g, ' '),
}));

// In the lock button's panel: every background picture to pick from and remove. The owner's
// own ones are deleted from the cloud; built-in ones only leave the list and can come back.
export default {
  name: 'BackgroundPictures',
  data() {
    return { uploading: false, confirmingId: '', removingId: '', error: '', showRemoved: false };
  },
  computed: {
    pictures() {
      return backgroundPictures.items;
    },
    hiddenIds(): string[] {
      return useSettingsStore().focusFrogHiddenBackgrounds;
    },
    builtIn() {
      return BUILT_IN.filter(picture => !this.hiddenIds.includes(picture.id));
    },
    removed() {
      return BUILT_IN.filter(picture => this.hiddenIds.includes(picture.id));
    },
    // The last picture left stays, so the flower styles always have one.
    canRemove(): boolean {
      return this.builtIn.length + this.pictures.length > 1;
    },
    loaded() {
      return backgroundPictures.loaded;
    },
    currentId(): string {
      const settings = useSettingsStore();
      return showsFlowerPictures(settings.focusFrogTheme) ? settings.focusFrogFlowerBackground : '';
    },
  },
  mounted() {
    if (!backgroundPictures.loaded) void refreshBackgroundPictures();
  },
  methods: {
    // Shows the picture now, switching to the flower style unless a flower style is on.
    async usePicture(id: string) {
      this.confirmingId = '';
      const settings = useSettingsStore();
      const theme = showsFlowerPictures(settings.focusFrogTheme)
        ? settings.focusFrogTheme
        : 'flower';
      showFlowerBackground(id);
      await settings.update({ focusFrogTheme: theme, focusFrogFlowerBackground: id });
    },
    async addPictures(event: Event) {
      const input = event.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      input.value = '';
      if (files.length === 0) return;
      this.uploading = true;
      this.error = '';
      this.confirmingId = '';
      try {
        let lastId = '';
        for (const file of files) lastId = (await uploadBackgroundPicture(file)).id;
        if (lastId) await this.usePicture(lastId);
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'FocusFrog could not add this picture.';
      } finally {
        this.uploading = false;
      }
    },
    // The first click asks, the second removes it for good.
    async removePicture(id: string) {
      if (this.confirmingId !== id) {
        this.confirmingId = id;
        return;
      }
      this.confirmingId = '';
      this.removingId = id;
      this.error = '';
      try {
        const settings = useSettingsStore();
        if (settings.focusFrogFlowerBackground === id) {
          const others = this.pictures
            .filter(picture => picture.id !== id)
            .map(picture => picture.id);
          const next = nextFlowerBackground(id, Math.random, others, this.hiddenIds);
          showFlowerBackground(next);
          await settings.update({ focusFrogFlowerBackground: next });
        }
        await removeBackgroundPicture(id);
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'FocusFrog could not remove this picture.';
      } finally {
        this.removingId = '';
      }
    },
    // A built-in picture leaves the list and the flower buttons (first click asks). It stays
    // in the app, under "Show removed".
    async removeBuiltIn(id: string) {
      if (this.confirmingId !== id) {
        this.confirmingId = id;
        return;
      }
      this.confirmingId = '';
      this.error = '';
      const settings = useSettingsStore();
      const hidden = [...this.hiddenIds, id];
      const changes: Record<string, unknown> = { focusFrogHiddenBackgrounds: hidden };
      if (settings.focusFrogFlowerBackground === id) {
        const uploaded = this.pictures.map(picture => picture.id);
        const next = nextFlowerBackground(id, Math.random, uploaded, hidden);
        showFlowerBackground(next);
        changes.focusFrogFlowerBackground = next;
      }
      try {
        await settings.update(changes);
      } catch (error) {
        this.error = 'FocusFrog could not remove this picture.';
      }
    },
    async restoreBuiltIn(id: string) {
      this.error = '';
      const hidden = this.hiddenIds.filter(hiddenId => hiddenId !== id);
      if (hidden.length === 0) this.showRemoved = false;
      try {
        await useSettingsStore().update({ focusFrogHiddenBackgrounds: hidden });
      } catch (error) {
        this.error = 'FocusFrog could not bring this picture back.';
      }
    },
  },
};
</script>

<style scoped>
.bg-pictures {
  margin: 0.85rem 0;
  padding-top: 0.8rem;
  border-top: 1px solid rgba(148, 163, 184, 0.35);
}

.bg-pictures-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-bottom: 0.55rem;
}

.bg-pictures-hint,
.bg-pictures-note {
  color: #475569;
  font-size: 0.76rem;
}

.bg-pictures-note {
  margin: 0.5rem 0 0;
}

.bg-pictures-group {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.45rem;
  margin-bottom: 0.35rem;
}

.bg-pictures-group--built-in {
  margin-top: 0.85rem;
}

.bg-pictures-group-title {
  color: #334155;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.bg-pictures-error {
  margin: 0.5rem 0 0;
  color: #b91c1c;
  font-size: 0.8rem;
  font-weight: 700;
}

.bg-pictures-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.bg-picture {
  position: relative;
  aspect-ratio: 4 / 3;
  margin: 0;
  border-radius: 10px;
}

.bg-picture-use {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 2px solid rgba(148, 163, 184, 0.45);
  border-radius: 10px;
  overflow: hidden;
  background: #0f172a center / cover no-repeat;
}

.bg-picture-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-picture--current .bg-picture-use {
  border-color: #047857;
  box-shadow: 0 0 0 2px rgba(4, 120, 87, 0.3);
}

.bg-picture-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.3rem;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  font-size: 0.66rem;
  font-weight: 800;
}

.bg-picture-remove--confirm {
  background: #b91c1c;
}

/* dark.css colours every button's text by style; this one sits on a dark dot in all of them. */
html[data-dashboard-theme] .bg-pictures .bg-picture-remove,
html[data-dashboard-theme] .bg-pictures .bg-picture-restore {
  color: #ffffff !important;
}

/* The flower styles colour every icon in the top bar navy, which hid the × on its dark dot. */
html[data-dashboard-theme] .bg-pictures .bg-picture-remove .fa-icon,
html[data-dashboard-theme] .bg-pictures .bg-picture-restore .fa-icon {
  color: #ffffff !important;
  fill: #ffffff !important;
}

/* With a mouse the × shows on the picture under it (or in focus), so the grid stays calm;
   touch screens have no hover and always show it. */
@media (hover: hover) {
  .bg-picture-remove {
    opacity: 0;
    transition: opacity 0.12s;
  }

  .bg-picture:hover .bg-picture-remove,
  .bg-picture:focus-within .bg-picture-remove,
  .bg-picture-remove--confirm {
    opacity: 1;
  }
}

/* Removed built-in pictures: faded, with a dot to bring them back. */
.bg-picture--removed .bg-picture-img {
  opacity: 0.45;
}

.bg-picture-restore {
  position: absolute;
  top: 3px;
  right: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  font-size: 0.66rem;
}

.bg-pictures-toggle {
  margin-top: 0.5rem;
  padding: 0;
  border: 0;
  background: none;
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.bg-pictures-toggle + .bg-pictures-grid {
  margin-top: 0.45rem;
}

html[data-dashboard-theme] .bg-pictures .bg-pictures-toggle {
  color: #334155 !important;
}

html[data-dashboard-theme='contrast'] .bg-pictures .bg-pictures-toggle {
  color: #cbd5e1 !important;
}

.bg-picture-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  border: 1.5px dashed rgba(100, 116, 139, 0.7);
  color: #334155;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
}

.bg-picture-add:focus-within {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.bg-picture-add--busy {
  cursor: progress;
  opacity: 0.7;
}

.bg-picture-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

html[data-dashboard-theme='contrast'] .bg-pictures-hint,
html[data-dashboard-theme='contrast'] .bg-pictures-note {
  color: #cbd5e1 !important;
}

html[data-dashboard-theme='contrast'] .bg-pictures-group-title {
  color: #e2e8f0 !important;
}

html[data-dashboard-theme='contrast'] .bg-picture--current .bg-picture-use {
  border-color: #34d399;
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.45);
}

html[data-dashboard-theme='contrast'] .bg-picture-add {
  border-color: rgba(148, 163, 184, 0.7);
  color: #e2e8f0 !important;
}

html[data-dashboard-theme='contrast'] .bg-pictures-error {
  color: #fca5a5 !important;
}
</style>
