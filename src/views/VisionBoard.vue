<template lang="pug">
div.vision-board-page(:aria-busy="loading ? 'true' : 'false'")
  header.vision-board-header
    div.vision-board-heading
      div.vision-board-kicker
        icon(name="magic")
        span Picture the life you want
      h3.mb-1 Vision Board
      p.mb-0 Keep the big dreams visible, then celebrate each one you make real.
    div.vision-board-header-actions
      div.vision-board-progress(v-if="items.length" aria-live="polite")
        span.vision-board-progress-number {{ achievedCount }}/{{ items.length }}
        span dreams achieved
        span.vision-board-progress-divider(v-if="attentionCount" aria-hidden="true") ·
        span.vision-board-attention-count(v-if="attentionCount") {{ attentionCount }} to review
      b-button.vision-add-button(
        variant="primary"
        type="button"
        :disabled="saving || loading"
        @click="openNewItem()"
      )
        icon.mr-2(name="plus")
        | Add a dream

  b-alert.vision-sync-warning(
    v-if="syncWarning"
    show
    dismissible
    variant="warning"
    @dismissed="syncWarning = ''"
  ) {{ syncWarning }}
  p.sr-only(aria-live="polite" aria-atomic="true") {{ checkInAnnouncement }}
  p#vision-reorder-instructions.sr-only
    | Drag this handle, or use the arrow keys, to change the card order.

  div.vision-board-toolbar(v-if="items.length")
    nav.vision-filter-list(aria-label="Filter vision board")
      button.vision-filter(
        v-for="filter in filters"
        :key="filter.value"
        ref="filterButtons"
        type="button"
        :data-filter="filter.value"
        :class="{ 'vision-filter--active': activeFilter === filter.value }"
        :aria-pressed="activeFilter === filter.value ? 'true' : 'false'"
        :aria-label="filter.label + ', ' + filterCount(filter.value)"
        :disabled="loading || saving || !!draggedItemId"
        @click="activeFilter = filter.value"
      )
        span {{ filter.label }}
        span.vision-filter-count {{ filterCount(filter.value) }}
    div.vision-board-toolbar-actions
      span.vision-board-hint {{ reorderHint }}
      label.vision-sort-control(for="vision-board-sort")
        span Sort by
        select#vision-board-sort.vision-sort-select(
          v-model="sortMode"
          :disabled="loading || saving || !!draggedItemId"
          @change="persistSortPreference"
        )
          option(v-for="option in sortOptions" :key="option.value" :value="option.value")
            | {{ option.label }}

  section.vision-empty(v-if="!loading && items.length === 0")
    div.vision-empty-collage(aria-hidden="true")
      span.vision-empty-card.vision-empty-card--one
        icon(name="image")
      span.vision-empty-card.vision-empty-card--two
        icon(name="heart")
      span.vision-empty-card.vision-empty-card--three
        icon(name="star")
    div.vision-empty-copy
      div.vision-board-kicker Your future, in pictures
      h4 Start with one thing you would love to do
      p Add a dream or bucket-list moment, then choose a photo that makes it feel close.
      b-button(variant="primary" type="button" :disabled="saving || loading" @click="openNewItem()")
        icon.mr-2(name="plus")
        | Add your first dream
      div.vision-starter-prompts
        span Try:
        button(type="button" :disabled="saving || loading" @click="openNewItem('A place I want to visit')") A place to visit
        button(type="button" :disabled="saving || loading" @click="openNewItem('Something I want to learn')") Something to learn
        button(type="button" :disabled="saving || loading" @click="openNewItem('A moment I want to create')") A moment to create

  section.vision-no-results(v-else-if="!loading && filteredItems.length === 0")
    icon(name="heart")
    h4 Nothing here yet
    p {{ emptyFilterMessage }}

  draggable.vision-grid(
    v-else-if="!loading"
    tag="section"
    :value="filteredItems"
    :class="{ 'vision-grid--dragging': draggedItemId }"
    :disabled="!canReorder"
    handle=".vision-drag-handle"
    :animation="reducedMotion ? 0 : 180"
    :delay="160"
    :delay-on-touch-only="true"
    :touch-start-threshold="5"
    :force-fallback="true"
    :fallback-tolerance="4"
    ghost-class="vision-card--drag-ghost"
    chosen-class="vision-card--drag-chosen"
    drag-class="vision-card--dragging"
    aria-label="Vision board dreams"
    @start="startCardDrag"
    @end="dropCard"
  )
    article.vision-card(
      v-for="item in filteredItems"
      :key="item.id"
      :class="[cardPaletteClass(item), { 'vision-card--achieved': item.status === 'achieved', 'vision-card--attention': needsAttention(item), 'vision-card--photo': item.imageId, 'vision-card--counter': item.counterTarget }]"
    )
      img.vision-card-image(
        v-if="item.imageId"
        :src="itemImageUrl(item)"
        :alt="'Vision board background for ' + item.title"
        loading="lazy"
        decoding="async"
      )
      div.vision-card-scrim
      div.vision-card-topline
        label.vision-complete-control(
          :class="{ 'vision-complete-control--checked': item.status === 'achieved', 'vision-complete-control--disabled': saving || loading }"
        )
          input.vision-complete-checkbox(
            type="checkbox"
            :checked="item.status === 'achieved'"
            :disabled="saving || loading"
            :aria-label="item.status === 'achieved' ? 'Mark ' + item.title + ' as not done' : 'Mark ' + item.title + ' as done'"
            @change="toggleAchieved(item)"
          )
          span.vision-complete-label Done
        div.vision-card-controls
          button.vision-icon-button.vision-drag-handle(
            type="button"
            :disabled="!canReorder"
            :aria-label="dragHandleLabel(item)"
            aria-describedby="vision-reorder-instructions"
            :data-item-id="item.id"
            title="Drag to reorder"
            @keydown.left.prevent.stop="moveCard(item, -1)"
            @keydown.up.prevent.stop="moveCard(item, -1)"
            @keydown.right.prevent.stop="moveCard(item, 1)"
            @keydown.down.prevent.stop="moveCard(item, 1)"
          )
            span.vision-drag-grip(aria-hidden="true")
          div.vision-card-actions
            button.vision-icon-button(
              type="button"
              :disabled="saving"
              :aria-label="'Edit ' + item.title"
              title="Edit"
              @click="openEditItem(item)"
            )
              icon(name="pen")
            button.vision-icon-button.vision-icon-button--danger(
              type="button"
              :disabled="saving"
              :aria-label="'Delete ' + item.title"
              title="Delete"
              @click="deleteItem(item)"
            )
              icon(name="trash")
      div.vision-card-copy
        span.vision-card-date(v-if="item.status === 'achieved' && item.achievedAt")
          | Made real {{ formatDate(item.achievedAt) }}
        h4 {{ item.title }}
        p(v-if="item.notes") {{ item.notes }}
        div.vision-card-accountability
          div.vision-accountability-meta(v-if="usesAccountability(item)")
            span.vision-accountability-state(
              :class="'vision-accountability-state--' + accountabilityState(item)"
            ) {{ accountabilityLabel(item) }}
            time.vision-target-date(v-if="item.targetDate" :datetime="item.targetDate") {{ targetDateLabel(item.targetDate) }}
          template(v-if="usesAccountability(item)")
            div.vision-card-progress-copy(:class="{ 'vision-card-progress-copy--counter': item.counterTarget }")
              template(v-if="item.counterTarget")
                span.vision-counter-summary(:title="counterLabel(item)") {{ counterCompactLabel(item) }}
                button.vision-counter-increment(
                  v-if="item.status !== 'achieved'"
                  type="button"
                  :disabled="saving || item.counterCurrent >= item.counterTarget"
                  :aria-disabled="item.counterCurrent >= item.counterTarget ? 'true' : 'false'"
                  :aria-label="counterIncrementLabel(item)"
                  @click="incrementCounter(item)"
                )
                  icon(name="plus")
                  span {{ item.counterCurrent >= item.counterTarget ? 'Goal reached' : 'Add one' }}
                span.vision-counter-complete(v-else-if="item.counterCurrent >= item.counterTarget") Goal reached
              template(v-else)
                span Progress
                strong {{ item.progress }}%
            div.vision-card-progress-track(
              role="progressbar"
              :aria-label="item.title + ' progress'"
              aria-valuemin="0"
              :aria-valuemax="item.counterTarget || 100"
              :aria-valuenow="item.counterTarget ? item.counterCurrent : item.progress"
              :aria-valuetext="item.counterTarget ? counterLabel(item) : item.progress + ' percent'"
            )
              span(:style="{ width: counterPercentage(item) + '%' }")

  b-modal(
    id="vision-board-editor-modal"
    :title="editingId ? 'Edit dream' : 'Add to your vision board'"
    :no-close-on-backdrop="saving"
    :no-close-on-esc="saving"
    :hide-header-close="saving"
    centered
    size="lg"
    hide-footer
    @shown="focusEditorField"
    @hidden="handleModalHidden"
  )
    form.vision-editor(@submit.prevent="saveItem")
      b-alert(v-if="formError" show variant="danger") {{ formError }}
      div.vision-editor-layout
        div.vision-editor-fields
          b-form-group(label="Dream or bucket-list item" label-for="vision-title")
            b-form-input#vision-title(
              ref="titleInput"
              v-model.trim="draft.title"
              maxlength="120"
              placeholder="See the northern lights"
              autocomplete="off"
              :disabled="saving"
              required
            )
          b-form-group(label="Why it matters (optional)" label-for="vision-notes")
            b-form-textarea#vision-notes(
              v-model.trim="draft.notes"
              maxlength="800"
              rows="5"
              placeholder="What would make this dream special?"
              :disabled="saving"
            )
            small.vision-character-count {{ draft.notes.length }}/800
          div.vision-editor-accountability-fields
            b-form-group.vision-target-date-field(
              label="Target date"
              label-for="vision-target-date"
              :class="{ 'vision-target-date-field--wide': draft.useCounter }"
            )
              b-form-input#vision-target-date(
                v-model="draft.targetDate"
                type="date"
                :disabled="saving"
              )
            b-form-group(v-if="!draft.useCounter" label-for="vision-progress")
              template(slot="label")
                span Progress
                strong.vision-progress-value(aria-hidden="true") {{ draft.progress }}%
              b-form-input#vision-progress(
                v-model.number="draft.progress"
                type="range"
                min="0"
                max="100"
                step="5"
                :aria-valuetext="draft.progress + ' percent'"
                :disabled="saving"
              )
            fieldset.vision-counter-option
              legend.sr-only Measurable check-off counter
              div.vision-counter-toggle-row
                b-form-checkbox(
                  v-model="draft.useCounter"
                  switch
                  :disabled="saving"
                  @change="handleCounterToggle"
                ) Use a check-off counter
                strong.vision-counter-preview(v-if="draft.useCounter") {{ draftCounterProgress }}%
              small.vision-accountability-help For books, workouts, lessons, or anything countable.
            div.vision-counter-fields(v-if="draft.useCounter")
              b-form-group(label="Done" label-for="vision-counter-current")
                b-form-input#vision-counter-current(
                  v-model.number="draft.counterCurrent"
                  type="number"
                  min="0"
                  :max="draft.counterTarget || 9999"
                  step="1"
                  inputmode="numeric"
                  :disabled="saving"
                )
              b-form-group(label="Goal" label-for="vision-counter-target")
                b-form-input#vision-counter-target(
                  v-model.number="draft.counterTarget"
                  type="number"
                  min="1"
                  max="9999"
                  step="1"
                  inputmode="numeric"
                  placeholder="5"
                  :disabled="saving"
                )
              b-form-group.vision-counter-unit-field(
                label="Unit (optional)"
                label-for="vision-counter-unit"
              )
                b-form-input#vision-counter-unit(
                  v-model.trim="draft.counterUnit"
                  maxlength="24"
                  placeholder="books"
                  autocomplete="off"
                  :disabled="saving"
                )
        div.vision-editor-photo
          label.vision-image-picker(
            :class="{ 'vision-image-picker--filled': draftImageUrl }"
            for="vision-image-input"
            @dragover.prevent="allowImageDrop"
            @drop.prevent="handleImageDrop"
          )
            input#vision-image-input.vision-file-input(
              ref="imageInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :disabled="saving"
              @click="resetFileInputValue"
              @change="handleImageChange"
            )
            img(v-if="draftImageUrl" :src="draftImageUrl" alt="Selected background preview")
            div.vision-image-picker-copy(v-else)
              span.vision-image-picker-icon
                icon(name="camera")
              strong Add a background photo
              span Drop an image here or choose one
              small JPEG, PNG, or WebP · up to 8 MB
            div.vision-image-change(v-if="draftImageUrl")
              icon.mr-1(name="camera")
              span Change photo
          button.vision-remove-image(
            v-if="draftImageUrl"
            type="button"
            :disabled="saving"
            @click="removeDraftImage"
          ) Remove photo
      div.vision-editor-actions
        b-button(
          v-if="editingId"
          variant="outline-danger"
          type="button"
          :disabled="saving"
          @click="deleteEditingItem"
        )
          icon.mr-1(name="trash")
          | Delete
        span.vision-editor-action-spacer
        b-button(variant="outline-secondary" type="button" :disabled="saving" @click="closeEditor")
          | Cancel
        b-button(type="submit" variant="primary" :disabled="saving || !draft.title")
          b-spinner.mr-2(v-if="saving" small)
          icon.mr-2(v-else name="check")
          | {{ saving ? 'Saving…' : editingId ? 'Save dream' : 'Add to board' }}
</template>

<script lang="ts">
import 'vue-awesome/icons/camera';
import 'vue-awesome/icons/check';
import 'vue-awesome/icons/heart';
import 'vue-awesome/icons/image';
import 'vue-awesome/icons/magic';
import 'vue-awesome/icons/pen';
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/star';
import 'vue-awesome/icons/trash';
import draggable from 'vuedraggable';
import {
  chooseNewestVisionBoardDocument,
  emptyVisionBoardDocument,
  normalizeVisionBoardDocument,
  normalizeVisionBoardItems,
  normalizeVisionBoardSort,
  sortVisionBoardItems,
  validateVisionImage,
  visionBoardCounterProgress,
  visionBoardItemNeedsAttention,
  visionBoardItemUsesAccountability,
  visionImageUrl,
  VisionBoardDocument,
  VisionBoardItem,
  VisionBoardSort,
  VISION_BOARD_SERVER_KEY,
  VISION_BOARD_SORT_STORAGE_KEY,
  VISION_BOARD_STORAGE_KEY,
  VISION_COUNTER_MAX,
} from '~/util/visionBoard';

type VisionFilter = 'all' | 'attention' | 'dreaming' | 'achieved';

interface VisionDraft {
  title: string;
  notes: string;
  targetDate: string;
  progress: number;
  useCounter: boolean;
  counterCurrent: number;
  counterTarget: number;
  counterUnit: string;
  imageId: string;
}

interface VisionImageUpload {
  id: string;
  url: string;
  mimeType: string;
  size: number;
}

interface VisionBoardPersistenceResult {
  localSaved: boolean;
  serverSaved: boolean;
}

interface VisionLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface VisionDragEvent {
  oldIndex?: number;
  newIndex?: number;
}

const EDITOR_MODAL_ID = 'vision-board-editor-modal';

function blankDraft(): VisionDraft {
  return {
    title: '',
    notes: '',
    targetDate: '',
    progress: 0,
    useCounter: false,
    counterCurrent: 0,
    counterTarget: 5,
    counterUnit: '',
    imageId: '',
  };
}

function makeItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vision-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseLocalDateKey(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

export default {
  name: 'VisionBoard',
  components: { draggable },
  data() {
    return {
      items: [] as VisionBoardItem[],
      boardUpdatedAt: '',
      activeFilter: 'all' as VisionFilter,
      sortMode: 'board' as VisionBoardSort,
      loading: true,
      editingId: '',
      draft: blankDraft(),
      pendingImage: null as File | null,
      pendingImageUrl: '',
      removeExistingImage: false,
      saving: false,
      formError: '',
      syncWarning: '',
      checkInAnnouncement: '',
      draggedItemId: '',
      dragStartOrder: [] as string[],
      reducedMotion: false,
      filters: [
        { value: 'all' as VisionFilter, label: 'All' },
        { value: 'dreaming' as VisionFilter, label: 'Open' },
        { value: 'attention' as VisionFilter, label: 'Review' },
        { value: 'achieved' as VisionFilter, label: 'Achieved' },
      ],
      sortOptions: [
        { value: 'board' as VisionBoardSort, label: 'My order' },
        { value: 'newest' as VisionBoardSort, label: 'Newest first' },
        { value: 'oldest' as VisionBoardSort, label: 'Oldest first' },
        { value: 'title' as VisionBoardSort, label: 'A–Z' },
        { value: 'target' as VisionBoardSort, label: 'Target date' },
        { value: 'progress' as VisionBoardSort, label: 'Closest to done' },
      ],
    };
  },
  computed: {
    achievedCount(): number {
      return this.items.filter((item: VisionBoardItem) => item.status === 'achieved').length;
    },
    attentionCount(): number {
      return this.items.filter((item: VisionBoardItem) => this.needsAttention(item)).length;
    },
    canReorder(): boolean {
      return (
        this.activeFilter === 'all' &&
        this.sortMode === 'board' &&
        !this.loading &&
        !this.saving &&
        this.items.length > 1
      );
    },
    reorderHint(): string {
      if (this.saving) return 'Saving your latest board change…';
      if (this.items.length < 2) return 'Add another dream to arrange your board.';
      return this.canReorder
        ? 'Drag the grip to arrange your board.'
        : 'Choose All and My order to drag.';
    },
    filteredItems(): VisionBoardItem[] {
      let visibleItems = this.items;
      if (this.activeFilter === 'attention') {
        visibleItems = this.items.filter((item: VisionBoardItem) => this.needsAttention(item));
      } else if (this.activeFilter !== 'all') {
        visibleItems = this.items.filter(
          (item: VisionBoardItem) => item.status === this.activeFilter
        );
      }
      return sortVisionBoardItems(visibleItems, this.sortMode);
    },
    emptyFilterMessage(): string {
      if (this.activeFilter === 'attention') return 'Nothing needs a check-in right now.';
      if (this.activeFilter === 'achieved') return 'Your completed dreams will collect here.';
      return 'All of your dreams are already achieved — wonderful.';
    },
    draftImageUrl(): string {
      if (this.pendingImageUrl) return this.pendingImageUrl;
      if (!this.removeExistingImage && this.draft.imageId) {
        return visionImageUrl(this.draft.imageId);
      }
      return '';
    },
    draftCounterProgress(): number {
      return visionBoardCounterProgress(this.draft.counterCurrent, this.draft.counterTarget);
    },
  },
  async mounted() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    this.loadSortPreference();
    await this.loadBoard();
  },
  beforeDestroy() {
    this.revokePendingImageUrl();
  },
  methods: {
    loadSortPreference() {
      if (typeof localStorage === 'undefined') return;
      try {
        this.sortMode = normalizeVisionBoardSort(
          localStorage.getItem(VISION_BOARD_SORT_STORAGE_KEY)
        );
      } catch (error) {
        console.warn('Could not read the Vision Board sort preference:', error);
        this.sortMode = 'board';
      }
    },
    persistSortPreference() {
      this.sortMode = normalizeVisionBoardSort(this.sortMode);
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(VISION_BOARD_SORT_STORAGE_KEY, this.sortMode);
      } catch (error) {
        console.warn('Could not save the Vision Board sort preference:', error);
      }
    },
    startCardDrag(event: VisionDragEvent) {
      const oldIndex = event?.oldIndex;
      if (!this.canReorder || !Number.isInteger(oldIndex)) return;
      const visibleItems = this.filteredItems as VisionBoardItem[];
      const movingItem = visibleItems[oldIndex as number];
      if (!movingItem) return;
      this.dragStartOrder = visibleItems.map((item: VisionBoardItem) => item.id);
      this.draggedItemId = movingItem.id;
      this.checkInAnnouncement = `Moving ${movingItem.title}.`;
    },
    endCardDrag() {
      this.draggedItemId = '';
      this.dragStartOrder = [];
    },
    async dropCard(event: VisionDragEvent) {
      const oldIndex = event?.oldIndex;
      const newIndex = event?.newIndex;
      const startOrder = this.dragStartOrder.length
        ? [...this.dragStartOrder]
        : (this.filteredItems as VisionBoardItem[]).map((item: VisionBoardItem) => item.id);
      const movingId = Number.isInteger(oldIndex) ? startOrder[oldIndex as number] : '';
      this.endCardDrag();

      if (movingId && Number.isInteger(newIndex)) {
        await this.reorderCards(movingId, oldIndex as number, newIndex as number, startOrder);
      }
    },
    async moveCard(item: VisionBoardItem, direction: number) {
      if (!this.canReorder || (direction !== -1 && direction !== 1)) return;
      const currentIndex = this.items.findIndex(
        (candidate: VisionBoardItem) => candidate.id === item.id
      );
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0) return;
      if (nextIndex < 0 || nextIndex >= this.items.length) {
        this.checkInAnnouncement = `${item.title} is already ${direction < 0 ? 'first' : 'last'}.`;
        return;
      }
      const startOrder = this.items.map((candidate: VisionBoardItem) => candidate.id);
      await this.reorderCards(item.id, currentIndex, nextIndex, startOrder);
      this.focusDragHandle(item.id);
    },
    focusDragHandle(itemId: string) {
      this.$nextTick(() => {
        const handles = Array.from(
          this.$el.querySelectorAll('.vision-drag-handle')
        ) as HTMLElement[];
        handles.find(handle => handle.dataset.itemId === itemId)?.focus();
      });
    },
    async refreshBoardForReorder(): Promise<boolean> {
      if (
        typeof this.readLocalDocument === 'function' &&
        typeof this.loadServerDocument === 'function'
      ) {
        const localDocument = this.readLocalDocument();
        const serverDocument = await this.loadServerDocument();
        const freshestDocument = chooseNewestVisionBoardDocument(localDocument, serverDocument);
        const freshestScore = Date.parse(freshestDocument.updatedAt || '') || 0;
        const currentScore = Date.parse(this.boardUpdatedAt || '') || 0;
        if (freshestScore > currentScore) {
          this.items = freshestDocument.items;
          this.boardUpdatedAt = freshestDocument.updatedAt;
          this.writeLocalDocument(freshestDocument);
          return true;
        }
      }
      return false;
    },
    async reorderCards(movingId: string, oldIndex: number, newIndex: number, startOrder: string[]) {
      if (
        !this.canReorder ||
        !movingId ||
        !Number.isInteger(oldIndex) ||
        !Number.isInteger(newIndex) ||
        oldIndex === newIndex ||
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= startOrder.length ||
        newIndex >= startOrder.length
      ) {
        return;
      }

      const desiredOrder = [...startOrder];
      const [desiredMovingId] = desiredOrder.splice(oldIndex, 1);
      desiredOrder.splice(newIndex, 0, desiredMovingId);
      const precedingId = desiredOrder[newIndex - 1] || '';
      const followingId = desiredOrder[newIndex + 1] || '';
      const moveWithinItems = (sourceItems: VisionBoardItem[]): VisionBoardItem[] | null => {
        const currentIndex = sourceItems.findIndex(
          (candidate: VisionBoardItem) => candidate.id === movingId
        );
        if (currentIndex < 0) return null;

        const nextItems = [...sourceItems];
        const [movingItem] = nextItems.splice(currentIndex, 1);
        let insertionIndex = -1;
        if (followingId) {
          insertionIndex = nextItems.findIndex(
            (candidate: VisionBoardItem) => candidate.id === followingId
          );
        }
        if (insertionIndex < 0 && precedingId) {
          const precedingIndex = nextItems.findIndex(
            (candidate: VisionBoardItem) => candidate.id === precedingId
          );
          if (precedingIndex >= 0) insertionIndex = precedingIndex + 1;
        }
        if (insertionIndex < 0) insertionIndex = Math.min(newIndex, nextItems.length);
        nextItems.splice(insertionIndex, 0, movingItem);
        return nextItems;
      };

      const originalItems = this.items;
      const originalUpdatedAt = this.boardUpdatedAt;
      const optimisticItems = moveWithinItems(originalItems);
      if (
        !optimisticItems ||
        optimisticItems.every((candidate, index) => candidate.id === originalItems[index]?.id)
      ) {
        return;
      }

      let previousItems: VisionBoardItem[] = originalItems;
      let previousUpdatedAt = originalUpdatedAt;
      let movedTitle =
        optimisticItems.find((candidate: VisionBoardItem) => candidate.id === movingId)?.title ||
        '';
      let savedPosition =
        optimisticItems.findIndex((candidate: VisionBoardItem) => candidate.id === movingId) + 1;

      this.items = optimisticItems;
      this.saving = true;
      this.checkInAnnouncement = '';

      const runReorder = async () => {
        const refreshed = await this.refreshBoardForReorder();
        if (refreshed) {
          previousItems = this.items;
          previousUpdatedAt = this.boardUpdatedAt;
          const rebasedItems = moveWithinItems(this.items);
          if (!rebasedItems) throw new Error('The moved dream is no longer on this board.');
          this.items = rebasedItems;
          movedTitle =
            rebasedItems.find((candidate: VisionBoardItem) => candidate.id === movingId)?.title ||
            movedTitle;
          savedPosition =
            rebasedItems.findIndex((candidate: VisionBoardItem) => candidate.id === movingId) + 1;
        }
        const persistence = await this.persistBoard();
        if (!persistence.localSaved && !persistence.serverSaved) {
          throw new Error('FocusFrog could not save this order.');
        }
        this.checkInAnnouncement = `Moved ${movedTitle} to position ${savedPosition} of ${this.items.length}.`;
      };

      try {
        const lockManager =
          typeof navigator === 'undefined'
            ? undefined
            : (navigator as Navigator & { locks?: VisionLockManager }).locks;
        if (lockManager) {
          await lockManager.request('focusfrog-vision-board', runReorder);
        } else {
          await runReorder();
        }
      } catch (error) {
        this.items = previousItems;
        this.boardUpdatedAt = previousUpdatedAt;
        this.syncWarning = 'FocusFrog could not save this order. Please try again.';
        this.checkInAnnouncement = movedTitle
          ? `Could not move ${movedTitle}.`
          : 'Could not change the board order.';
      } finally {
        this.saving = false;
      }
    },
    filterCount(filter: VisionFilter): number {
      if (filter === 'all') return this.items.length;
      if (filter === 'attention') {
        return this.items.filter((item: VisionBoardItem) => this.needsAttention(item)).length;
      }
      return this.items.filter((item: VisionBoardItem) => item.status === filter).length;
    },
    needsAttention(item: VisionBoardItem): boolean {
      return visionBoardItemNeedsAttention(item);
    },
    usesAccountability(item: VisionBoardItem): boolean {
      return visionBoardItemUsesAccountability(item);
    },
    focusReviewFilter() {
      this.focusFilter('attention');
    },
    dragHandleLabel(item: VisionBoardItem): string {
      const position = this.filteredItems.findIndex(
        (candidate: VisionBoardItem) => candidate.id === item.id
      );
      const positionLabel =
        position >= 0 ? `, position ${position + 1} of ${this.filteredItems.length}` : '';
      return this.canReorder
        ? `Reorder ${item.title}${positionLabel}. Drag or use arrow keys to move it earlier or later.`
        : `${item.title}${positionLabel}. Choose All and My order to rearrange.`;
    },
    focusFilter(filter: VisionFilter) {
      const filterButtons = (this.$refs.filterButtons || []) as HTMLElement[];
      filterButtons.find(button => button.dataset.filter === filter)?.focus();
    },
    targetDaysFromToday(targetDate: string): number | null {
      const target = parseLocalDateKey(targetDate);
      if (!target) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    },
    targetDateLabel(targetDate: string): string {
      const days = this.targetDaysFromToday(targetDate);
      if (days === null) return '';
      if (days < 0) return `${Math.abs(days)}d overdue`;
      if (days === 0) return 'Due today';
      if (days === 1) return 'Due tomorrow';
      if (days <= 30) return `Due in ${days}d`;
      return `Target ${this.formatDate(`${targetDate}T12:00:00`)}`;
    },
    lastCheckInLabel(timestamp: string): string {
      if (!timestamp) return 'Not checked in yet';
      const parsedTimestamp = Date.parse(timestamp);
      if (!Number.isFinite(parsedTimestamp) || parsedTimestamp > Date.now()) {
        return 'Not checked in yet';
      }
      const elapsedDays = Math.max(
        0,
        Math.floor((Date.now() - parsedTimestamp) / (24 * 60 * 60 * 1000))
      );
      if (elapsedDays === 0) return 'Checked in today';
      if (elapsedDays === 1) return 'Checked in yesterday';
      return `Checked in ${elapsedDays}d ago`;
    },
    accountabilityState(item: VisionBoardItem): string {
      if (item.status === 'achieved') return 'achieved';
      if (!this.usesAccountability(item)) return 'optional';
      if (item.counterTarget ? item.counterCurrent >= item.counterTarget : item.progress >= 100) {
        return 'ready';
      }
      const targetDays = this.targetDaysFromToday(item.targetDate);
      if (targetDays !== null && targetDays < 0) return 'overdue';
      if (targetDays !== null && targetDays <= 7) return 'due';
      if (this.needsAttention(item)) return 'check-in';
      if (item.counterTarget && item.counterCurrent === 0) return 'start';
      if (item.counterTarget) return 'progress';
      return 'on-track';
    },
    accountabilityLabel(item: VisionBoardItem): string {
      const labels: Record<string, string> = {
        achieved: 'Achieved',
        optional: 'Plan when ready',
        ready: 'Ready to celebrate',
        overdue: 'Target overdue',
        due: 'Coming up',
        'check-in': 'Check-in due',
        start: 'Ready to start',
        progress: 'In progress',
        'on-track': 'On track',
      };
      return labels[this.accountabilityState(item)];
    },
    counterLabel(item: VisionBoardItem): string {
      const unit = item.counterUnit ? ` ${item.counterUnit}` : '';
      return `${item.counterCurrent} of ${item.counterTarget}${unit}`;
    },
    counterCompactLabel(item: VisionBoardItem): string {
      const unit = item.counterUnit ? ` ${item.counterUnit}` : '';
      return `${item.counterCurrent}/${item.counterTarget}${unit}`;
    },
    counterPercentage(item: VisionBoardItem): number {
      return item.counterTarget
        ? visionBoardCounterProgress(item.counterCurrent, item.counterTarget)
        : item.progress;
    },
    counterIncrementLabel(item: VisionBoardItem): string {
      const progress = this.counterLabel(item);
      return item.counterCurrent >= item.counterTarget
        ? `Goal reached for ${item.title}: ${progress}`
        : `Add one to ${item.title}; currently ${progress}`;
    },
    itemImageUrl(item: VisionBoardItem): string {
      return visionImageUrl(item.imageId);
    },
    cardPaletteClass(item: VisionBoardItem): string {
      const seed = Array.from(item.id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
      return `vision-card--palette-${seed % 5}`;
    },
    formatDate(timestamp: string): string {
      const date = new Date(timestamp);
      if (!Number.isFinite(date.getTime())) return '';
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    },
    openNewItem(title = '') {
      if (this.saving || this.loading) return;
      this.editingId = '';
      this.draft = { ...blankDraft(), title };
      this.removeExistingImage = false;
      this.formError = '';
      this.clearPendingImage();
      this.$root.$emit('bv::show::modal', EDITOR_MODAL_ID);
    },
    openEditItem(item: VisionBoardItem) {
      if (this.saving || this.loading) return;
      this.editingId = item.id;
      this.draft = {
        title: item.title,
        notes: item.notes,
        targetDate: item.targetDate,
        progress: item.progress,
        useCounter: item.counterTarget > 0,
        counterCurrent: item.counterCurrent,
        counterTarget: item.counterTarget || 5,
        counterUnit: item.counterUnit,
        imageId: item.imageId,
      };
      this.removeExistingImage = false;
      this.formError = '';
      this.clearPendingImage();
      this.$root.$emit('bv::show::modal', EDITOR_MODAL_ID);
    },
    handleCounterToggle(enabled: boolean) {
      this.draft.useCounter = enabled;
      if (enabled) {
        if (
          !Number.isSafeInteger(this.draft.counterTarget) ||
          this.draft.counterTarget < 1 ||
          this.draft.counterTarget > VISION_COUNTER_MAX
        ) {
          this.draft.counterTarget = 5;
        }
        if (!Number.isSafeInteger(this.draft.counterCurrent)) {
          this.draft.counterCurrent = 0;
        }
        if (this.draft.counterCurrent === 0 && this.draft.progress > 0) {
          this.draft.counterCurrent =
            this.draft.progress >= 100
              ? this.draft.counterTarget
              : Math.min(
                  this.draft.counterTarget - 1,
                  Math.floor((this.draft.progress / 100) * this.draft.counterTarget)
                );
        }
        return;
      }
      if (
        Number.isSafeInteger(this.draft.counterCurrent) &&
        Number.isSafeInteger(this.draft.counterTarget) &&
        this.draft.counterTarget >= 1 &&
        this.draft.counterTarget <= VISION_COUNTER_MAX &&
        this.draft.counterCurrent >= 0 &&
        this.draft.counterCurrent <= this.draft.counterTarget
      ) {
        this.draft.progress = visionBoardCounterProgress(
          this.draft.counterCurrent,
          this.draft.counterTarget
        );
      }
    },
    focusEditorField() {
      this.$nextTick(() => {
        (this.$refs.titleInput as { focus?: () => void } | undefined)?.focus?.();
      });
    },
    closeEditor() {
      this.$root.$emit('bv::hide::modal', EDITOR_MODAL_ID);
    },
    handleModalHidden() {
      this.clearPendingImage();
      this.editingId = '';
      this.draft = blankDraft();
      this.removeExistingImage = false;
      this.formError = '';
      this.saving = false;
    },
    resetFileInputValue(event: Event) {
      (event.target as HTMLInputElement).value = '';
    },
    handleImageChange(event: Event) {
      const file = (event.target as HTMLInputElement).files?.[0] || null;
      this.selectImage(file);
    },
    allowImageDrop() {
      // The .prevent modifier keeps the browser from opening the file.
    },
    handleImageDrop(event: DragEvent) {
      const file = event.dataTransfer?.files?.[0] || null;
      this.selectImage(file);
    },
    selectImage(file: File | null) {
      if (this.saving || this.loading) return;
      const validationError = validateVisionImage(file);
      if (validationError) {
        this.formError = validationError;
        return;
      }
      this.formError = '';
      this.clearPendingImage();
      this.pendingImage = file;
      this.pendingImageUrl = URL.createObjectURL(file as File);
      this.removeExistingImage = false;
    },
    removeDraftImage() {
      if (this.saving || this.loading) return;
      this.clearPendingImage();
      this.removeExistingImage = true;
    },
    clearPendingImage() {
      this.revokePendingImageUrl();
      this.pendingImage = null;
      const input = this.$refs.imageInput as HTMLInputElement | undefined;
      if (input) input.value = '';
    },
    revokePendingImageUrl() {
      if (this.pendingImageUrl) URL.revokeObjectURL(this.pendingImageUrl);
      this.pendingImageUrl = '';
    },
    readLocalDocument(): VisionBoardDocument {
      if (typeof localStorage === 'undefined') return emptyVisionBoardDocument();
      try {
        const raw = localStorage.getItem(VISION_BOARD_STORAGE_KEY);
        return normalizeVisionBoardDocument(raw ? JSON.parse(raw) : null);
      } catch (error) {
        console.warn('Could not read the local vision board:', error);
        return emptyVisionBoardDocument();
      }
    },
    writeLocalDocument(boardDocument: VisionBoardDocument): boolean {
      if (typeof localStorage === 'undefined') return false;
      try {
        localStorage.setItem(VISION_BOARD_STORAGE_KEY, JSON.stringify(boardDocument));
        return true;
      } catch (error) {
        console.warn('Could not save the local vision board:', error);
        return false;
      }
    },
    async loadServerDocument(): Promise<VisionBoardDocument | null> {
      if (typeof fetch === 'undefined') return null;
      try {
        const response = await fetch(`/focusfrog-storage/${VISION_BOARD_SERVER_KEY}`, {
          cache: 'no-store',
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          return null;
        }
        const payload = await response.json();
        return payload?.value === null || payload?.value === undefined
          ? null
          : normalizeVisionBoardDocument(payload.value);
      } catch (error) {
        console.warn('Could not load FocusFrog vision board storage:', error);
        return null;
      }
    },
    async saveServerDocument(boardDocument: VisionBoardDocument): Promise<boolean> {
      if (typeof fetch === 'undefined') return false;
      try {
        const response = await fetch(`/focusfrog-storage/${VISION_BOARD_SERVER_KEY}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: boardDocument }),
        });
        return response.ok && response.headers.get('content-type')?.includes('application/json');
      } catch (error) {
        console.warn('Could not save FocusFrog vision board storage:', error);
        return false;
      }
    },
    async loadBoard() {
      const localDocument = this.readLocalDocument();
      const serverDocument = await this.loadServerDocument();
      const selectedDocument = chooseNewestVisionBoardDocument(localDocument, serverDocument);
      this.items = selectedDocument.items;
      this.boardUpdatedAt = selectedDocument.updatedAt;
      this.writeLocalDocument(selectedDocument);

      if (
        (selectedDocument.updatedAt || selectedDocument.items.length) &&
        (!serverDocument || JSON.stringify(serverDocument) !== JSON.stringify(selectedDocument))
      ) {
        const repairedServerCopy = await this.saveServerDocument(selectedDocument);
        if (!repairedServerCopy) {
          this.syncWarning =
            'Loaded your latest board from this browser, but FocusFrog could not copy it to app storage right now.';
        }
      }
      this.loading = false;
    },
    currentDocument(): VisionBoardDocument {
      return {
        version: 1,
        updatedAt: this.boardUpdatedAt,
        items: normalizeVisionBoardItems(this.items),
      };
    },
    async persistBoard(): Promise<VisionBoardPersistenceResult> {
      const previousTimestamp = Date.parse(this.boardUpdatedAt || '') || 0;
      this.boardUpdatedAt = new Date(Math.max(Date.now(), previousTimestamp + 1)).toISOString();
      this.items = normalizeVisionBoardItems(this.items);
      const boardDocument = this.currentDocument();
      const localSaved = this.writeLocalDocument(boardDocument);
      const serverSaved = await this.saveServerDocument(boardDocument);

      if (serverSaved) {
        this.syncWarning = '';
      } else if (localSaved) {
        this.syncWarning =
          'Saved in this browser, but FocusFrog could not copy it to app storage right now.';
      } else {
        this.syncWarning = 'FocusFrog could not save this change. Please try again.';
      }
      return { localSaved, serverSaved };
    },
    async uploadImage(file: File): Promise<VisionImageUpload> {
      const response = await fetch('/focusfrog-vision-images', {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null;
      if (!response.ok || !payload?.id) {
        throw new Error(payload?.error || 'FocusFrog could not store this photo.');
      }
      return payload as VisionImageUpload;
    },
    async deleteImage(imageId: string) {
      if (!imageId || typeof fetch === 'undefined') return;
      try {
        await fetch(visionImageUrl(imageId), { method: 'DELETE' });
      } catch (error) {
        console.warn('Could not remove an unused vision board image:', error);
      }
    },
    async saveItem() {
      const title = this.draft.title.trim();
      if (!title || this.saving || this.loading) return;

      if (
        !this.draft.useCounter &&
        (typeof this.draft.progress !== 'number' || !Number.isFinite(this.draft.progress))
      ) {
        this.formError = 'Choose a progress value between 0 and 100.';
        return;
      }
      if (
        this.draft.useCounter &&
        (!Number.isSafeInteger(this.draft.counterTarget) ||
          this.draft.counterTarget < 1 ||
          this.draft.counterTarget > VISION_COUNTER_MAX)
      ) {
        this.formError = `Choose a whole-number goal between 1 and ${VISION_COUNTER_MAX}.`;
        return;
      }
      if (
        this.draft.useCounter &&
        (!Number.isSafeInteger(this.draft.counterCurrent) ||
          this.draft.counterCurrent < 0 ||
          this.draft.counterCurrent > this.draft.counterTarget)
      ) {
        this.formError = 'Choose a whole-number amount done between 0 and your goal.';
        return;
      }
      if (this.draft.targetDate && !parseLocalDateKey(this.draft.targetDate)) {
        this.formError = 'Choose a valid target date.';
        return;
      }
      const counterTarget = this.draft.useCounter ? this.draft.counterTarget : 0;
      const counterCurrent = this.draft.useCounter ? this.draft.counterCurrent : 0;
      const counterUnit = this.draft.useCounter
        ? this.draft.counterUnit.trim().replace(/\s+/g, ' ').slice(0, 24)
        : '';
      const normalizedProgress = counterTarget
        ? visionBoardCounterProgress(counterCurrent, counterTarget)
        : Math.min(100, Math.max(0, Math.round(this.draft.progress)));

      this.saving = true;
      this.formError = '';
      const existing = this.items.find((item: VisionBoardItem) => item.id === this.editingId);
      const previousItems = this.items;
      const previousUpdatedAt = this.boardUpdatedAt;
      const oldImageId = existing?.imageId || '';
      let nextImageId = this.removeExistingImage ? '' : this.draft.imageId;
      let uploadedImageId = '';

      try {
        if (this.pendingImage) {
          const upload = await this.uploadImage(this.pendingImage);
          nextImageId = upload.id;
          uploadedImageId = upload.id;
        }

        const now = new Date().toISOString();
        const nextItem: VisionBoardItem = {
          id: existing?.id || makeItemId(),
          title: title.slice(0, 120),
          notes: this.draft.notes.trim().slice(0, 800),
          nextAction: existing?.nextAction || '',
          targetDate: this.draft.targetDate,
          progress: normalizedProgress,
          counterCurrent,
          counterTarget,
          counterUnit,
          lastCheckInAt: existing?.lastCheckInAt || '',
          imageId: nextImageId,
          status: existing?.status || 'dreaming',
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          achievedAt: existing?.achievedAt || '',
        };
        this.items = existing
          ? this.items.map((item: VisionBoardItem) => (item.id === existing.id ? nextItem : item))
          : [nextItem, ...this.items];

        const persistence = await this.persistBoard();
        if (!persistence.localSaved && !persistence.serverSaved) {
          throw new Error('FocusFrog could not save this dream.');
        }
        if (
          persistence.serverSaved &&
          oldImageId &&
          oldImageId !== nextImageId &&
          !this.items.some((item: VisionBoardItem) => item.imageId === oldImageId)
        ) {
          await this.deleteImage(oldImageId);
        }
        this.closeEditor();
      } catch (error) {
        this.items = previousItems;
        this.boardUpdatedAt = previousUpdatedAt;
        if (uploadedImageId) await this.deleteImage(uploadedImageId);
        this.formError = error instanceof Error ? error.message : 'Could not save this dream.';
        this.saving = false;
      }
    },
    async toggleAchieved(item: VisionBoardItem) {
      if (this.saving || this.loading) return;
      const current = this.items.find((candidate: VisionBoardItem) => candidate.id === item.id);
      if (!current) return;
      this.saving = true;
      this.checkInAnnouncement = '';
      const previousItems = this.items;
      const previousUpdatedAt = this.boardUpdatedAt;
      const now = new Date().toISOString();
      const achieved = current.status !== 'achieved';
      const leavesActiveFilter =
        (this.activeFilter === 'dreaming' && achieved) ||
        (this.activeFilter === 'achieved' && !achieved) ||
        (this.activeFilter === 'attention' && achieved);
      this.items = this.items.map((candidate: VisionBoardItem) =>
        candidate.id === current.id
          ? {
              ...candidate,
              status: achieved ? 'achieved' : 'dreaming',
              achievedAt: achieved ? now : '',
              progress: achieved
                ? 100
                : candidate.counterTarget
                ? visionBoardCounterProgress(candidate.counterCurrent, candidate.counterTarget)
                : Math.min(candidate.progress, 95),
              updatedAt: now,
            }
          : candidate
      );
      if (leavesActiveFilter) this.$nextTick(() => this.focusFilter(this.activeFilter));

      try {
        const persistence = await this.persistBoard();
        if (!persistence.localSaved && !persistence.serverSaved) {
          this.items = previousItems;
          this.boardUpdatedAt = previousUpdatedAt;
          this.checkInAnnouncement = `Could not update ${current.title}.`;
        } else {
          this.checkInAnnouncement = achieved
            ? `Marked ${current.title} as done.`
            : `Marked ${current.title} as not done.`;
        }
      } catch (error) {
        this.items = previousItems;
        this.boardUpdatedAt = previousUpdatedAt;
        this.syncWarning = 'FocusFrog could not update this goal. Please try again.';
        this.checkInAnnouncement = `Could not update ${current.title}.`;
      } finally {
        this.saving = false;
      }
    },
    async incrementCounter(item: VisionBoardItem) {
      if (this.saving || this.loading) return;
      const initialItem = this.items.find((candidate: VisionBoardItem) => candidate.id === item.id);
      if (
        !initialItem ||
        initialItem.status === 'achieved' ||
        initialItem.counterTarget < 1 ||
        initialItem.counterCurrent >= initialItem.counterTarget
      ) {
        return;
      }

      this.saving = true;
      this.checkInAnnouncement = '';
      const runIncrement = async () => {
        if (
          typeof this.readLocalDocument === 'function' &&
          typeof this.loadServerDocument === 'function'
        ) {
          const localDocument = this.readLocalDocument();
          const serverDocument = await this.loadServerDocument();
          const freshestDocument = chooseNewestVisionBoardDocument(localDocument, serverDocument);
          const freshestScore = Date.parse(freshestDocument.updatedAt || '') || 0;
          const localScore = Date.parse(this.boardUpdatedAt || '') || 0;
          if (freshestScore > localScore) {
            this.items = freshestDocument.items;
            this.boardUpdatedAt = freshestDocument.updatedAt;
            this.writeLocalDocument(freshestDocument);
          }
        } else if (typeof this.loadServerDocument === 'function') {
          const serverDocument = await this.loadServerDocument();
          const serverScore = Date.parse(serverDocument?.updatedAt || '') || 0;
          const localScore = Date.parse(this.boardUpdatedAt || '') || 0;
          if (serverDocument && serverScore > localScore) {
            this.items = serverDocument.items;
            this.boardUpdatedAt = serverDocument.updatedAt;
            if (typeof this.writeLocalDocument === 'function') {
              this.writeLocalDocument(serverDocument);
            }
          }
        }

        const current = this.items.find((candidate: VisionBoardItem) => candidate.id === item.id);
        if (
          !current ||
          current.status === 'achieved' ||
          current.counterTarget < 1 ||
          current.counterCurrent >= current.counterTarget
        ) {
          return;
        }

        const previousItems = this.items;
        const previousUpdatedAt = this.boardUpdatedAt;
        const now = new Date().toISOString();
        const counterCurrent = Math.min(current.counterTarget, current.counterCurrent + 1);
        const countedItem: VisionBoardItem = {
          ...current,
          counterCurrent,
          progress: visionBoardCounterProgress(counterCurrent, current.counterTarget),
          lastCheckInAt: now,
          updatedAt: now,
        };
        const leavesReview =
          this.activeFilter === 'attention' && !visionBoardItemNeedsAttention(countedItem);
        const unit = current.counterUnit ? ` ${current.counterUnit}` : '';
        const progressLabel = `${counterCurrent} of ${current.counterTarget}${unit}`;

        this.items = this.items.map((candidate: VisionBoardItem) =>
          candidate.id === current.id ? countedItem : candidate
        );
        if (leavesReview) this.$nextTick(() => this.focusReviewFilter());

        try {
          const persistence = await this.persistBoard();
          if (!persistence.localSaved && !persistence.serverSaved) {
            this.items = previousItems;
            this.boardUpdatedAt = previousUpdatedAt;
            this.checkInAnnouncement = `Could not update the counter for ${current.title}.`;
          } else {
            this.checkInAnnouncement = `${progressLabel} for ${current.title}.`;
          }
        } catch (error) {
          this.items = previousItems;
          this.boardUpdatedAt = previousUpdatedAt;
          throw error;
        }
      };

      try {
        const lockManager =
          typeof navigator === 'undefined'
            ? undefined
            : (navigator as Navigator & { locks?: VisionLockManager }).locks;
        if (lockManager) {
          await lockManager.request('focusfrog-vision-board', runIncrement);
        } else {
          await runIncrement();
        }
      } catch (error) {
        this.syncWarning = 'FocusFrog could not update this counter. Please try again.';
        this.checkInAnnouncement = `Could not update the counter for ${initialItem.title}.`;
      } finally {
        this.saving = false;
      }
    },
    async checkInItem(item: VisionBoardItem) {
      if (this.saving || this.loading) return;
      const current = this.items.find((candidate: VisionBoardItem) => candidate.id === item.id);
      if (!current || current.status === 'achieved') return;

      const previousItems = this.items;
      const previousUpdatedAt = this.boardUpdatedAt;
      const now = new Date().toISOString();
      const checkedInItem = { ...current, lastCheckInAt: now, updatedAt: now };
      const leavesReview =
        this.activeFilter === 'attention' && !visionBoardItemNeedsAttention(checkedInItem);
      this.saving = true;
      this.checkInAnnouncement = '';
      this.items = this.items.map((candidate: VisionBoardItem) =>
        candidate.id === current.id ? checkedInItem : candidate
      );
      if (leavesReview) this.$nextTick(() => this.focusReviewFilter());

      try {
        const persistence = await this.persistBoard();
        if (!persistence.localSaved && !persistence.serverSaved) {
          this.items = previousItems;
          this.boardUpdatedAt = previousUpdatedAt;
          this.checkInAnnouncement = `Could not save the check-in for ${current.title}.`;
        } else {
          this.checkInAnnouncement = `Checked in on ${current.title}.`;
        }
      } catch (error) {
        this.items = previousItems;
        this.boardUpdatedAt = previousUpdatedAt;
        this.syncWarning = 'FocusFrog could not save this check-in. Please try again.';
        this.checkInAnnouncement = `Could not save the check-in for ${current.title}.`;
      } finally {
        this.saving = false;
      }
    },
    async deleteItem(item: VisionBoardItem) {
      if (this.saving || this.loading) return;
      if (!window.confirm(`Remove “${item.title}” from your vision board?`)) return;
      this.saving = true;
      const previousItems = this.items;
      const previousUpdatedAt = this.boardUpdatedAt;
      this.items = this.items.filter((candidate: VisionBoardItem) => candidate.id !== item.id);
      const persistence = await this.persistBoard();
      if (!persistence.localSaved && !persistence.serverSaved) {
        this.items = previousItems;
        this.boardUpdatedAt = previousUpdatedAt;
        this.saving = false;
        return;
      }
      if (
        persistence.serverSaved &&
        item.imageId &&
        !this.items.some((candidate: VisionBoardItem) => candidate.imageId === item.imageId)
      ) {
        await this.deleteImage(item.imageId);
      }
      this.saving = false;
    },
    async deleteEditingItem() {
      if (this.saving || this.loading) return;
      const item = this.items.find((candidate: VisionBoardItem) => candidate.id === this.editingId);
      if (!item) return;
      if (!window.confirm(`Remove “${item.title}” from your vision board?`)) return;
      const previousItems = this.items;
      const previousUpdatedAt = this.boardUpdatedAt;
      this.saving = true;
      this.items = this.items.filter((candidate: VisionBoardItem) => candidate.id !== item.id);
      const persistence = await this.persistBoard();
      if (!persistence.localSaved && !persistence.serverSaved) {
        this.items = previousItems;
        this.boardUpdatedAt = previousUpdatedAt;
        this.formError = 'FocusFrog could not delete this dream. Please try again.';
        this.saving = false;
        return;
      }
      if (
        persistence.serverSaved &&
        item.imageId &&
        !this.items.some((candidate: VisionBoardItem) => candidate.imageId === item.imageId)
      ) {
        await this.deleteImage(item.imageId);
      }
      this.closeEditor();
    },
  },
};
</script>

<style lang="scss">
.vision-board-page {
  --vision-ink: #12233b;
  --vision-muted: #64748b;
  --vision-line: rgba(100, 116, 139, 0.28);
  --vision-surface: rgba(255, 255, 255, 0.82);
  --vision-focus: #059669;

  width: 100%;
  min-height: 34rem;
  color: var(--vision-ink);
}

.vision-board-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: clamp(1.15rem, 2.8vw, 2rem);
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 22px;
  background: radial-gradient(circle at 88% 12%, rgba(253, 224, 71, 0.3), transparent 13rem),
    radial-gradient(circle at 6% 110%, rgba(236, 72, 153, 0.18), transparent 17rem),
    linear-gradient(
      135deg,
      rgba(236, 253, 245, 0.96),
      rgba(239, 246, 255, 0.94) 52%,
      rgba(255, 247, 237, 0.94)
    );
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.vision-board-header::after {
  position: absolute;
  top: -2rem;
  right: 23%;
  width: 7rem;
  height: 7rem;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 45% 55% 62% 38%;
  background: rgba(255, 255, 255, 0.18);
  content: '';
  transform: rotate(22deg);
}

.vision-board-heading,
.vision-board-header-actions {
  position: relative;
  z-index: 1;
}

.vision-board-heading h3 {
  color: #12233b !important;
  font-size: clamp(1.6rem, 3vw, 2.35rem);
  font-weight: 850;
  letter-spacing: -0.035em;
}

.vision-board-heading p {
  max-width: 42rem;
  color: #526277 !important;
  font-size: 0.98rem;
}

.vision-board-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  margin-bottom: 0.4rem;
  color: #047857 !important;
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.vision-board-kicker .fa-icon {
  width: 0.85rem;
  fill: #059669 !important;
}

.vision-board-header-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.vision-board-progress {
  display: flex;
  flex-direction: column;
  min-width: 7.2rem;
  padding: 0.68rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
  color: #526277 !important;
  font-size: 0.7rem;
  font-weight: 750;
  line-height: 1.1;
  text-align: center;
  backdrop-filter: blur(12px);
}

.vision-board-progress-number {
  color: #12233b !important;
  font-size: 1.35rem;
  font-weight: 900;
}

.vision-board-progress-divider {
  display: none;
}

.vision-board-attention-count {
  align-self: center;
  margin-top: 0.42rem;
  padding: 0.25rem 0.52rem;
  border: 1px solid rgba(180, 83, 9, 0.2);
  border-radius: 999px;
  background: rgba(255, 247, 237, 0.84);
  color: #9a3412 !important;
  font-size: 0.65rem;
  font-weight: 850;
  line-height: 1;
}

.vision-add-button {
  min-height: 2.75rem;
  padding-right: 1.05rem;
  padding-left: 1.05rem;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #059669, #0d9488) !important;
  box-shadow: 0 10px 22px rgba(5, 150, 105, 0.24);
  font-weight: 800;
}

.vision-sync-warning {
  margin: 1rem 0 0;
}

.vision-board-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.15rem;
}

.vision-filter-list {
  display: inline-flex;
  gap: 0.32rem;
  padding: 0.28rem;
  border: 1px solid var(--vision-line);
  border-radius: 999px;
  background: var(--vision-surface);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
}

.vision-filter {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 2.15rem;
  padding: 0.35rem 0.72rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #64748b !important;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
}

.vision-filter:hover,
.vision-filter:focus-visible {
  background: rgba(16, 185, 129, 0.1);
  color: #047857 !important;
}

.vision-filter--active {
  background: #12233b !important;
  color: #ffffff !important;
}

.vision-filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  color: inherit !important;
  font-size: 0.66rem;
}

.vision-filter--active .vision-filter-count {
  background: rgba(255, 255, 255, 0.18);
}

.vision-board-hint {
  color: var(--vision-muted) !important;
  font-size: 0.78rem;
}

.vision-board-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.vision-sort-control {
  display: inline-flex;
  align-items: center;
  gap: 0.48rem;
  margin: 0;
  color: var(--vision-muted) !important;
  font-size: 0.75rem;
  font-weight: 800;
  white-space: nowrap;
}

.vision-sort-control span {
  color: inherit !important;
}

.vision-sort-select {
  min-width: 9.4rem;
  min-height: 2.25rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--vision-line);
  border-radius: 0.7rem;
  background: var(--vision-surface);
  color: var(--vision-ink) !important;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

.vision-sort-select:focus-visible {
  outline: 3px solid var(--vision-focus);
  outline-offset: 2px;
}

.vision-sort-select:disabled {
  cursor: wait;
  opacity: 0.62;
}

.vision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
  gap: 1rem;
  margin-top: 1.15rem;
}

.vision-card {
  position: relative;
  min-height: 23rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 22px;
  background: linear-gradient(145deg, #134e4a, #10b981 52%, #a7f3d0);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.15);
  isolation: isolate;
  overflow: hidden;
  transform: translateZ(0);
  transition: box-shadow 180ms ease, transform 180ms ease;
}

.vision-card:hover {
  box-shadow: 0 22px 42px rgba(15, 23, 42, 0.21);
  transform: translateY(-3px);
}

.vision-card--attention {
  box-shadow: inset 0 0 0 2px rgba(251, 191, 36, 0.72), 0 16px 34px rgba(15, 23, 42, 0.15);
}

.vision-card--attention:hover {
  box-shadow: inset 0 0 0 2px rgba(251, 191, 36, 0.84), 0 22px 42px rgba(15, 23, 42, 0.21);
}

.vision-card--palette-1 {
  background: linear-gradient(145deg, #7c2d12, #f97316 50%, #fed7aa);
}

.vision-card--palette-2 {
  background: linear-gradient(145deg, #3730a3, #8b5cf6 52%, #ddd6fe);
}

.vision-card--palette-3 {
  background: linear-gradient(145deg, #9d174d, #ec4899 50%, #fbcfe8);
}

.vision-card--palette-4 {
  background: linear-gradient(145deg, #164e63, #06b6d4 50%, #cffafe);
}

.vision-card-image {
  position: absolute;
  z-index: -2;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 220ms ease, transform 420ms ease;
}

.vision-card:hover .vision-card-image {
  transform: scale(1.025);
}

.vision-card-scrim {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(7, 15, 31, 0.28),
    rgba(7, 15, 31, 0.05) 38%,
    rgba(7, 15, 31, 0.88)
  );
}

.vision-card:not(.vision-card--photo) .vision-card-scrim {
  background: radial-gradient(circle at 80% 16%, rgba(255, 255, 255, 0.3), transparent 8rem),
    linear-gradient(180deg, rgba(7, 15, 31, 0.02), rgba(7, 15, 31, 0.72));
}

.vision-card--achieved .vision-card-image {
  filter: saturate(0.76) brightness(0.9);
}

.vision-card--achieved::after {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: linear-gradient(145deg, rgba(5, 150, 105, 0.22), transparent 52%);
  content: '';
  pointer-events: none;
}

.vision-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0.9rem;
}

.vision-card-controls {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
}

.vision-complete-control,
.vision-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(15, 23, 42, 0.36);
  color: #ffffff !important;
  box-shadow: 0 7px 18px rgba(15, 23, 42, 0.12);
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.vision-complete-control {
  gap: 0.42rem;
  min-height: 2.75rem;
  margin: 0;
  padding: 0.4rem 0.68rem;
  border-radius: 0.65rem;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.03em;
  touch-action: manipulation;
}

.vision-complete-control--checked {
  border-color: rgba(167, 243, 208, 0.72);
  background: rgba(4, 120, 87, 0.72);
}

.vision-complete-checkbox {
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
  margin: 0;
  accent-color: #10b981;
  cursor: pointer;
}

.vision-complete-label {
  color: #ffffff !important;
  cursor: pointer;
}

.vision-icon-button .fa-icon {
  width: 0.75rem;
  fill: #ffffff !important;
}

.vision-card-actions {
  display: flex;
  gap: 0.35rem;
  opacity: 0;
  transition: opacity 140ms ease;
}

.vision-card:hover .vision-card-actions,
.vision-card:focus-within .vision-card-actions {
  opacity: 1;
}

.vision-icon-button {
  appearance: none;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 50%;
}

.vision-icon-button.vision-drag-handle {
  width: 2.75rem;
  height: 2.75rem;
  flex: 0 0 2.75rem;
  border-radius: 0.7rem;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.vision-icon-button.vision-drag-handle:active:not(:disabled) {
  cursor: grabbing;
}

.vision-icon-button.vision-drag-handle:disabled {
  cursor: not-allowed;
}

.vision-drag-grip {
  width: 1rem;
  height: 1rem;
  background-image: radial-gradient(circle, currentColor 0 1.5px, transparent 1.7px);
  background-position: 0 0;
  background-size: 0.5rem 0.5rem;
  color: #ffffff !important;
  opacity: 0.92;
}

.vision-card--drag-ghost {
  outline: 2px dashed rgba(254, 243, 199, 0.96);
  outline-offset: -4px;
  opacity: 0.3;
}

.vision-card--drag-chosen {
  z-index: 4;
  box-shadow: 0 26px 52px rgba(15, 23, 42, 0.3);
}

.vision-card--dragging {
  cursor: grabbing;
  opacity: 0.9;
}

.vision-grid--dragging .vision-card:hover {
  transform: none;
}

.vision-grid--dragging .vision-card:hover .vision-card-image {
  transform: none;
}

.vision-icon-button:hover,
.vision-icon-button:focus-visible,
.vision-complete-control:hover,
.vision-complete-control:focus-within {
  border-color: rgba(255, 255, 255, 0.78);
  background: rgba(15, 23, 42, 0.68);
}

.vision-icon-button--danger:hover,
.vision-icon-button--danger:focus-visible {
  background: rgba(190, 24, 93, 0.8);
}

.vision-complete-control--disabled,
.vision-icon-button:disabled,
.vision-starter-prompts button:disabled,
.vision-remove-image:disabled {
  cursor: wait;
  opacity: 0.62;
}

.vision-complete-control--disabled .vision-complete-checkbox,
.vision-complete-control--disabled .vision-complete-label {
  cursor: wait;
}

.vision-card-copy {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 1.05rem 1.1rem 1.2rem;
}

.vision-card-copy h4,
.vision-card-copy p,
.vision-card-date,
.vision-card-placeholder {
  color: #ffffff !important;
}

.vision-card-copy h4 {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: clamp(1.25rem, 2.3vw, 1.65rem);
  font-weight: 880;
  letter-spacing: -0.025em;
  line-height: 1.08;
  text-shadow: 0 2px 12px rgba(15, 23, 42, 0.5);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.vision-card-copy p {
  display: -webkit-box;
  margin: 0.48rem 0 0;
  overflow: hidden;
  font-size: 0.84rem;
  line-height: 1.38;
  opacity: 0.88;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.vision-card-date {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.vision-card-placeholder {
  font-style: italic;
  opacity: 0.68 !important;
}

.vision-card-accountability {
  margin-top: 0.72rem;
  padding-top: 0.62rem;
  border-top: 1px solid rgba(255, 255, 255, 0.26);
  color: #ffffff;
  text-shadow: 0 1px 8px rgba(15, 23, 42, 0.35);
}

.vision-accountability-meta,
.vision-card-progress-copy,
.vision-check-in-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
}

.vision-accountability-meta {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.vision-accountability-state,
.vision-target-date {
  display: inline-flex;
  align-items: center;
  min-height: 1.4rem;
  padding: 0.22rem 0.48rem;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  color: #ffffff !important;
  font-size: 0.62rem;
  font-weight: 850;
  line-height: 1;
  letter-spacing: 0.025em;
  backdrop-filter: blur(8px);
}

.vision-accountability-state--achieved,
.vision-accountability-state--ready,
.vision-accountability-state--progress,
.vision-accountability-state--on-track {
  background: rgba(4, 120, 87, 0.86);
}

.vision-accountability-state--start {
  background: rgba(15, 23, 42, 0.72);
}

.vision-accountability-state--overdue {
  background: rgba(159, 18, 57, 0.9);
}

.vision-accountability-state--plan {
  background: rgba(146, 64, 14, 0.9);
}

.vision-accountability-state--due {
  background: rgba(180, 83, 9, 0.9);
}

.vision-accountability-state--check-in {
  background: rgba(67, 56, 202, 0.88);
}

.vision-target-date {
  background: rgba(15, 23, 42, 0.6);
}

.vision-next-action {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.45rem;
  margin-top: 0.48rem;
  color: #ffffff !important;
  font-size: 0.76rem;
  line-height: 1.3;
}

.vision-next-action > span:last-child {
  display: -webkit-box;
  overflow: hidden;
  color: #ffffff !important;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.vision-next-action-label {
  color: rgba(255, 255, 255, 0.72) !important;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.09em;
  line-height: 1.65;
  text-transform: uppercase;
}

.vision-add-next-action {
  appearance: none;
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  margin-top: 0.42rem;
  padding: 0.28rem 0.55rem;
  border: 1px dashed rgba(255, 255, 255, 0.48);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.32);
  color: #ffffff !important;
  font-size: 0.68rem;
  font-weight: 780;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.vision-add-next-action:hover {
  border-style: solid;
  background: rgba(15, 23, 42, 0.58);
}

.vision-card-progress-copy {
  margin-top: 0.48rem;
  color: rgba(255, 255, 255, 0.78) !important;
  font-size: 0.64rem;
}

.vision-card-progress-copy span,
.vision-card-progress-copy strong {
  color: inherit !important;
}

.vision-card-progress-copy strong {
  color: #ffffff !important;
  font-size: 0.68rem;
}

.vision-card-progress-copy--counter {
  align-items: center;
  flex-wrap: wrap;
}

.vision-counter-summary {
  min-width: 0;
  overflow: hidden;
  color: #ffffff !important;
  font-size: 0.72rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vision-counter-increment {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.7rem;
  padding: 0.24rem 0.58rem;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 999px;
  background: rgba(5, 150, 105, 0.84);
  color: #ffffff !important;
  font-size: 0.66rem;
  font-weight: 900;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.vision-counter-increment .fa-icon {
  width: 0.68rem;
  margin-right: 0.28rem;
  fill: #ffffff !important;
}

.vision-counter-increment:hover:not([aria-disabled='true']) {
  border-color: rgba(255, 255, 255, 0.82);
  background: rgba(4, 120, 87, 0.96);
}

.vision-counter-increment[aria-disabled='true'],
.vision-counter-complete {
  background: rgba(15, 23, 42, 0.48);
  color: rgba(255, 255, 255, 0.78) !important;
  cursor: default;
}

.vision-counter-complete {
  padding: 0.2rem 0;
  font-size: 0.64rem;
  font-weight: 850;
}

.vision-card-progress-track {
  height: 0.36rem;
  margin-top: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.36);
  overflow: hidden;
}

.vision-card-progress-track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #34d399, #a7f3d0);
  box-shadow: 0 0 12px rgba(52, 211, 153, 0.4);
  transition: width 220ms ease;
}

.vision-check-in-row {
  min-height: 1.75rem;
  margin-top: 0.38rem;
  color: rgba(255, 255, 255, 0.7) !important;
  font-size: 0.63rem;
}

.vision-check-in-row > span {
  color: inherit !important;
}

.vision-check-in-row button {
  appearance: none;
  min-height: 1.65rem;
  padding: 0.24rem 0.58rem;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.13);
  color: #ffffff !important;
  font-size: 0.64rem;
  font-weight: 850;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.vision-check-in-row button:hover {
  border-color: rgba(255, 255, 255, 0.76);
  background: rgba(255, 255, 255, 0.23);
}

.vision-card--achieved .vision-card-accountability {
  opacity: 0.88;
}

.vision-add-next-action:disabled,
.vision-check-in-row button:disabled,
.vision-counter-increment:disabled {
  cursor: wait;
  opacity: 0.62;
}

.vision-empty,
.vision-no-results {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(1.5rem, 5vw, 4rem);
  min-height: 28rem;
  margin-top: 1.15rem;
  padding: 2rem;
  border: 1px dashed rgba(16, 185, 129, 0.34);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(236, 253, 245, 0.54));
  text-align: left;
}

.vision-empty-copy {
  max-width: 31rem;
}

.vision-empty-copy h4,
.vision-no-results h4 {
  color: var(--vision-ink) !important;
  font-size: clamp(1.35rem, 3vw, 1.9rem);
  font-weight: 850;
  letter-spacing: -0.025em;
}

.vision-empty-copy p,
.vision-no-results p {
  color: var(--vision-muted) !important;
}

.vision-empty-collage {
  position: relative;
  width: min(40vw, 17rem);
  height: 17rem;
  flex: 0 0 auto;
}

.vision-empty-card {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 9rem;
  height: 12rem;
  border: 5px solid rgba(255, 255, 255, 0.8);
  border-radius: 18px;
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.16);
}

.vision-empty-card .fa-icon {
  width: 2rem;
  fill: rgba(255, 255, 255, 0.86) !important;
}

.vision-empty-card--one {
  top: 1.2rem;
  left: 0.2rem;
  background: linear-gradient(145deg, #0f766e, #5eead4);
  transform: rotate(-9deg);
}

.vision-empty-card--two {
  top: 0;
  left: 4.3rem;
  z-index: 2;
  background: linear-gradient(145deg, #be185d, #f9a8d4);
  transform: rotate(3deg);
}

.vision-empty-card--three {
  top: 2rem;
  right: 0;
  background: linear-gradient(145deg, #7c3aed, #c4b5fd);
  transform: rotate(11deg);
}

.vision-starter-prompts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.38rem;
  margin-top: 1rem;
  color: var(--vision-muted) !important;
  font-size: 0.72rem;
}

.vision-starter-prompts button {
  padding: 0.2rem 0.48rem;
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
  color: #047857 !important;
  font-size: 0.7rem;
  font-weight: 750;
  cursor: pointer;
}

.vision-no-results {
  flex-direction: column;
  gap: 0.45rem;
  text-align: center;
}

.vision-no-results .fa-icon {
  width: 2rem;
  margin-bottom: 0.35rem;
  fill: #ec4899 !important;
}

.vision-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.9fr);
  gap: 1.2rem;
}

.vision-character-count {
  display: block;
  margin-top: 0.22rem;
  color: #94a3b8 !important;
  text-align: right;
}

.vision-accountability-help {
  display: block;
  margin-top: 0.3rem;
  color: #64748b !important;
  font-size: 0.72rem;
  line-height: 1.35;
}

.vision-editor-accountability-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin-top: 0.15rem;
  padding: 0.82rem;
  border: 1px solid rgba(16, 185, 129, 0.18);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.52), rgba(239, 246, 255, 0.48));
}

.vision-editor-accountability-fields .form-group {
  min-width: 0;
  margin-bottom: 0;
}

.vision-target-date-field--wide,
.vision-counter-option,
.vision-counter-fields {
  grid-column: 1 / -1;
}

.vision-counter-option {
  min-width: 0;
  margin: 0;
  padding: 0.7rem 0 0;
  border: 0;
  border-top: 1px solid rgba(16, 185, 129, 0.18);
}

.vision-counter-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.vision-counter-toggle-row .custom-control {
  min-width: 0;
  margin: 0;
}

.vision-counter-toggle-row .custom-control-label {
  margin-bottom: 0;
  cursor: pointer;
}

.vision-counter-preview {
  flex: 0 0 auto;
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  background: rgba(5, 150, 105, 0.12);
  color: #047857 !important;
  font-size: 0.7rem;
  font-weight: 900;
}

.vision-counter-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.vision-counter-unit-field {
  grid-column: 1 / -1;
}

.vision-editor-accountability-fields label {
  width: 100%;
  margin-bottom: 0.42rem;
  color: #334155 !important;
  font-size: 0.78rem;
  font-weight: 800;
}

.vision-editor-accountability-fields label > span:first-child {
  display: inline-block;
}

.vision-progress-value {
  float: right;
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  background: rgba(5, 150, 105, 0.12);
  color: #047857 !important;
  font-size: 0.7rem;
  font-weight: 900;
}

#vision-target-date {
  min-width: 0;
}

#vision-progress {
  height: 1.5rem;
  margin-top: 0.12rem;
  accent-color: #059669;
  cursor: pointer;
}

#vision-progress:disabled {
  cursor: wait;
}

.vision-image-picker {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 18rem;
  margin: 0;
  border: 2px dashed rgba(16, 185, 129, 0.38);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(236, 253, 245, 0.78), rgba(239, 246, 255, 0.74));
  cursor: pointer;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.vision-image-picker:hover,
.vision-image-picker:focus-within {
  border-color: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
}

.vision-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.vision-image-picker > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vision-image-picker-copy {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.2rem;
  color: #526277 !important;
  text-align: center;
}

.vision-image-picker-copy strong {
  color: #12233b !important;
}

.vision-image-picker-copy span,
.vision-image-picker-copy small {
  color: #64748b !important;
}

.vision-image-picker-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  margin-bottom: 0.25rem;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.14);
}

.vision-image-picker-icon .fa-icon {
  width: 1.25rem;
  fill: #059669 !important;
}

.vision-image-change {
  position: absolute;
  right: 0.65rem;
  bottom: 0.65rem;
  display: inline-flex;
  align-items: center;
  padding: 0.38rem 0.62rem;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.68);
  color: #ffffff !important;
  font-size: 0.68rem;
  font-weight: 800;
  backdrop-filter: blur(8px);
}

.vision-image-change span {
  color: #ffffff !important;
}

.vision-image-change .fa-icon {
  fill: #ffffff !important;
}

.vision-remove-image {
  display: block;
  margin: 0.45rem auto 0;
  padding: 0.2rem 0.4rem;
  border: 0;
  background: transparent;
  color: #be185d !important;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
}

.vision-filter:focus-visible,
.vision-starter-prompts button:focus-visible,
.vision-remove-image:focus-visible,
#vision-progress:focus-visible,
#vision-counter-current:focus-visible,
#vision-counter-target:focus-visible,
#vision-counter-unit:focus-visible {
  outline: 3px solid var(--vision-focus);
  outline-offset: 2px;
}

.vision-complete-control:focus-within,
.vision-icon-button:focus-visible,
.vision-add-next-action:focus-visible,
.vision-check-in-row button:focus-visible,
.vision-counter-increment:focus-visible {
  outline: 3px solid #fef3c7;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(15, 23, 42, 0.48);
}

.vision-editor-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 1.2rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
}

.vision-editor-action-spacer {
  flex: 1 1 auto;
}

html[data-dashboard-theme='flower'] .aw-container:has(.vision-board-page) {
  background: rgba(255, 252, 248, 0.38) !important;
  backdrop-filter: blur(9px) saturate(0.94);
}

html[data-dashboard-theme='flower'] .vision-empty,
html[data-dashboard-theme='flower'] .vision-filter-list {
  background: rgba(255, 253, 245, 0.82);
}

html[data-dashboard-theme='flower'] .vision-card .vision-complete-control,
html[data-dashboard-theme='flower'] .vision-card .vision-complete-label,
html[data-dashboard-theme='flower'] .vision-card .vision-icon-button,
html[data-dashboard-theme='flower'] .vision-card .vision-card-date,
html[data-dashboard-theme='flower'] .vision-card .vision-card-copy h4,
html[data-dashboard-theme='flower'] .vision-card .vision-card-copy p,
html[data-dashboard-theme='flower'] .vision-card .vision-accountability-state,
html[data-dashboard-theme='flower'] .vision-card .vision-target-date,
html[data-dashboard-theme='flower'] .vision-card .vision-next-action,
html[data-dashboard-theme='flower'] .vision-card .vision-next-action span,
html[data-dashboard-theme='flower'] .vision-card .vision-card-progress-copy,
html[data-dashboard-theme='flower'] .vision-card .vision-card-progress-copy span,
html[data-dashboard-theme='flower'] .vision-card .vision-card-progress-copy strong,
html[data-dashboard-theme='flower'] .vision-card .vision-counter-increment,
html[data-dashboard-theme='flower'] .vision-card .vision-counter-increment span,
html[data-dashboard-theme='flower'] .vision-card .vision-counter-complete,
html[data-dashboard-theme='flower'] .vision-card .vision-check-in-row,
html[data-dashboard-theme='flower'] .vision-card .vision-check-in-row span,
html[data-dashboard-theme='flower'] .vision-card .vision-check-in-row button,
html[data-dashboard-theme='flower'] .vision-card .vision-add-next-action {
  color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .vision-editor-accountability-fields {
  border-color: rgba(190, 24, 93, 0.18);
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.74), rgba(253, 242, 248, 0.7));
}

html[data-dashboard-theme='flower'] .vision-accountability-help {
  color: #7c5a65 !important;
}

html[data-dashboard-theme='flower'] .vision-progress-value {
  background: rgba(190, 24, 93, 0.1);
  color: #9d174d !important;
}

html[data-dashboard-theme='flower'] .vision-counter-preview {
  background: rgba(190, 24, 93, 0.1);
  color: #9d174d !important;
}

html[data-dashboard-theme='flower'] .vision-filter--active,
html[data-dashboard-theme='flower'] .vision-filter--active span {
  color: #ffffff !important;
}

html[data-dashboard-theme='flower'] .vision-sort-control,
html[data-dashboard-theme='flower'] .vision-sort-control span {
  color: #7c5a65 !important;
}

html[data-dashboard-theme='flower'] body .vision-image-change span {
  color: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .vision-board-page {
  --vision-ink: #f8fafc;
  --vision-muted: #cbd5e1;
  --vision-line: rgba(148, 163, 184, 0.42);
  --vision-surface: rgba(15, 23, 42, 0.78);
  --vision-focus: #fbbf24;
}

html[data-dashboard-theme='contrast'] .vision-board-header {
  border-color: rgba(52, 211, 153, 0.38);
  background: radial-gradient(circle at 85% 15%, rgba(236, 72, 153, 0.2), transparent 12rem),
    linear-gradient(135deg, rgba(6, 78, 59, 0.86), rgba(30, 41, 59, 0.95));
}

html[data-dashboard-theme='contrast'] .vision-board-heading h3,
html[data-dashboard-theme='contrast'] .vision-board-heading p,
html[data-dashboard-theme='contrast'] .vision-board-progress-number,
html[data-dashboard-theme='contrast'] .vision-board-progress,
html[data-dashboard-theme='contrast'] .vision-empty-copy h4,
html[data-dashboard-theme='contrast'] .vision-empty-copy p,
html[data-dashboard-theme='contrast'] .vision-no-results h4,
html[data-dashboard-theme='contrast'] .vision-no-results p {
  color: #f8fafc !important;
}

html[data-dashboard-theme='contrast'] .vision-board-kicker {
  color: #a7f3d0 !important;
}

html[data-dashboard-theme='contrast'] .vision-board-attention-count {
  border-color: rgba(251, 191, 36, 0.42);
  background: rgba(120, 53, 15, 0.56);
  color: #fef3c7 !important;
}

html[data-dashboard-theme='contrast'] .vision-empty,
html[data-dashboard-theme='contrast'] .vision-filter-list {
  border-color: rgba(148, 163, 184, 0.36);
  background: rgba(15, 23, 42, 0.76);
}

html[data-dashboard-theme='contrast'] .vision-filter {
  color: #cbd5e1 !important;
}

html[data-dashboard-theme='contrast'] .vision-sort-control,
html[data-dashboard-theme='contrast'] .vision-sort-control span {
  color: #e2e8f0 !important;
}

html[data-dashboard-theme='contrast'] .vision-sort-select {
  border-color: rgba(148, 163, 184, 0.52);
  background: #0f172a;
  color: #f8fafc !important;
  color-scheme: dark;
}

html[data-dashboard-theme='contrast'] .vision-image-picker {
  border-color: rgba(52, 211, 153, 0.46);
  background: linear-gradient(145deg, rgba(6, 78, 59, 0.58), rgba(30, 41, 59, 0.92));
}

html[data-dashboard-theme='contrast'] .vision-image-picker-copy strong,
html[data-dashboard-theme='contrast'] .vision-image-picker-copy span,
html[data-dashboard-theme='contrast'] .vision-image-picker-copy small {
  color: #f8fafc !important;
}

html[data-dashboard-theme='contrast'] .vision-editor-accountability-fields {
  border-color: rgba(52, 211, 153, 0.34);
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.42), rgba(15, 23, 42, 0.54));
}

html[data-dashboard-theme='contrast'] .vision-editor-accountability-fields label,
html[data-dashboard-theme='contrast'] .vision-accountability-help {
  color: #e2e8f0 !important;
}

html[data-dashboard-theme='contrast'] .vision-counter-option {
  border-top-color: rgba(52, 211, 153, 0.28);
}

html[data-dashboard-theme='contrast'] .vision-counter-preview {
  background: rgba(52, 211, 153, 0.18);
  color: #a7f3d0 !important;
}

html[data-dashboard-theme='contrast'] .vision-progress-value {
  background: rgba(52, 211, 153, 0.18);
  color: #a7f3d0 !important;
}

html[data-dashboard-theme='contrast'] #vision-target-date {
  color-scheme: dark;
}

html[data-dashboard-theme='contrast'] .vision-complete-control {
  border-color: #ffffff;
  background: rgba(2, 6, 23, 0.9);
}

html[data-dashboard-theme='contrast'] .vision-complete-checkbox {
  accent-color: #34d399;
}

html[data-dashboard-theme='contrast'] .vision-complete-control--checked {
  border-color: #34d399;
}

html[data-dashboard-theme='contrast'] .vision-card .vision-accountability-state,
html[data-dashboard-theme='contrast'] .vision-card .vision-target-date,
html[data-dashboard-theme='contrast'] .vision-card .vision-next-action,
html[data-dashboard-theme='contrast'] .vision-card .vision-next-action span,
html[data-dashboard-theme='contrast'] .vision-card .vision-card-progress-copy,
html[data-dashboard-theme='contrast'] .vision-card .vision-card-progress-copy span,
html[data-dashboard-theme='contrast'] .vision-card .vision-card-progress-copy strong,
html[data-dashboard-theme='contrast'] .vision-card .vision-counter-increment,
html[data-dashboard-theme='contrast'] .vision-card .vision-counter-increment span,
html[data-dashboard-theme='contrast'] .vision-card .vision-counter-complete,
html[data-dashboard-theme='contrast'] .vision-card .vision-check-in-row,
html[data-dashboard-theme='contrast'] .vision-card .vision-check-in-row span,
html[data-dashboard-theme='contrast'] .vision-card .vision-check-in-row button,
html[data-dashboard-theme='contrast'] .vision-card .vision-add-next-action {
  color: #ffffff !important;
}

html[data-dashboard-theme='contrast'] .vision-filter--active {
  background: #34d399 !important;
  color: #052e2b !important;
}

html[data-dashboard-theme='contrast'] .vision-filter--active span {
  color: #052e2b !important;
}

@media (max-width: 767.98px) {
  .vision-board-header,
  .vision-board-header-actions,
  .vision-board-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .vision-board-header-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
  }

  .vision-board-progress {
    justify-content: center;
  }

  .vision-board-toolbar-actions {
    align-self: stretch;
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .vision-board-hint {
    flex: 1 1 12rem;
  }

  .vision-sort-select {
    min-height: 2.75rem;
  }

  .vision-filter-list {
    align-self: flex-start;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }

  .vision-filter {
    flex: 0 0 auto;
  }

  .vision-empty {
    flex-direction: column;
    padding: 1.4rem;
    text-align: center;
  }

  .vision-empty-collage {
    width: 15rem;
    height: 14.5rem;
    transform: scale(0.88);
    transform-origin: bottom center;
  }

  .vision-starter-prompts {
    justify-content: center;
  }

  .vision-editor-layout {
    grid-template-columns: 1fr;
  }

  .vision-image-picker {
    min-height: 14rem;
  }
}

@media (max-width: 575.98px) {
  .vision-editor-accountability-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .vision-counter-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .vision-board-header-actions {
    grid-template-columns: 1fr;
  }

  .vision-filter-list {
    width: 100%;
  }

  .vision-filter {
    flex: 0 0 auto;
    justify-content: center;
  }

  .vision-sort-control {
    width: 100%;
    justify-content: space-between;
  }

  .vision-sort-select {
    min-width: 0;
    width: min(12rem, 68%);
  }

  .vision-card {
    min-height: 22rem;
  }

  .vision-card-copy {
    padding-right: 0.9rem;
    padding-left: 0.9rem;
  }

  .vision-accountability-meta {
    gap: 0.35rem;
  }

  .vision-check-in-row {
    align-items: flex-start;
  }

  .vision-card-progress-copy--counter {
    align-items: flex-start;
  }

  .vision-editor-actions {
    flex-wrap: wrap;
  }

  .vision-editor-action-spacer {
    display: none;
  }

  .vision-editor-actions .btn {
    flex: 1 1 auto;
  }
}

@media (hover: none) {
  .vision-card-actions {
    opacity: 1;
  }

  .vision-card--counter {
    min-height: 26rem;
  }

  .vision-add-next-action,
  .vision-check-in-row button,
  .vision-counter-increment {
    min-height: 2.75rem;
  }
}

@media (max-width: 359.98px) {
  .vision-counter-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .vision-counter-unit-field {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vision-card,
  .vision-card-image,
  .vision-card-actions,
  .vision-drag-handle,
  .vision-complete-control,
  .vision-card-progress-track > span,
  .vision-image-picker,
  .vision-sort-select {
    transition: none;
  }
}
</style>
