<template lang="pug">
div.todos-page
  div.todos-header
    div
      h3.mb-1 Todos
      div.text-muted {{ todoSummary }}
    div.todos-header-actions
      b-button-group(size="sm")
        b-button(
          v-for="mode in viewModes"
          :key="mode.value"
          :variant="viewMode === mode.value ? 'primary' : 'outline-secondary'"
          @click="viewMode = mode.value"
        )
          icon.mr-1(:name="mode.icon")
          | {{ mode.text }}
      b-button(size="sm" variant="outline-secondary" type="button" @click="openNewTodo()")
        icon.mr-1(name="plus")
        | New

  b-modal(
    id="todo-editor-modal"
    :title="editingId ? 'Edit todo' : 'New todo'"
    centered
    hide-footer
    @hidden="handleTodoModalHidden"
  )
    section.todo-editor.todo-editor--modal
      div.section-label {{ editingId ? 'Edit todo' : 'New todo' }}
      b-form(@submit.prevent="saveTodo")
        b-form-group(label="Title" label-for="todo-title")
          b-form-input#todo-title(
            v-model.trim="draft.title"
            placeholder="Write paper section"
            autocomplete="off"
          )
        div.editor-grid
          b-form-group(label="Due date" label-for="todo-due-date")
            b-form-input#todo-due-date(v-model="draft.dueDate" type="date")
          b-form-group(label="Time" label-for="todo-due-time")
            b-form-input#todo-due-time(v-model="draft.dueTime" type="time")
        div.editor-grid
          b-form-group(label="Area" label-for="todo-area")
            b-form-select#todo-area(v-model="draft.area" :options="areaOptions")
          b-form-group(label="Repeat" label-for="todo-repeat")
            b-form-select#todo-repeat(v-model="draft.repeat" :options="repeatOptions")
        b-form-group(v-if="draft.repeat === 'custom'" label="Every" label-for="todo-repeat-every")
          div.repeat-every-row
            b-form-input#todo-repeat-every(
              v-model.number="draft.repeatEvery"
              type="number"
              min="1"
              step="1"
            )
            span days
        div.todo-priority-flags
          b-form-checkbox.todo-priority-flag(v-model="draft.important" switch)
            | Important
          b-form-checkbox.todo-priority-flag(v-model="draft.urgent" switch)
            | Urgent
        b-form-group(label="Notes" label-for="todo-notes")
          b-form-textarea#todo-notes(v-model.trim="draft.notes" rows="2")
        div.editor-actions
          b-button(type="submit" variant="primary" :disabled="!draft.title")
            icon.mr-1(name="check")
            | {{ editingId ? 'Save' : 'Add' }}
          b-button(variant="outline-secondary" type="button" @click="cancelTodoModal")
            icon.mr-1(name="times")
            | Cancel

  div.todo-workspace.mt-3
    section.todo-main
      div.todo-list-view(v-if="viewMode === 'list'")
        div.todo-section
          div.todo-section-header
            div
              div.section-label Today
              h5.mb-0 Due now
            span.todo-count {{ dueTodos.length }}
          div.todo-empty(v-if="dueTodos.length === 0") Nothing due.
          div.todo-card(
            v-for="todo in dueTodos"
            :key="todo.id"
            :class="todoCardClass(todo)"
          )
            div.todo-card-main
              div.todo-card-title-row
                button.todo-check-button(
                  type="button"
                  :class="{ 'todo-check-button--complete': isCompleting(todo) }"
                  :disabled="isCompleting(todo)"
                  :aria-label="'Complete ' + todo.title"
                  title="Complete"
                  @click.stop="completeTodoWithFeedback(todo)"
                )
                  icon(name="check")
                strong {{ todo.title }}
              div.todo-card-meta
                span.todo-area-dot(:style="{ background: areaColor(todo.area) }")
                span {{ areaLabel(todo.area) }}
                span {{ dueLabel(todo) }}
                span(v-if="todo.repeat !== 'none'") {{ repeatLabel(todo) }}
              div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
            div.todo-card-actions
              b-button(size="sm" variant="outline-secondary" @click.stop="editTodo(todo)" title="Edit")
                icon(name="pen")
              b-button(size="sm" variant="outline-danger" @click.stop="deleteTodo(todo.id)" title="Delete")
                icon(name="trash")

        div.todo-section.mt-3
          div.todo-section-header
            div
              div.section-label Next
              h5.mb-0 Upcoming
            span.todo-count {{ upcomingTodos.length }}
          div.todo-empty(v-if="upcomingTodos.length === 0") No upcoming todos.
          div.todo-card.todo-card--upcoming(
            v-for="todo in upcomingTodos"
            :key="todo.id"
            :class="{ 'todo-card--checking': isCompleting(todo) }"
          )
            div.todo-card-main
              div.todo-card-title-row
                button.todo-check-button(
                  type="button"
                  :class="{ 'todo-check-button--complete': isCompleting(todo) }"
                  :disabled="isCompleting(todo)"
                  :aria-label="'Complete ' + todo.title"
                  title="Complete"
                  @click.stop="completeTodoWithFeedback(todo)"
                )
                  icon(name="check")
                strong {{ todo.title }}
              div.todo-card-meta
                span.todo-area-dot(:style="{ background: areaColor(todo.area) }")
                span {{ areaLabel(todo.area) }}
                span {{ dueLabel(todo) }}
                span(v-if="todo.repeat !== 'none'") {{ repeatLabel(todo) }}
              div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
            div.todo-card-actions
              b-button(size="sm" variant="outline-secondary" @click.stop="editTodo(todo)" title="Edit")
                icon(name="pen")
              b-button(size="sm" variant="outline-danger" @click.stop="deleteTodo(todo.id)" title="Delete")
                icon(name="trash")

        div.todo-section.mt-3(v-if="completedTodos.length > 0")
          div.todo-section-header
            div
              div.section-label Done
              h5.mb-0 Completed
            span.todo-count {{ completedTodos.length }}
          div.todo-card.todo-card--done(v-for="todo in completedTodos" :key="todo.id")
            div.todo-card-main
              div.todo-card-title-row
                span.todo-check-button.todo-check-button--done
                  icon(name="check")
                strong {{ todo.title }}
              div.todo-card-meta
                span {{ completedLabel(todo) }}
            div.todo-card-actions
              b-button(size="sm" variant="outline-secondary" @click.stop="restoreTodo(todo)" title="Restore")
                icon(name="sync")
              b-button(size="sm" variant="outline-danger" @click.stop="deleteTodo(todo.id)" title="Delete")
                icon(name="trash")

      div.todo-plan-view(v-else-if="viewMode === 'plan'")
        div.todo-plan-header
          div
            div.section-label Today
            h5.mb-0 {{ todayPlanLabel }}
          div.todo-plan-toolbar
            span.todo-count {{ plannedTodos.length }}
            b-button(size="sm" variant="outline-secondary" type="button" @click="addDueTodayToPlan")
              icon.mr-1(name="calendar-day")
              | Due today
            b-button(
              size="sm"
              variant="outline-secondary"
              type="button"
              :disabled="plannedTodos.length === 0"
              @click="clearDayPlan"
            )
              icon.mr-1(name="times")
              | Clear
        div.todo-plan-layout
          section.todo-plan-panel.todo-plan-panel--selected
            div.todo-section-header
              div
                div.section-label Order
                h5.mb-0 Plan day
              span.todo-plan-subtle {{ planProgressLabel }}
            div.todo-frog-card(
              :class="{ 'todo-frog-card--empty': !frogTodo && !frogIsEaten, 'todo-frog-card--drop-active': draggedFrogTodoId, 'todo-frog-card--drop-over': frogDropActive, 'todo-frog-card--eaten': frogIsEaten }"
              @dragover.prevent="handleFrogDragOver"
              @dragenter.prevent="handleFrogDragEnter"
              @dragleave="handleFrogDragLeave($event)"
              @drop.prevent="dropTodoOnFrog($event)"
            )
              div.todo-frog-illustration(:class="{ 'todo-frog-illustration--ready': frogTodo && !frogIsEaten }" aria-hidden="true")
                img.todo-frog-photo(
                  :class="{ 'todo-frog-photo--eaten': frogIsEaten }"
                  :src="frogIsEaten ? '/focusfrog-frog-eaten.png?v=transparent' : '/focusfrog-frog-alive.png?v=transparent'"
                  alt=""
                  draggable="false"
                )
                div.todo-frog-confetti(v-if="frogEatenTodoId" aria-hidden="true")
                  span.todo-confetti.todo-confetti--1
                  span.todo-confetti.todo-confetti--2
                  span.todo-confetti.todo-confetti--3
                  span.todo-confetti.todo-confetti--4
                  span.todo-confetti.todo-confetti--5
                  span.todo-confetti.todo-confetti--6
                  span.todo-confetti.todo-confetti--7
                  span.todo-confetti.todo-confetti--8
                  span.todo-confetti.todo-confetti--9
                  span.todo-confetti.todo-confetti--10
                  span.todo-confetti.todo-confetti--11
                  span.todo-confetti.todo-confetti--12
              div.todo-frog-content
                div.section-label Frog of the day
                h5.mb-1(v-if="frogIsEaten") Frog eaten today
                h5.mb-1(v-else-if="frogTodo") Eat this frog first
                h5.mb-1(v-else) Pick your frog
                p.todo-frog-copy(v-if="frogIsEaten") {{ frogEatenCopy }}
                p.todo-frog-copy(v-else-if="frogTodo") {{ frogTodo.title }}
                p.todo-frog-copy(v-else) Drag a todo here or select one below.
                div.todo-frog-meta(v-if="frogTodo && !frogIsEaten")
                  span.todo-area-dot(:style="{ background: areaColor(frogTodo.area) }")
                  span {{ areaLabel(frogTodo.area) }}
                  span {{ dueLabel(frogTodo) }}
                div.todo-frog-actions(v-if="frogTodo && !frogIsEaten")
                  b-button(
                    size="sm"
                    variant="primary"
                    type="button"
                    :disabled="isCompleting(frogTodo)"
                    @click="completeFrogTodo"
                  )
                    icon.mr-1(name="check")
                    | Done with frog
            div.todo-frog-picker(v-if="plannedTodos.length > 0" aria-label="Choose frog of the day")
              button.todo-frog-pill(
                v-for="todo in plannedTodos"
                :key="'frog-' + todo.id"
                type="button"
                :class="{ 'todo-frog-pill--active': isFrogTodo(todo) }"
                @click="selectFrogTodo(todo)"
              )
                span.todo-frog-pill-dot(:style="{ background: areaColor(todo.area) }")
                span {{ todo.title }}
            div.todo-empty(v-if="plannedTodos.length === 0") No todos selected.
            div.todo-plan-list(v-else)
              div.todo-plan-card(
                v-for="(todo, index) in plannedTodos"
                :key="todo.id"
                :class="{ 'todo-plan-card--checking': isCompleting(todo), 'todo-plan-card--frog': isFrogTodo(todo), 'todo-plan-card--dragging': draggedFrogTodoId === todo.id }"
                :style="{ borderColor: areaColor(todo.area) }"
                @mousedown="startFrogMouseDrag(todo, $event)"
                @pointerdown="startFrogPointerDrag(todo, $event)"
                @pointermove="handleFrogPointerMove($event)"
                @pointerup="endFrogPointerDrag($event)"
                @pointercancel="cancelFrogPointerDrag($event)"
              )
                div.todo-plan-index {{ index + 1 }}
                div.todo-card-main
                  div.todo-card-title-row
                    span.todo-area-dot(:style="{ background: areaColor(todo.area) }")
                    strong {{ todo.title }}
                    span.todo-frog-badge(v-if="isFrogTodo(todo)") frog
                  div.todo-card-meta
                    span {{ areaLabel(todo.area) }}
                    span {{ dueLabel(todo) }}
                    span(v-if="todo.repeat !== 'none'") {{ repeatLabel(todo) }}
                  div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
                div.todo-plan-actions
                  b-button(
                    size="sm"
                    variant="outline-secondary"
                    :disabled="index === 0"
                    title="Move up"
                    @click="movePlannedTodo(todo.id, -1)"
                  )
                    icon(name="arrow-up")
                  b-button(
                    size="sm"
                    variant="outline-secondary"
                    :disabled="index === plannedTodos.length - 1"
                    title="Move down"
                    @click="movePlannedTodo(todo.id, 1)"
                  )
                    icon(name="arrow-down")
                  button.todo-check-button.todo-check-button--action(
                    type="button"
                    :class="{ 'todo-check-button--complete': isCompleting(todo) }"
                    :disabled="isCompleting(todo)"
                    :aria-label="'Complete ' + todo.title"
                    title="Complete"
                    @click="completeTodoWithFeedback(todo)"
                  )
                    icon(name="check")
                  b-button(
                    size="sm"
                    variant="outline-secondary"
                    title="Remove from plan"
                    @click="removeFromDayPlan(todo.id)"
                  )
                    icon(name="minus")
          section.todo-plan-panel.todo-plan-panel--available
            div.todo-section-header
              div
                div.section-label Choose
                h5.mb-0 Available todos
              span.todo-count {{ planCandidateTodos.length }}
            div.todo-empty(v-if="planCandidateTodos.length === 0") Nothing else available.
            div.todo-plan-choice(
              v-for="todo in planCandidateTodos"
              :key="todo.id"
              :class="{ 'todo-plan-choice--dragging': draggedFrogTodoId === todo.id }"
              :style="{ borderColor: areaColor(todo.area) }"
              @mousedown="startFrogMouseDrag(todo, $event)"
              @pointerdown="startFrogPointerDrag(todo, $event)"
              @pointermove="handleFrogPointerMove($event)"
              @pointerup="endFrogPointerDrag($event)"
              @pointercancel="cancelFrogPointerDrag($event)"
            )
              div.todo-card-main
                div.todo-card-title-row
                  span.todo-area-dot(:style="{ background: areaColor(todo.area) }")
                  strong {{ todo.title }}
                div.todo-card-meta
                  span {{ areaLabel(todo.area) }}
                  span {{ dueLabel(todo) }}
                  span(v-if="todo.repeat !== 'none'") {{ repeatShortLabel(todo) }}
                div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
              div.todo-card-actions
                b-button(size="sm" variant="primary" type="button" @click="addToDayPlan(todo)")
                  icon.mr-1(name="plus")
                  | Add
                b-button(size="sm" variant="outline-secondary" title="Edit" @click="editTodo(todo)")
                  icon(name="pen")

      div.todo-calendar-view(v-else-if="viewMode === 'calendar'")
        div.todo-calendar-toolbar
          strong {{ calendarRangeLabel }}
          b-button(size="sm" variant="outline-secondary" @click="resetCalendarToToday") Today
        div.todo-calendar-scroll(ref="calendarScroll" @scroll.passive="handleCalendarScroll")
          div.todo-calendar-grid
            div.todo-calendar-day(
              v-for="day in calendarDays"
              :key="day.key"
              :class="{ 'todo-calendar-day--today': day.isToday, 'todo-calendar-day--focus': day.isFocus }"
              :data-calendar-date="day.date"
            )
              div.todo-calendar-day-header(:class="{ 'todo-calendar-day-header--today': day.isToday }")
                span {{ day.weekday }}
                strong {{ day.dayNumber }}
              div.todo-calendar-lane(
                v-for="lane in timeLanes"
                :key="lane.value"
                :class="{ 'todo-calendar-lane--active': draggedCalendarTodoId, 'todo-calendar-lane--over': draggedCalendarTargetKey === calendarLaneKey(day, lane.value) }"
                @click.self="openNewTodoFromCalendar(day, lane.value)"
                @dragover.prevent="handleCalendarDragOver"
                @dragenter.prevent="draggedCalendarTargetKey = calendarLaneKey(day, lane.value)"
                @dragleave="handleCalendarDragLeave(day, lane.value, $event)"
                @drop.prevent="dropTodoOnCalendarLane(day, lane.value, $event)"
              )
                div.todo-calendar-lane-label {{ lane.text }}
                div.todo-mini-card(
                  v-for="todo in todosForDayLane(day, lane.value)"
                  :key="todo.id"
                  :class="{ 'todo-mini-card--checking': isCompleting(todo), 'todo-mini-card--dragging': draggedCalendarTodoId === todo.id }"
                  :style="{ borderColor: areaColor(todo.area) }"
                  draggable="true"
                  @click.stop="noop"
                  @dragstart="startCalendarDrag(todo, $event)"
                  @dragend="endCalendarDrag"
                )
                  div.todo-mini-title-row
                    button.todo-check-button.todo-check-button--mini(
                      type="button"
                      :class="{ 'todo-check-button--complete': isCompleting(todo) }"
                      :disabled="isCompleting(todo)"
                      :aria-label="'Complete ' + todo.title"
                      title="Complete"
                      @click.stop="completeTodoWithFeedback(todo)"
                    )
                      icon(name="check")
                    div.todo-mini-title {{ todo.title }}
                    span.todo-drag-handle(title="Drag to move")
                      icon(name="grip-lines")
                  div.todo-mini-meta
                    span {{ dueTimeLabel(todo) }}
                    span(v-if="todo.repeat !== 'none'") {{ repeatShortLabel(todo) }}
      div.todo-matrix-view(v-else-if="viewMode === 'matrix'")
        div.todo-matrix-grid
          section.todo-matrix-quadrant(
            v-for="quadrant in eisenhowerQuadrants"
            :key="quadrant.key"
            :class="'todo-matrix-quadrant--' + quadrant.key"
          )
            div.todo-matrix-header
              div
                div.todo-matrix-axis {{ quadrant.axis }}
                h5.mb-0 {{ quadrant.title }}
              span.todo-count {{ quadrant.todos.length }}
            div.todo-matrix-body(
              :class="{ 'todo-matrix-body--active': draggedMatrixTodoId, 'todo-matrix-body--over': draggedMatrixTargetKey === quadrant.key }"
              @click.self="openNewTodoFromMatrix(quadrant)"
              @dragover.prevent="handleMatrixDragOver"
              @dragenter.prevent="draggedMatrixTargetKey = quadrant.key"
              @dragleave="handleMatrixDragLeave(quadrant, $event)"
              @drop.prevent="dropTodoOnMatrixQuadrant(quadrant, $event)"
            )
              div.todo-empty(
                v-if="quadrant.todos.length === 0"
                role="button"
                tabindex="0"
                @click.stop="openNewTodoFromMatrix(quadrant)"
                @keyup.enter.stop="openNewTodoFromMatrix(quadrant)"
              ) No todos here.
              div.todo-matrix-card(
                v-for="todo in quadrant.todos"
                :key="todo.id"
                :class="{ 'todo-matrix-card--dragging': draggedMatrixTodoId === todo.id, 'todo-matrix-card--checking': isCompleting(todo) }"
                :style="{ borderColor: areaColor(todo.area) }"
                draggable="true"
                @click.stop="noop"
                @dragstart="startMatrixDrag(todo, $event)"
                @dragend="endMatrixDrag"
              )
                div.todo-card-title-row
                  button.todo-check-button.todo-check-button--mini(
                    type="button"
                    :class="{ 'todo-check-button--complete': isCompleting(todo) }"
                    :disabled="isCompleting(todo)"
                    :aria-label="'Complete ' + todo.title"
                    title="Complete"
                    @click.stop="completeTodoWithFeedback(todo)"
                  )
                    icon(name="check")
                  span.todo-area-dot(:style="{ background: areaColor(todo.area) }")
                  strong {{ todo.title }}
                  span.todo-drag-handle(title="Drag to move")
                    icon(name="grip-lines")
                div.todo-mini-meta
                  span {{ areaLabel(todo.area) }}
                  span {{ dueLabel(todo) }}
                  span(v-if="todo.repeat !== 'none'") {{ repeatShortLabel(todo) }}
                div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
                div.todo-card-actions.todo-matrix-actions
                  b-button(size="sm" variant="outline-secondary" @click.stop="editTodo(todo)" title="Edit")
                    icon(name="pen")
                  b-button(size="sm" variant="outline-danger" @click.stop="deleteTodo(todo.id)" title="Delete")
                    icon(name="trash")
</template>

<script lang="ts">
import 'vue-awesome/icons/arrow-down';
import 'vue-awesome/icons/arrow-up';
import 'vue-awesome/icons/border-all';
import 'vue-awesome/icons/calendar-alt';
import 'vue-awesome/icons/calendar-day';
import 'vue-awesome/icons/check';
import 'vue-awesome/icons/clipboard-list';
import 'vue-awesome/icons/grip-lines';
import 'vue-awesome/icons/list-ul';
import 'vue-awesome/icons/minus';
import 'vue-awesome/icons/pen';
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/sync';
import 'vue-awesome/icons/tasks';
import 'vue-awesome/icons/times';
import 'vue-awesome/icons/trash';
import moment from 'moment';

type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
type TodoArea = 'work' | 'personal' | 'health' | 'home' | 'admin';

interface TodoItem {
  id: string;
  title: string;
  notes: string;
  area: TodoArea;
  dueDate: string;
  dueTime: string;
  repeat: RepeatRule;
  repeatEvery: number;
  important: boolean;
  urgent: boolean;
  completed: boolean;
  completedAt: string;
  completedCount: number;
  lastCompletedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface TodoDraft {
  title: string;
  notes: string;
  area: TodoArea;
  dueDate: string;
  dueTime: string;
  repeat: RepeatRule;
  repeatEvery: number;
  important: boolean;
  urgent: boolean;
}

interface CalendarDay {
  key: string;
  date: string;
  weekday: string;
  dayNumber: string;
  isToday: boolean;
  isFocus: boolean;
}

interface MatrixQuadrant {
  key: string;
  title: string;
  axis: string;
  important: boolean;
  urgent: boolean;
  todos: TodoItem[];
}

interface DayPlanRecord {
  date: string;
  todoIds: string[];
}

interface FrogPlanRecord {
  date: string;
  todoId: string;
  eatenToday?: boolean;
  eatenTodoTitle?: string;
}

const TODO_STORAGE_KEY = 'timetracker.todos.v1';
const TODO_DAY_PLAN_STORAGE_KEY = 'timetracker.todoDayPlan.v1';
const TODO_FROG_STORAGE_KEY = 'timetracker.todoFrog.v1';
const TODO_EDITOR_MODAL_ID = 'todo-editor-modal';
const CALENDAR_PAST_BUFFER_DAYS = 14;
const CALENDAR_FUTURE_DAYS = 28;
const CALENDAR_SCROLL_BATCH_DAYS = 14;

const AREA_CONFIG: Record<TodoArea, { text: string; color: string }> = {
  work: { text: 'Work', color: '#10b981' },
  personal: { text: 'Personal', color: '#ec4899' },
  health: { text: 'Health', color: '#06b6d4' },
  home: { text: 'Home', color: '#f59e0b' },
  admin: { text: 'Admin', color: '#8b5cf6' },
};

function blankDraft(): TodoDraft {
  return {
    title: '',
    notes: '',
    area: 'work',
    dueDate: moment().format('YYYY-MM-DD'),
    dueTime: '09:00',
    repeat: 'none',
    repeatEvery: 2,
    important: false,
    urgent: false,
  };
}

export default {
  name: 'Todos',
  data() {
    return {
      todos: [] as TodoItem[],
      dayPlanIds: [] as string[],
      frogTodoId: '',
      frogEatenTodoId: '',
      frogEatenToday: false,
      frogEatenTitle: '',
      completingTodoId: '',
      draggedFrogTodoId: '',
      frogDropActive: false,
      frogPointerTodoId: '',
      frogPointerStartX: 0,
      frogPointerStartY: 0,
      draggedCalendarTodoId: '',
      draggedCalendarTargetKey: '',
      draggedMatrixTodoId: '',
      draggedMatrixTargetKey: '',
      draft: blankDraft(),
      editingId: '',
      viewMode: 'plan',
      calendarStartDate: moment().format('YYYY-MM-DD'),
      calendarFocusDate: moment().format('YYYY-MM-DD'),
      calendarDayCount: CALENDAR_PAST_BUFFER_DAYS + CALENDAR_FUTURE_DAYS,
      viewModes: [
        { value: 'plan', text: 'Plan day', icon: 'clipboard-list' },
        { value: 'list', text: 'List', icon: 'list-ul' },
        { value: 'calendar', text: 'Calendar', icon: 'calendar-alt' },
        { value: 'matrix', text: 'Eisenhower', icon: 'border-all' },
      ],
      repeatOptions: [
        { value: 'none', text: 'No repeat' },
        { value: 'daily', text: 'Daily' },
        { value: 'weekdays', text: 'Weekdays' },
        { value: 'weekly', text: 'Weekly' },
        { value: 'monthly', text: 'Monthly' },
        { value: 'custom', text: 'Custom days' },
      ],
      timeLanes: [
        { value: 'morning', text: 'Morning' },
        { value: 'afternoon', text: 'Afternoon' },
        { value: 'evening', text: 'Evening' },
        { value: 'anytime', text: 'Anytime' },
      ],
    };
  },
  computed: {
    areaOptions() {
      return Object.entries(AREA_CONFIG).map(([value, config]) => ({
        value,
        text: config.text,
      }));
    },
    activeTodos(): TodoItem[] {
      return this.todos
        .filter(todo => !todo.completed)
        .sort((a, b) => this.todoDueMoment(a).valueOf() - this.todoDueMoment(b).valueOf());
    },
    dueTodos(): TodoItem[] {
      const now = moment();
      return this.activeTodos.filter(todo => this.todoDueMoment(todo).isSameOrBefore(now));
    },
    upcomingTodos(): TodoItem[] {
      const now = moment();
      return this.activeTodos.filter(todo => this.todoDueMoment(todo).isAfter(now)).slice(0, 12);
    },
    completedTodos(): TodoItem[] {
      return this.todos
        .filter(todo => todo.completed)
        .sort(
          (a, b) =>
            moment(b.completedAt || b.updatedAt).valueOf() -
            moment(a.completedAt || a.updatedAt).valueOf()
        )
        .slice(0, 8);
    },
    todoSummary(): string {
      const due = this.dueTodos.length;
      const upcoming = this.activeTodos.length - due;
      return `${due} due now, ${upcoming} upcoming`;
    },
    todayPlanLabel(): string {
      return moment().format('dddd, MMM D');
    },
    plannedTodos(): TodoItem[] {
      const todosById = new Map(this.activeTodos.map(todo => [todo.id, todo]));
      return this.dayPlanIds
        .map(id => todosById.get(id))
        .filter((todo): todo is TodoItem => Boolean(todo));
    },
    frogTodo(): TodoItem | null {
      if (this.frogEatenToday) return null;
      const planned = this.plannedTodos;
      if (planned.length === 0) return null;
      return planned[0];
    },
    frogIsEaten(): boolean {
      return (
        this.frogEatenToday || Boolean(this.frogTodo && this.frogEatenTodoId === this.frogTodo.id)
      );
    },
    frogEatenCopy(): string {
      return this.frogEatenTitle
        ? `Completed: ${this.frogEatenTitle}`
        : 'You already ate your frog today.';
    },
    planCandidateTodos(): TodoItem[] {
      const plannedIds = new Set(this.dayPlanIds);
      return this.activeTodos.filter(todo => !plannedIds.has(todo.id));
    },
    planProgressLabel(): string {
      const selected = this.plannedTodos.length;
      return selected === 1 ? '1 selected' : `${selected} selected`;
    },
    calendarDays(): CalendarDay[] {
      const start = moment(this.calendarStartDate, 'YYYY-MM-DD').startOf('day');
      const focusMoment = moment(this.calendarFocusDate, 'YYYY-MM-DD').startOf('day');
      return Array.from({ length: this.calendarDayCount }, (_item, index) => {
        const date = start.clone().add(index, 'days');
        return {
          key: date.format('YYYY-MM-DD'),
          date: date.format('YYYY-MM-DD'),
          weekday: date.format('ddd'),
          dayNumber: date.format('D'),
          isToday: date.isSame(moment(), 'day'),
          isFocus: date.isSame(focusMoment, 'day'),
        };
      });
    },
    calendarRangeLabel(): string {
      const days = this.calendarDays as CalendarDay[];
      if (days.length === 0) return '';
      const first = moment(days[0].date);
      const last = moment(days[days.length - 1].date);
      return `${first.format('MMM D')} - ${last.format('MMM D')}`;
    },
    eisenhowerQuadrants(): MatrixQuadrant[] {
      const quadrants = [
        {
          key: 'do',
          title: 'Do first',
          axis: 'Urgent + important',
          important: true,
          urgent: true,
        },
        {
          key: 'schedule',
          title: 'Schedule',
          axis: 'Important',
          important: true,
          urgent: false,
        },
        {
          key: 'delegate',
          title: 'Delegate',
          axis: 'Urgent',
          important: false,
          urgent: true,
        },
        {
          key: 'later',
          title: 'Later',
          axis: 'Not urgent + not important',
          important: false,
          urgent: false,
        },
      ];

      return quadrants.map(quadrant => ({
        ...quadrant,
        todos: this.activeTodos.filter(
          todo =>
            Boolean(todo.important) === quadrant.important &&
            Boolean(todo.urgent) === quadrant.urgent
        ),
      }));
    },
  },
  watch: {
    viewMode(mode) {
      if (mode === 'calendar') {
        this.$nextTick(() => this.scrollCalendarToFocus());
      }
    },
  },
  mounted() {
    this.loadTodos();
    this.loadDayPlan();
    this.loadFrogTodo();
    this.pruneDayPlan();
    this.syncFrogTodoToFirstPlan();
  },
  methods: {
    noop(event?: Event) {
      event?.stopPropagation();
    },
    showTodoModal() {
      this.$root.$emit('bv::show::modal', TODO_EDITOR_MODAL_ID);
    },
    hideTodoModal() {
      this.$root.$emit('bv::hide::modal', TODO_EDITOR_MODAL_ID);
    },
    openNewTodo(prefill: Partial<TodoDraft> = {}) {
      this.editingId = '';
      this.draft = {
        ...blankDraft(),
        ...prefill,
      };
      this.$nextTick(() => this.showTodoModal());
    },
    openNewTodoFromCalendar(day: CalendarDay, lane: string) {
      this.openNewTodo({
        dueDate: day.date,
        dueTime: this.defaultDueTimeForLane(lane),
      });
    },
    openNewTodoFromMatrix(quadrant: MatrixQuadrant) {
      this.openNewTodo({
        important: quadrant.important,
        urgent: quadrant.urgent,
      });
    },
    cancelTodoModal() {
      this.resetDraft();
      this.hideTodoModal();
    },
    handleTodoModalHidden() {
      this.resetDraft();
    },
    loadTodos() {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(TODO_STORAGE_KEY);
        this.todos = raw ? JSON.parse(raw).map(this.normalizeTodo) : [];
        this.resetCalendarWindow();
      } catch (err) {
        console.error('Could not load todos:', err);
        this.todos = [];
        this.resetCalendarWindow();
      }
    },
    saveTodos() {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(this.todos));
    },
    loadDayPlan() {
      if (typeof localStorage === 'undefined') return;
      const today = moment().format('YYYY-MM-DD');
      try {
        const raw = localStorage.getItem(TODO_DAY_PLAN_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<DayPlanRecord>) : null;
        this.dayPlanIds =
          parsed?.date === today && Array.isArray(parsed.todoIds)
            ? parsed.todoIds.filter(id => typeof id === 'string')
            : [];
        if (parsed?.date !== today) this.saveDayPlan();
      } catch (err) {
        console.error('Could not load day plan:', err);
        this.dayPlanIds = [];
      }
    },
    saveDayPlan() {
      if (typeof localStorage === 'undefined') return;
      const record: DayPlanRecord = {
        date: moment().format('YYYY-MM-DD'),
        todoIds: this.dayPlanIds,
      };
      localStorage.setItem(TODO_DAY_PLAN_STORAGE_KEY, JSON.stringify(record));
    },
    loadFrogTodo() {
      if (typeof localStorage === 'undefined') return;
      const today = moment().format('YYYY-MM-DD');
      try {
        const raw = localStorage.getItem(TODO_FROG_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<FrogPlanRecord>) : null;
        const isToday = parsed?.date === today;
        this.frogTodoId = isToday && typeof parsed.todoId === 'string' ? parsed.todoId : '';
        this.frogEatenToday = Boolean(isToday && parsed?.eatenToday);
        this.frogEatenTitle =
          isToday && typeof parsed?.eatenTodoTitle === 'string' ? parsed.eatenTodoTitle : '';
        if (!isToday) this.saveFrogTodo();
      } catch (err) {
        console.error('Could not load frog of the day:', err);
        this.frogTodoId = '';
        this.frogEatenToday = false;
        this.frogEatenTitle = '';
      }
    },
    saveFrogTodo() {
      if (typeof localStorage === 'undefined') return;
      const record: FrogPlanRecord = {
        date: moment().format('YYYY-MM-DD'),
        todoId: this.frogTodoId,
        eatenToday: this.frogEatenToday,
        eatenTodoTitle: this.frogEatenTitle,
      };
      localStorage.setItem(TODO_FROG_STORAGE_KEY, JSON.stringify(record));
    },
    pruneDayPlan() {
      const activeIds = new Set(this.activeTodos.map(todo => todo.id));
      const nextIds = this.dayPlanIds.filter(
        (id, index, ids) => activeIds.has(id) && ids.indexOf(id) === index
      );
      if (nextIds.length !== this.dayPlanIds.length) {
        this.dayPlanIds = nextIds;
        this.saveDayPlan();
      }
    },
    pruneFrogTodo() {
      if (this.frogEatenToday) {
        if (this.frogTodoId) {
          this.frogTodoId = '';
          this.saveFrogTodo();
        }
        return;
      }
      if (!this.frogTodoId) return;
      if (this.plannedTodos.some(todo => todo.id === this.frogTodoId)) return;
      this.frogTodoId = '';
      this.frogEatenTodoId = '';
      this.saveFrogTodo();
    },
    syncFrogTodoToFirstPlan() {
      if (this.frogEatenToday) {
        if (this.frogTodoId) {
          this.frogTodoId = '';
          this.frogEatenTodoId = '';
          this.saveFrogTodo();
        }
        return;
      }
      const firstTodoId = this.plannedTodos[0]?.id || '';
      if (this.frogTodoId === firstTodoId) return;
      this.frogTodoId = firstTodoId;
      this.frogEatenTodoId = '';
      this.saveFrogTodo();
    },
    moveTodoToPlanFront(todoId: string) {
      const todo = this.activeTodos.find(item => item.id === todoId);
      if (!todo) return;
      this.frogEatenToday = false;
      this.frogEatenTitle = '';
      this.dayPlanIds = [todo.id, ...this.dayPlanIds.filter(id => id !== todo.id)];
      this.saveDayPlan();
      this.syncFrogTodoToFirstPlan();
    },
    addToDayPlan(todo: TodoItem) {
      if (this.dayPlanIds.includes(todo.id)) return;
      this.dayPlanIds = [...this.dayPlanIds, todo.id];
      this.saveDayPlan();
      this.syncFrogTodoToFirstPlan();
    },
    removeFromDayPlan(todoId: string) {
      if (!this.dayPlanIds.includes(todoId)) return;
      this.dayPlanIds = this.dayPlanIds.filter(id => id !== todoId);
      this.saveDayPlan();
      this.syncFrogTodoToFirstPlan();
    },
    movePlannedTodo(todoId: string, direction: number) {
      const index = this.dayPlanIds.indexOf(todoId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= this.dayPlanIds.length) return;
      const nextIds = [...this.dayPlanIds];
      [nextIds[index], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[index]];
      this.dayPlanIds = nextIds;
      this.saveDayPlan();
      this.syncFrogTodoToFirstPlan();
    },
    clearDayPlan() {
      this.dayPlanIds = [];
      this.frogTodoId = '';
      this.frogEatenTodoId = '';
      this.frogEatenToday = false;
      this.frogEatenTitle = '';
      this.saveDayPlan();
      this.saveFrogTodo();
    },
    addDueTodayToPlan() {
      const endOfToday = moment().endOf('day');
      const nextIds = this.activeTodos
        .filter(todo => this.todoDueMoment(todo).isSameOrBefore(endOfToday))
        .map(todo => todo.id)
        .filter(id => !this.dayPlanIds.includes(id));
      if (nextIds.length === 0) return;
      const planIds = [...this.dayPlanIds, ...nextIds];
      this.dayPlanIds = planIds;
      this.saveDayPlan();
      this.syncFrogTodoToFirstPlan();
    },
    selectFrogTodo(todo: TodoItem) {
      if (!this.dayPlanIds.includes(todo.id)) return;
      this.moveTodoToPlanFront(todo.id);
    },
    selectFrogTodoById(todoId: string) {
      const todo = this.activeTodos.find(item => item.id === todoId);
      if (!todo) return;
      this.moveTodoToPlanFront(todo.id);
    },
    isFrogTodo(todo: TodoItem): boolean {
      return this.frogTodo?.id === todo.id;
    },
    completeFrogTodo() {
      const todo = this.frogTodo;
      if (!todo) return;
      this.completeTodoWithFeedback(todo);
    },
    startFrogDrag(todo: TodoItem, event: DragEvent) {
      this.draggedFrogTodoId = todo.id;
      this.frogDropActive = false;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', todo.id);
      }
    },
    handleFrogDragOver(event: DragEvent) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    handleFrogDragEnter() {
      if (this.draggedFrogTodoId) {
        this.frogDropActive = true;
      }
    },
    handleFrogDragLeave(event: DragEvent) {
      const currentTarget = event.currentTarget as HTMLElement | null;
      const relatedTarget = event.relatedTarget as Node | null;
      if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
      this.frogDropActive = false;
    },
    dropTodoOnFrog(event: DragEvent) {
      const todoId = this.draggedFrogTodoId || event.dataTransfer?.getData('text/plain');
      if (todoId) this.selectFrogTodoById(todoId);
      this.endFrogDrag();
    },
    endFrogDrag() {
      this.draggedFrogTodoId = '';
      this.frogDropActive = false;
    },
    startFrogPointerDrag(todo: TodoItem, event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select')) return;
      this.frogPointerTodoId = todo.id;
      this.frogPointerStartX = event.clientX;
      this.frogPointerStartY = event.clientY;
      const currentTarget = event.currentTarget as HTMLElement | null;
      currentTarget?.setPointerCapture?.(event.pointerId);
    },
    handleFrogPointerMove(event: PointerEvent) {
      this.updateFrogDragFromPoint(event.clientX, event.clientY);
    },
    endFrogPointerDrag(event: PointerEvent) {
      const todoId = this.frogPointerTodoId;
      const shouldDrop = Boolean(
        todoId && this.draggedFrogTodoId && this.isPointOverFrogCard(event.clientX, event.clientY)
      );
      if (shouldDrop) {
        this.selectFrogTodoById(todoId);
      }
      this.cancelFrogPointerDrag(event);
    },
    cancelFrogPointerDrag(event?: PointerEvent) {
      const currentTarget = event?.currentTarget as HTMLElement | null;
      if (event) currentTarget?.releasePointerCapture?.(event.pointerId);
      this.frogPointerTodoId = '';
      this.frogPointerStartX = 0;
      this.frogPointerStartY = 0;
      this.endFrogDrag();
    },
    startFrogMouseDrag(todo: TodoItem, event: MouseEvent) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select')) return;
      this.frogPointerTodoId = todo.id;
      this.frogPointerStartX = event.clientX;
      this.frogPointerStartY = event.clientY;
      window.addEventListener('mousemove', this.handleFrogMouseMove);
      window.addEventListener('mouseup', this.endFrogMouseDrag);
    },
    handleFrogMouseMove(event: MouseEvent) {
      this.updateFrogDragFromPoint(event.clientX, event.clientY);
    },
    endFrogMouseDrag(event: MouseEvent) {
      const todoId = this.frogPointerTodoId;
      const shouldDrop = Boolean(
        todoId && this.draggedFrogTodoId && this.isPointOverFrogCard(event.clientX, event.clientY)
      );
      if (shouldDrop) {
        this.selectFrogTodoById(todoId);
      }
      this.cancelFrogMouseDrag();
    },
    cancelFrogMouseDrag() {
      window.removeEventListener('mousemove', this.handleFrogMouseMove);
      window.removeEventListener('mouseup', this.endFrogMouseDrag);
      this.frogPointerTodoId = '';
      this.frogPointerStartX = 0;
      this.frogPointerStartY = 0;
      this.endFrogDrag();
    },
    updateFrogDragFromPoint(clientX: number, clientY: number) {
      if (!this.frogPointerTodoId) return;
      const distance = Math.hypot(
        clientX - this.frogPointerStartX,
        clientY - this.frogPointerStartY
      );
      if (distance < 8) return;
      this.draggedFrogTodoId = this.frogPointerTodoId;
      this.frogDropActive = this.isPointOverFrogCard(clientX, clientY);
    },
    isPointerOverFrogCard(event: PointerEvent): boolean {
      return this.isPointOverFrogCard(event.clientX, event.clientY);
    },
    isPointOverFrogCard(clientX: number, clientY: number): boolean {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      return Boolean(element?.closest('.todo-frog-card'));
    },
    calendarLaneKey(day: CalendarDay, lane: string): string {
      return `${day.date}:${lane}`;
    },
    defaultDueTimeForLane(lane: string): string {
      const laneTimes: Record<string, string> = {
        morning: '09:00',
        afternoon: '13:00',
        evening: '18:00',
        anytime: '',
      };
      return laneTimes[lane] ?? blankDraft().dueTime;
    },
    startCalendarDrag(todo: TodoItem, event: DragEvent) {
      this.draggedCalendarTodoId = todo.id;
      this.draggedCalendarTargetKey = '';
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', todo.id);
      }
    },
    handleCalendarDragOver(event: DragEvent) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    },
    handleCalendarDragLeave(day: CalendarDay, lane: string, event: DragEvent) {
      const currentTarget = event.currentTarget as HTMLElement | null;
      const relatedTarget = event.relatedTarget as Node | null;
      if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
      const key = this.calendarLaneKey(day, lane);
      if (this.draggedCalendarTargetKey === key) {
        this.draggedCalendarTargetKey = '';
      }
    },
    dropTodoOnCalendarLane(day: CalendarDay, lane: string, event: DragEvent) {
      const todoId = this.draggedCalendarTodoId || event.dataTransfer?.getData('text/plain');
      if (todoId) {
        this.moveTodoToCalendarLane(todoId, day, lane);
      }
      this.endCalendarDrag();
    },
    endCalendarDrag() {
      this.draggedCalendarTodoId = '';
      this.draggedCalendarTargetKey = '';
    },
    moveTodoToCalendarLane(todoId: string, day: CalendarDay, lane: string) {
      const dueTime = this.defaultDueTimeForLane(lane);
      const now = moment().toISOString();
      this.todos = this.todos.map(todo =>
        todo.id === todoId
          ? {
              ...todo,
              dueDate: day.date,
              dueTime,
              updatedAt: now,
            }
          : todo
      );
      this.saveTodos();
      this.ensureCalendarCoversAnchor();
    },
    isCompleting(todo: TodoItem): boolean {
      return this.completingTodoId === todo.id;
    },
    completeTodoWithFeedback(todo: TodoItem) {
      if (this.isCompleting(todo)) return;
      const isFrog = this.isFrogTodo(todo);
      this.completingTodoId = todo.id;
      if (isFrog) {
        this.frogEatenTodoId = todo.id;
        this.frogEatenToday = true;
        this.frogEatenTitle = todo.title;
        this.frogTodoId = '';
        this.saveFrogTodo();
      }
      this.playTodoCompleteSound();
      window.setTimeout(
        () => {
          this.completeTodo(todo);
          if (this.completingTodoId === todo.id) {
            this.completingTodoId = '';
          }
          if (this.frogEatenTodoId === todo.id) {
            this.frogEatenTodoId = '';
          }
        },
        isFrog ? 1250 : 220
      );
    },
    playTodoCompleteSound() {
      if (typeof window === 'undefined') return;
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) return;
        const audioContext = new AudioContextClass();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, now);
        oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.14);
        oscillator.onended = () => audioContext.close();
      } catch (_err) {
        // Sound is optional; browsers may block it in some contexts.
      }
    },
    startMatrixDrag(todo: TodoItem, event: DragEvent) {
      this.draggedMatrixTodoId = todo.id;
      this.draggedMatrixTargetKey = '';
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', todo.id);
      }
    },
    handleMatrixDragOver(event: DragEvent) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    },
    handleMatrixDragLeave(quadrant: MatrixQuadrant, event: DragEvent) {
      const currentTarget = event.currentTarget as HTMLElement | null;
      const relatedTarget = event.relatedTarget as Node | null;
      if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
      if (this.draggedMatrixTargetKey === quadrant.key) {
        this.draggedMatrixTargetKey = '';
      }
    },
    dropTodoOnMatrixQuadrant(quadrant: MatrixQuadrant, event: DragEvent) {
      const todoId = this.draggedMatrixTodoId || event.dataTransfer?.getData('text/plain');
      if (todoId) {
        this.moveTodoToMatrixQuadrant(todoId, quadrant);
      }
      this.endMatrixDrag();
    },
    endMatrixDrag() {
      this.draggedMatrixTodoId = '';
      this.draggedMatrixTargetKey = '';
    },
    moveTodoToMatrixQuadrant(todoId: string, quadrant: MatrixQuadrant) {
      const now = moment().toISOString();
      this.todos = this.todos.map(todo =>
        todo.id === todoId
          ? {
              ...todo,
              important: quadrant.important,
              urgent: quadrant.urgent,
              updatedAt: now,
            }
          : todo
      );
      this.saveTodos();
    },
    normalizeTodo(todo): TodoItem {
      const normalized = {
        ...todo,
        title: todo.title || '',
        notes: todo.notes || '',
        area: AREA_CONFIG[todo.area] ? todo.area : 'work',
        dueDate: todo.dueDate || moment().format('YYYY-MM-DD'),
        dueTime: todo.dueTime || '',
        repeat: todo.repeat || 'none',
        repeatEvery: Math.max(1, Number(todo.repeatEvery || 2)),
        important: Boolean(todo.important),
        urgent: Boolean(todo.urgent),
        completed: Boolean(todo.completed),
        completedAt: todo.completedAt || '',
        completedCount: Number(todo.completedCount || 0),
        lastCompletedAt: todo.lastCompletedAt || '',
        createdAt: todo.createdAt || moment().toISOString(),
        updatedAt: todo.updatedAt || moment().toISOString(),
      };
      return normalized as TodoItem;
    },
    saveTodo() {
      if (!this.draft.title) return;
      const now = moment().toISOString();
      if (this.editingId) {
        this.todos = this.todos.map(todo =>
          todo.id === this.editingId
            ? {
                ...todo,
                ...this.draft,
                repeatEvery: Math.max(1, Number(this.draft.repeatEvery || 1)),
                completed: false,
                completedAt: '',
                updatedAt: now,
              }
            : todo
        );
      } else {
        this.todos = [
          ...this.todos,
          {
            id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...this.draft,
            repeatEvery: Math.max(1, Number(this.draft.repeatEvery || 1)),
            completed: false,
            completedAt: '',
            completedCount: 0,
            lastCompletedAt: '',
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
      this.saveTodos();
      this.ensureCalendarCoversAnchor();
      this.hideTodoModal();
      this.resetDraft();
    },
    resetDraft() {
      this.draft = blankDraft();
      this.editingId = '';
    },
    editTodo(todo: TodoItem) {
      this.editingId = todo.id;
      this.draft = {
        title: todo.title,
        notes: todo.notes,
        area: todo.area,
        dueDate: todo.dueDate,
        dueTime: todo.dueTime,
        repeat: todo.repeat,
        repeatEvery: todo.repeatEvery,
        important: Boolean(todo.important),
        urgent: Boolean(todo.urgent),
      };
      this.$nextTick(() => this.showTodoModal());
    },
    deleteTodo(id: string) {
      this.todos = this.todos.filter(todo => todo.id !== id);
      if (this.editingId === id) this.resetDraft();
      this.removeFromDayPlan(id);
      this.saveTodos();
      this.ensureCalendarCoversAnchor();
    },
    restoreTodo(todo: TodoItem) {
      this.todos = this.todos.map(item =>
        item.id === todo.id
          ? {
              ...item,
              completed: false,
              completedAt: '',
              updatedAt: moment().toISOString(),
            }
          : item
      );
      this.saveTodos();
      this.ensureCalendarCoversAnchor();
    },
    completeTodo(todo: TodoItem) {
      const now = moment();
      if (todo.repeat !== 'none') {
        const nextDue = this.nextDueMoment(todo, now);
        this.todos = this.todos.map(item =>
          item.id === todo.id
            ? {
                ...item,
                dueDate: nextDue.format('YYYY-MM-DD'),
                dueTime: item.dueTime,
                completed: false,
                completedAt: '',
                completedCount: item.completedCount + 1,
                lastCompletedAt: now.toISOString(),
                updatedAt: now.toISOString(),
              }
            : item
        );
      } else {
        this.todos = this.todos.map(item =>
          item.id === todo.id
            ? {
                ...item,
                completed: true,
                completedAt: now.toISOString(),
                completedCount: item.completedCount + 1,
                lastCompletedAt: now.toISOString(),
                updatedAt: now.toISOString(),
              }
            : item
        );
      }
      this.saveTodos();
      this.removeFromDayPlan(todo.id);
      this.ensureCalendarCoversAnchor();
    },
    todoDueMoment(todo: TodoItem) {
      const time = todo.dueTime || '23:59';
      return moment(`${todo.dueDate} ${time}`, 'YYYY-MM-DD HH:mm');
    },
    nextDueMoment(todo: TodoItem, fromMoment) {
      const next = this.todoDueMoment(todo).clone();
      const stepDays = Math.max(1, Number(todo.repeatEvery || 1));
      const advance = () => {
        if (todo.repeat === 'daily') next.add(1, 'day');
        else if (todo.repeat === 'weekdays') {
          next.add(1, 'day');
          while ([0, 6].includes(next.day())) {
            next.add(1, 'day');
          }
        } else if (todo.repeat === 'weekly') next.add(1, 'week');
        else if (todo.repeat === 'monthly') next.add(1, 'month');
        else if (todo.repeat === 'custom') next.add(stepDays, 'days');
      };
      advance();
      while (next.isSameOrBefore(fromMoment)) {
        advance();
      }
      return next;
    },
    dueLabel(todo: TodoItem): string {
      const due = this.todoDueMoment(todo);
      if (due.isSame(moment(), 'day')) return `Today ${todo.dueTime || ''}`.trim();
      if (due.isSame(moment().add(1, 'day'), 'day')) return `Tomorrow ${todo.dueTime || ''}`.trim();
      return due.format(todo.dueTime ? 'ddd, MMM D HH:mm' : 'ddd, MMM D');
    },
    dueTimeLabel(todo: TodoItem): string {
      return todo.dueTime || 'Anytime';
    },
    completedLabel(todo: TodoItem): string {
      return todo.completedAt ? `Done ${moment(todo.completedAt).format('MMM D HH:mm')}` : 'Done';
    },
    repeatLabel(todo: TodoItem): string {
      if (todo.repeat === 'daily') return 'Daily';
      if (todo.repeat === 'weekdays') return 'Weekdays';
      if (todo.repeat === 'weekly') return 'Weekly';
      if (todo.repeat === 'monthly') return 'Monthly';
      if (todo.repeat === 'custom') return `Every ${todo.repeatEvery} days`;
      return '';
    },
    repeatShortLabel(todo: TodoItem): string {
      if (todo.repeat === 'weekdays') return 'Weekdays';
      if (todo.repeat === 'custom') return `${todo.repeatEvery}d`;
      return this.repeatLabel(todo);
    },
    areaLabel(area: TodoArea): string {
      return AREA_CONFIG[area]?.text || 'Work';
    },
    areaColor(area: TodoArea): string {
      return AREA_CONFIG[area]?.color || AREA_CONFIG.work.color;
    },
    todoCardClass(todo: TodoItem) {
      return {
        'todo-card--due': this.todoDueMoment(todo).isSameOrBefore(moment()),
        'todo-card--repeating': todo.repeat !== 'none',
        'todo-card--checking': this.isCompleting(todo),
      };
    },
    resetCalendarWindow() {
      const anchor = this.calendarAnchorDate();
      const today = moment().startOf('day');
      const anchorMoment = moment(anchor, 'YYYY-MM-DD').startOf('day');
      const start = anchorMoment.clone().subtract(CALENDAR_PAST_BUFFER_DAYS, 'days');
      const daysFromStartToToday = Math.max(0, today.diff(start, 'days'));
      this.calendarStartDate = start.format('YYYY-MM-DD');
      this.calendarFocusDate = anchor;
      this.calendarDayCount = Math.max(
        CALENDAR_PAST_BUFFER_DAYS + CALENDAR_FUTURE_DAYS,
        daysFromStartToToday + CALENDAR_FUTURE_DAYS
      );
    },
    ensureCalendarCoversAnchor() {
      const anchor = this.calendarAnchorDate();
      if (anchor !== this.calendarFocusDate) {
        this.resetCalendarWindow();
        this.$nextTick(() => this.scrollCalendarToFocus());
      }
    },
    calendarAnchorDate(): string {
      const today = moment().startOf('day');
      const overdue = this.activeTodos
        .map(todo => moment(todo.dueDate, 'YYYY-MM-DD').startOf('day'))
        .filter(date => date.isBefore(today, 'day'))
        .sort((a, b) => a.valueOf() - b.valueOf());
      return (overdue[0] || today).format('YYYY-MM-DD');
    },
    resetCalendarToToday() {
      this.ensureTodayIsVisible();
      this.$nextTick(() => this.scrollCalendarToToday());
    },
    scrollCalendarToFocus() {
      const scroller = this.$refs.calendarScroll as HTMLElement | undefined;
      const focusColumn = scroller?.querySelector(
        `[data-calendar-date="${this.calendarFocusDate}"]`
      ) as HTMLElement | null;
      if (scroller && focusColumn) {
        scroller.scrollLeft = Math.max(0, focusColumn.offsetLeft - 16);
      }
    },
    scrollCalendarToToday() {
      const scroller = this.$refs.calendarScroll as HTMLElement | undefined;
      const todayColumn = scroller?.querySelector(
        '.todo-calendar-day--today'
      ) as HTMLElement | null;
      if (scroller && todayColumn) {
        scroller.scrollLeft = Math.max(0, todayColumn.offsetLeft - 16);
      }
    },
    ensureTodayIsVisible() {
      const today = moment().startOf('day');
      const start = moment(this.calendarStartDate, 'YYYY-MM-DD').startOf('day');
      const end = start.clone().add(this.calendarDayCount - 1, 'days');
      if (today.isBefore(start, 'day') || today.isAfter(end, 'day')) {
        this.resetCalendarWindow();
      }
    },
    handleCalendarScroll(event: Event) {
      const scroller = event.target as HTMLElement;
      if (!scroller) return;
      const nearStart = scroller.scrollLeft < 360;
      const nearEnd = scroller.scrollLeft + scroller.clientWidth > scroller.scrollWidth - 640;
      if (nearStart) {
        const previousWidth = scroller.scrollWidth;
        this.calendarStartDate = moment(this.calendarStartDate, 'YYYY-MM-DD')
          .subtract(CALENDAR_SCROLL_BATCH_DAYS, 'days')
          .format('YYYY-MM-DD');
        this.calendarDayCount += CALENDAR_SCROLL_BATCH_DAYS;
        this.$nextTick(() => {
          scroller.scrollLeft += scroller.scrollWidth - previousWidth;
        });
      }
      if (nearEnd) {
        this.calendarDayCount += CALENDAR_SCROLL_BATCH_DAYS;
      }
    },
    laneForTodo(todo: TodoItem): string {
      if (!todo.dueTime) return 'anytime';
      const hour = Number(todo.dueTime.split(':')[0]);
      if (hour < 12) return 'morning';
      if (hour < 17) return 'afternoon';
      return 'evening';
    },
    todosForDayLane(day: CalendarDay, lane: string): TodoItem[] {
      return this.activeTodos.filter(
        todo => todo.dueDate === day.date && this.laneForTodo(todo) === lane
      );
    },
  },
};
</script>

<style scoped>
.todos-page {
  color: #0f172a;
}

.todos-header,
.todo-section-header,
.todo-calendar-toolbar,
.todo-matrix-header,
.todo-plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.todos-header-actions,
.editor-actions,
.repeat-every-row,
.todo-priority-flags,
.todo-plan-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.todo-workspace {
  display: block;
}

.todo-main {
  min-width: 0;
}

.todo-editor,
.todo-section,
.todo-plan-view,
.todo-calendar-view,
.todo-matrix-view {
  border: 1px solid rgba(148, 163, 184, 0.38);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  padding: 1rem;
}

.todo-editor--modal {
  padding: 0;
  border: 0;
  background: transparent;
}

.section-label {
  color: #475569;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.repeat-every-row .form-control {
  max-width: 7rem;
}

.todo-priority-flags {
  flex-wrap: wrap;
  row-gap: 0.6rem;
  margin-bottom: 1rem;
}

.todo-priority-flag {
  display: inline-flex;
  align-items: center;
  min-width: 8.4rem;
  min-height: 2.25rem;
  padding: 0.45rem 0.75rem 0.45rem 2.6rem;
  border: 1px solid rgba(148, 163, 184, 0.38);
  border-radius: 7px;
  background: rgba(248, 250, 252, 0.88);
  font-weight: 700;
}

::v-deep .todo-priority-flag .custom-control-label {
  line-height: 1.2;
}

.todo-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.6rem;
  padding: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-left: 5px solid #10b981;
  border-radius: 8px;
  background: #ffffff;
  cursor: default;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.todo-card:hover {
  border-color: rgba(16, 185, 129, 0.55);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.todo-card--due {
  border-left-color: #10b981;
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.86), #ffffff);
}

.todo-card--upcoming {
  border-left-color: #3b82f6;
}

.todo-card--done {
  cursor: default;
  opacity: 0.72;
}

.todo-card--checking,
.todo-plan-card--checking,
.todo-mini-card--checking,
.todo-matrix-card--checking {
  border-color: rgba(16, 185, 129, 0.75);
  box-shadow: 0 8px 22px rgba(16, 185, 129, 0.18);
}

.todo-card-main {
  min-width: 0;
}

.todo-card-title-row,
.todo-card-meta,
.todo-mini-meta,
.todo-mini-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.todo-card-title-row strong,
.todo-mini-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-check-button {
  appearance: none;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  padding: 0;
  border: 2px solid #94a3b8;
  border-radius: 6px;
  background: #ffffff;
  color: #ffffff;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease,
    transform 140ms ease;
}

.todo-check-button .fa-icon {
  margin: 0;
  opacity: 0;
  transform: scale(0.64);
  transition: opacity 120ms ease, transform 120ms ease;
}

.todo-check-button:hover {
  border-color: #10b981;
  background: #ecfdf5;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
}

.todo-check-button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.34);
  outline-offset: 2px;
}

.todo-check-button:disabled {
  cursor: default;
  opacity: 1;
}

.todo-check-button--mini {
  width: 1.24rem;
  height: 1.24rem;
  border-radius: 5px;
}

.todo-check-button--action {
  width: 2.15rem;
  height: 2rem;
}

.todo-check-button--complete,
.todo-check-button--done {
  border-color: #10b981;
  background: #10b981;
  color: #ffffff;
  animation: todo-check-pop 220ms ease;
}

.todo-check-button--complete .fa-icon,
.todo-check-button--done .fa-icon {
  opacity: 1;
  transform: scale(1);
}

.todo-check-button--done {
  cursor: default;
}

.todo-card-meta,
.todo-card-notes,
.todo-mini-meta {
  margin-top: 0.25rem;
  color: #64748b;
  font-size: 0.84rem;
}

.todo-area-dot {
  flex: 0 0 auto;
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 999px;
}

.todo-card-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.35rem;
}

.todo-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 1.6rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-weight: 800;
}

.todo-empty {
  margin-top: 0.75rem;
  color: #64748b;
}

.todo-calendar-view {
  overflow: hidden;
}

.todo-plan-header {
  margin-bottom: 0.9rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.todo-plan-toolbar {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.todo-frog-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  margin-top: 1.35rem;
  padding: 1.25rem 0.95rem 0.95rem;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.92), rgba(253, 242, 248, 0.82));
  box-shadow: 0 12px 28px rgba(16, 185, 129, 0.11);
  overflow: visible;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease,
    transform 140ms ease;
}

.todo-frog-card--empty {
  border-color: rgba(236, 72, 153, 0.28);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(253, 242, 248, 0.78));
}

.todo-frog-card--drop-active {
  border-style: dashed;
  border-color: rgba(236, 72, 153, 0.68);
  box-shadow: 0 14px 30px rgba(236, 72, 153, 0.14);
}

.todo-frog-card--drop-over {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.98), rgba(253, 242, 248, 0.96));
  border-color: #ec4899;
  box-shadow: 0 16px 34px rgba(236, 72, 153, 0.2);
  transform: translateY(-1px);
}

.todo-frog-card--eaten {
  background: linear-gradient(135deg, rgba(240, 253, 244, 0.94), rgba(255, 241, 242, 0.88));
  border-color: rgba(4, 120, 87, 0.52);
}

.todo-frog-illustration {
  position: relative;
  width: 13.8rem;
  height: 7.25rem;
  flex: 0 0 auto;
  overflow: visible;
  border: 1px solid rgba(16, 185, 129, 0.26);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.14);
  isolation: isolate;
}

.todo-frog-illustration::after {
  position: absolute;
  right: 1.05rem;
  bottom: 0.42rem;
  left: 1.05rem;
  height: 0.62rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.13);
  content: '';
  filter: blur(5px);
  opacity: 0.72;
  transform: scaleX(0.82);
  z-index: 0;
}

.todo-frog-photo {
  position: absolute;
  right: -0.42rem;
  bottom: -0.34rem;
  display: block;
  width: 114%;
  height: 114%;
  margin: 0;
  object-fit: contain;
  object-position: center bottom;
  transform-origin: center;
  transition: filter 180ms ease, opacity 180ms ease, transform 180ms ease;
  user-select: none;
  -webkit-user-drag: none;
  z-index: 1;
}

.todo-frog-illustration--ready .todo-frog-photo {
  animation: frog-ready-bob 2.8s ease-in-out infinite;
  bottom: -0.42rem;
  right: -0.72rem;
  width: 128%;
  height: 128%;
  object-position: center bottom;
}

.todo-frog-illustration--ready::after {
  animation: frog-shadow-pulse 2.8s ease-in-out infinite;
}

.todo-frog-photo--eaten {
  width: 100%;
  height: 100%;
  right: 0;
  bottom: 0;
  margin: 0;
  object-position: center;
}

.todo-frog-card--eaten .todo-frog-photo {
  animation: frog-eaten-pop 520ms ease both;
  filter: saturate(1.08) contrast(1.03);
  opacity: 1;
}

.todo-frog-card--eaten .todo-frog-illustration {
  overflow: hidden;
}

.todo-frog-confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.todo-confetti {
  position: absolute;
  left: var(--confetti-left);
  top: var(--confetti-top);
  width: 0.42rem;
  height: 0.72rem;
  border-radius: 2px;
  background: var(--confetti-color);
  opacity: 0;
  transform-origin: center;
  animation: frog-confetti-burst 920ms ease-out var(--confetti-delay) both;
}

.todo-confetti--1 {
  --confetti-left: 12%;
  --confetti-top: 62%;
  --confetti-color: #ec4899;
  --confetti-delay: 0ms;
  --confetti-x: -1.2rem;
  --confetti-y: -4.2rem;
  --confetti-rotate: 210deg;
}

.todo-confetti--2 {
  --confetti-left: 21%;
  --confetti-top: 50%;
  --confetti-color: #10b981;
  --confetti-delay: 35ms;
  --confetti-x: -0.5rem;
  --confetti-y: -3.4rem;
  --confetti-rotate: -160deg;
}

.todo-confetti--3 {
  --confetti-left: 31%;
  --confetti-top: 58%;
  --confetti-color: #2563eb;
  --confetti-delay: 20ms;
  --confetti-x: -0.1rem;
  --confetti-y: -4.7rem;
  --confetti-rotate: 190deg;
}

.todo-confetti--4 {
  --confetti-left: 42%;
  --confetti-top: 47%;
  --confetti-color: #f59e0b;
  --confetti-delay: 70ms;
  --confetti-x: 0.45rem;
  --confetti-y: -3.9rem;
  --confetti-rotate: -220deg;
}

.todo-confetti--5 {
  --confetti-left: 53%;
  --confetti-top: 58%;
  --confetti-color: #ec4899;
  --confetti-delay: 15ms;
  --confetti-x: 0.85rem;
  --confetti-y: -4.5rem;
  --confetti-rotate: 260deg;
}

.todo-confetti--6 {
  --confetti-left: 64%;
  --confetti-top: 49%;
  --confetti-color: #10b981;
  --confetti-delay: 45ms;
  --confetti-x: 1.15rem;
  --confetti-y: -3.6rem;
  --confetti-rotate: -180deg;
}

.todo-confetti--7 {
  --confetti-left: 75%;
  --confetti-top: 60%;
  --confetti-color: #8b5cf6;
  --confetti-delay: 5ms;
  --confetti-x: 1.35rem;
  --confetti-y: -4.1rem;
  --confetti-rotate: 230deg;
}

.todo-confetti--8 {
  --confetti-left: 84%;
  --confetti-top: 52%;
  --confetti-color: #f97316;
  --confetti-delay: 80ms;
  --confetti-x: 1.05rem;
  --confetti-y: -3.2rem;
  --confetti-rotate: -250deg;
}

.todo-confetti--9 {
  --confetti-left: 17%;
  --confetti-top: 72%;
  --confetti-color: #38bdf8;
  --confetti-delay: 95ms;
  --confetti-x: -1rem;
  --confetti-y: -2.8rem;
  --confetti-rotate: 160deg;
}

.todo-confetti--10 {
  --confetti-left: 36%;
  --confetti-top: 76%;
  --confetti-color: #f43f5e;
  --confetti-delay: 55ms;
  --confetti-x: -0.25rem;
  --confetti-y: -3.1rem;
  --confetti-rotate: -210deg;
}

.todo-confetti--11 {
  --confetti-left: 60%;
  --confetti-top: 75%;
  --confetti-color: #22c55e;
  --confetti-delay: 105ms;
  --confetti-x: 0.55rem;
  --confetti-y: -2.8rem;
  --confetti-rotate: 180deg;
}

.todo-confetti--12 {
  --confetti-left: 80%;
  --confetti-top: 73%;
  --confetti-color: #fde047;
  --confetti-delay: 40ms;
  --confetti-x: 1rem;
  --confetti-y: -3.15rem;
  --confetti-rotate: -190deg;
}

.todo-frog-content {
  position: relative;
  z-index: 2;
  min-width: 0;
}

.todo-frog-copy {
  margin: 0.15rem 0 0;
  color: #0f172a;
  font-size: 1rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-frog-meta,
.todo-frog-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.45rem;
}

.todo-frog-meta {
  flex-wrap: wrap;
  color: #475569;
  font-size: 0.86rem;
  font-weight: 700;
}

.todo-frog-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.7rem;
}

.todo-frog-pill {
  appearance: none;
  display: inline-flex;
  align-items: center;
  max-width: 15rem;
  min-height: 2rem;
  gap: 0.38rem;
  padding: 0.38rem 0.62rem;
  border: 1px solid rgba(148, 163, 184, 0.44);
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease, transform 120ms ease;
}

.todo-frog-pill span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-frog-pill:hover {
  border-color: rgba(16, 185, 129, 0.72);
  background: #ecfdf5;
  color: #064e3b;
  transform: translateY(-1px);
}

.todo-frog-pill--active {
  border-color: #ec4899;
  background: #fdf2f8;
  color: #831843;
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.11);
}

.todo-frog-pill-dot {
  flex: 0 0 auto;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
}

.todo-plan-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
  gap: 0.9rem;
}

.todo-plan-panel {
  min-width: 0;
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  background: #ffffff;
}

.todo-plan-panel--selected {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.72), #ffffff 45%);
}

.todo-plan-panel--available {
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.78), #ffffff 45%);
}

.todo-plan-subtle {
  color: #64748b;
  font-weight: 700;
}

.todo-plan-list {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.todo-plan-card,
.todo-plan-choice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: flex-start;
  padding: 0.72rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-left: 5px solid;
  border-radius: 8px;
  background: #ffffff;
  cursor: grab;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
  user-select: none;
}

.todo-plan-choice {
  grid-template-columns: minmax(0, 1fr) auto;
  margin-top: 0.6rem;
}

.todo-plan-card:hover,
.todo-plan-choice:hover {
  border-color: rgba(16, 185, 129, 0.55);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.todo-plan-card--frog {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.92), rgba(253, 242, 248, 0.62));
  box-shadow: 0 8px 20px rgba(236, 72, 153, 0.1);
}

.todo-plan-card--dragging,
.todo-plan-choice--dragging {
  opacity: 0.52;
  transform: scale(0.98);
}

.todo-frog-badge {
  flex: 0 0 auto;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: #fdf2f8;
  color: #be185d;
  font-size: 0.68rem;
  font-weight: 900;
  text-transform: uppercase;
}

.todo-plan-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: #10b981;
  color: #ffffff;
  font-weight: 800;
}

.todo-plan-actions {
  display: grid;
  grid-template-columns: repeat(2, 2.15rem);
  gap: 0.35rem;
}

.todo-plan-actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding-right: 0;
  padding-left: 0;
}

.todo-calendar-toolbar {
  justify-content: flex-start;
  margin-bottom: 0.85rem;
}

.todo-calendar-scroll {
  padding-bottom: 0.35rem;
  overflow-x: auto;
  overflow-y: hidden;
}

.todo-calendar-grid {
  display: flex;
  min-width: max-content;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  overflow: hidden;
}

.todo-calendar-day {
  position: relative;
  flex: 0 0 12rem;
  min-height: 34rem;
  border-right: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(248, 250, 252, 0.72);
}

.todo-calendar-day:last-child {
  border-right: 0;
}

.todo-calendar-day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 3.2rem;
  padding: 0.65rem 0.75rem;
  background: #ffffff;
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
}

.todo-calendar-day-header--today {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.95), rgba(255, 255, 255, 0.95));
}

.todo-calendar-day--focus::before,
.todo-calendar-day--today::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 4px;
  content: '';
}

.todo-calendar-day--focus::before {
  background: #db2777;
}

.todo-calendar-day--today::before {
  background: #10b981;
}

.todo-calendar-day--today .todo-calendar-day-header,
.todo-calendar-day--today .todo-calendar-lane,
.todo-calendar-day--focus .todo-calendar-day-header,
.todo-calendar-day--focus .todo-calendar-lane {
  padding-left: 0.9rem;
}

.todo-calendar-lane {
  min-height: 7.7rem;
  padding: 0.55rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  cursor: cell;
  transition: background 120ms ease;
}

.todo-calendar-lane:hover {
  background: rgba(16, 185, 129, 0.06);
}

.todo-calendar-lane--active {
  outline: 1px dashed rgba(16, 185, 129, 0.48);
  outline-offset: -4px;
}

.todo-calendar-lane--over {
  background: rgba(16, 185, 129, 0.12);
  box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.72);
}

.todo-calendar-lane:last-child {
  border-bottom: 0;
}

.todo-calendar-lane-label {
  margin-bottom: 0.4rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.todo-mini-card {
  margin-bottom: 0.45rem;
  padding: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-left: 4px solid;
  border-radius: 7px;
  background: #ffffff;
  cursor: grab;
}

.todo-mini-card:hover {
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.todo-mini-card--dragging {
  opacity: 0.48;
  transform: scale(0.98);
}

.todo-matrix-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.todo-matrix-quadrant {
  min-height: 17rem;
  padding: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-top: 5px solid #94a3b8;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.76);
}

.todo-matrix-quadrant--do {
  border-top-color: #10b981;
}

.todo-matrix-quadrant--schedule {
  border-top-color: #3b82f6;
}

.todo-matrix-quadrant--delegate {
  border-top-color: #f59e0b;
}

.todo-matrix-quadrant--later {
  border-top-color: #ec4899;
}

.todo-matrix-axis {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.todo-matrix-body {
  min-height: 11rem;
  margin-top: 0.55rem;
  padding: 0.1rem;
  border-radius: 7px;
  cursor: cell;
  transition: background 120ms ease;
}

.todo-matrix-body:hover {
  background: rgba(16, 185, 129, 0.06);
}

.todo-matrix-body--active {
  outline: 1px dashed rgba(16, 185, 129, 0.55);
  outline-offset: 3px;
}

.todo-matrix-body--over {
  background: rgba(16, 185, 129, 0.12);
  box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.72);
}

.todo-matrix-card {
  margin-top: 0.55rem;
  padding: 0.62rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-left: 4px solid;
  border-radius: 7px;
  background: #ffffff;
  cursor: grab;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.todo-matrix-card:hover {
  border-color: rgba(16, 185, 129, 0.55);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.todo-matrix-card--dragging {
  opacity: 0.48;
  transform: scale(0.98);
}

.todo-drag-handle {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  color: #94a3b8;
  cursor: grab;
}

.todo-matrix-body .todo-empty {
  cursor: cell;
}

.todo-matrix-actions {
  justify-content: flex-end;
  margin-top: 0.55rem;
}

@media (max-width: 900px) {
  .todo-workspace {
    grid-template-columns: 1fr;
  }

  .todo-plan-layout {
    grid-template-columns: 1fr;
  }

  .todos-header {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }

  .todo-matrix-grid {
    grid-template-columns: 1fr;
  }

  .todo-card {
    flex-direction: column;
  }

  .todo-plan-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .todo-plan-card,
  .todo-plan-choice {
    grid-template-columns: 1fr;
  }

  .todo-frog-card {
    grid-template-columns: 1fr;
  }

  .todo-frog-illustration {
    justify-self: center;
  }

  .todo-plan-actions {
    display: flex;
    flex-wrap: wrap;
  }
}

@keyframes todo-check-pop {
  0% {
    transform: scale(0.82);
  }

  64% {
    transform: scale(1.12);
  }

  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .todo-check-button,
  .todo-check-button .fa-icon,
  .todo-card,
  .todo-mini-card,
  .todo-matrix-card,
  .todo-plan-card,
  .todo-plan-choice,
  .todo-frog-card {
    transition: none;
  }

  .todo-frog-illustration--ready .todo-frog-photo,
  .todo-frog-illustration--ready::after,
  .todo-frog-card--eaten .todo-frog-photo {
    animation: none;
  }

  .todo-confetti {
    display: none;
  }

  .todo-check-button--complete,
  .todo-check-button--done {
    animation: none;
  }
}

@keyframes frog-ready-bob {
  0%,
  100% {
    transform: translate3d(0, -0.24rem, 0) rotate(-1.2deg) scale(1.01);
  }

  50% {
    transform: translate3d(0.08rem, -0.74rem, 0) rotate(-2.4deg) scale(1.045);
  }
}

@keyframes frog-shadow-pulse {
  0%,
  100% {
    opacity: 0.72;
    transform: scaleX(0.82);
  }

  50% {
    opacity: 0.44;
    transform: scaleX(0.64);
  }
}

@keyframes frog-eaten-pop {
  0% {
    transform: scale(0.94);
  }

  58% {
    transform: scale(1.035);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes frog-confetti-burst {
  0% {
    opacity: 0;
    transform: translate3d(0, 0.45rem, 0) scale(0.4) rotate(0deg);
  }

  18% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate3d(var(--confetti-x), var(--confetti-y), 0) scale(1)
      rotate(var(--confetti-rotate));
  }
}
</style>
