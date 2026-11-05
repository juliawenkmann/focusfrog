<template lang="pug">
div.todos-page
  div.todos-header
    div
      h3.mb-1 Todos
      div.todo-header-meta
        div.text-muted {{ todoSummary }}
        div.todo-done-counter(aria-live="polite")
          icon(name="check-circle")
          strong {{ doneTodoCount }}
          span {{ doneTodoLabel }}
          span.todo-done-counter-today(v-if="doneTodayCount > 0") {{ doneTodayCount }} today
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
        b-form-group(label="Project (optional)" label-for="todo-project")
          div.todo-project-field
            b-form-select#todo-project(v-model="draft.projectId" :options="projectOptions")
            b-button(
              variant="outline-secondary"
              type="button"
              @click="creatingEditorProject = !creatingEditorProject"
            )
              icon.mr-1(name="plus")
              | Project
          div.todo-project-composer.todo-project-composer--editor(v-if="creatingEditorProject")
            b-form-input(
              v-model.trim="editorProjectName"
              placeholder="Project name"
              autocomplete="off"
              @keyup.enter.stop.prevent="createEditorProject"
            )
            div.todo-project-color-picker(aria-label="Project color")
              button.todo-project-color(
                v-for="color in projectColors"
                :key="'editor-' + color"
                type="button"
                :class="{ 'todo-project-color--active': editorProjectColor === color }"
                :style="{ background: color }"
                :aria-label="'Use color ' + color"
                @click="editorProjectColor = color"
              )
            b-button(
              size="sm"
              variant="primary"
              type="button"
              :disabled="!editorProjectName"
              @click="createEditorProject"
            ) Create
        div.editor-grid
          b-form-group(label="Due date (optional)" label-for="todo-due-date")
            b-form-input#todo-due-date(v-model="draft.dueDate" type="date")
          b-form-group(label="Time (optional)" label-for="todo-due-time")
            b-form-input#todo-due-time(
              v-model="draft.dueTime"
              type="time"
              :disabled="!draft.dueDate"
            )
        div.editor-grid
          b-form-group(label="Area" label-for="todo-area")
            b-form-select#todo-area(v-model="draft.area" :options="areaOptions")
          b-form-group(label="Repeat" label-for="todo-repeat")
            b-form-select#todo-repeat(
              v-model="draft.repeat"
              :options="repeatOptions"
              :disabled="!draft.dueDate"
            )
        b-form-group(
          v-if="draft.dueDate && draft.repeat === 'custom'"
          label="Every"
          label-for="todo-repeat-every"
        )
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

  section.todo-project-browser.mt-3
    div.todo-project-browser-header
      div
        div.section-label Organize
        h5.mb-0 Projects
        p.todo-project-help(v-if="projectEditMode") Rename, recolor or delete projects. Todos of a deleted project move to the Inbox.
        p.todo-project-help(v-else) Click the project tag on any todo to move it to another project.
      div.todo-project-browser-actions
        b-button(
          v-if="projects.length > 0"
          size="sm"
          :variant="projectEditMode ? 'primary' : 'outline-secondary'"
          type="button"
          :aria-pressed="projectEditMode ? 'true' : 'false'"
          @click="projectEditMode = !projectEditMode"
        )
          icon.mr-1(:name="projectEditMode ? 'check' : 'pen'")
          | {{ projectEditMode ? 'Done' : 'Edit projects' }}
        b-button(
          size="sm"
          variant="outline-secondary"
          type="button"
          @click="toggleProjectComposer"
        )
          icon.mr-1(name="plus")
          | New project
    form.todo-project-composer(
      v-if="projectComposerOpen"
      @submit.prevent="createProjectFromBrowser"
    )
      b-form-input(
        v-model.trim="newProjectName"
        placeholder="e.g. Thesis, FocusFrog, Apartment"
        autocomplete="off"
      )
      div.todo-project-color-picker(aria-label="Project color")
        button.todo-project-color(
          v-for="color in projectColors"
          :key="color"
          type="button"
          :class="{ 'todo-project-color--active': newProjectColor === color }"
          :style="{ background: color }"
          :aria-label="'Use color ' + color"
          @click="newProjectColor = color"
        )
      b-button(size="sm" variant="primary" type="submit" :disabled="!newProjectName")
        | Create project
    div.todo-project-editor(v-if="projectEditMode && projects.length > 0")
      div.todo-project-edit-row(v-for="project in projectsWithCounts" :key="'edit-' + project.id")
        span.todo-project-pill-dot(:style="{ background: project.color }")
        input.form-control.form-control-sm.todo-project-edit-name(
          :value="project.name"
          :aria-label="'Rename ' + project.name"
          autocomplete="off"
          @change="renameProject(project.id, $event.target)"
          @keyup.enter="$event.target.blur()"
        )
        div.todo-project-color-picker(:aria-label="'Color for ' + project.name")
          button.todo-project-color(
            v-for="color in projectColors"
            :key="project.id + '-' + color"
            type="button"
            :class="{ 'todo-project-color--active': project.color === color }"
            :style="{ background: color }"
            :aria-label="'Use color ' + color + ' for ' + project.name"
            @click="recolorProject(project.id, color)"
          )
        span.todo-project-edit-count {{ project.todoCount === 1 ? '1 todo' : project.todoCount + ' todos' }}
        b-button(
          size="sm"
          variant="outline-danger"
          type="button"
          :title="'Delete ' + project.name"
          @click="deleteProject(project.id)"
        )
          icon(name="trash")
    nav.todo-project-list(v-else aria-label="Filter todos by project")
      button.todo-project-pill(
        type="button"
        :class="{ 'todo-project-pill--active': activeProjectFilter === 'all' }"
        @click="selectProjectFilter('all')"
      )
        icon(name="tasks")
        span All todos
        span.todo-project-pill-count {{ allActiveTodos.length }}
      button.todo-project-pill(
        type="button"
        :class="{ 'todo-project-pill--active': activeProjectFilter === 'inbox' }"
        @click="selectProjectFilter('inbox')"
      )
        span.todo-project-pill-dot.todo-project-pill-dot--inbox
        span Inbox
        span.todo-project-pill-count {{ inboxTodoCount }}
      button.todo-project-pill(
        v-for="project in projectsWithCounts"
        :key="project.id"
        type="button"
        :class="{ 'todo-project-pill--active': activeProjectFilter === project.id }"
        @click="selectProjectFilter(project.id)"
      )
        span.todo-project-pill-dot(:style="{ background: project.color }")
        span {{ project.name }}
        span.todo-project-pill-count {{ project.todoCount }}

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
            :style="todoColorStyle(todo, false)"
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
                button.todo-project-tag.todo-project-tag--button(
                  type="button"
                  :class="{ 'todo-project-tag--empty': !todoProject(todo) }"
                  :title="todoProject(todo) ? 'Change project' : 'Add to a project'"
                  :aria-label="projectTagAriaLabel(todo)"
                  @click.stop="openProjectMenu(todo, $event)"
                )
                  span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                  span {{ todoProject(todo) ? projectLabel(todo.projectId) : 'Project' }}
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
            :class="[{ 'todo-card--checking': isCompleting(todo) }, projectColorClass(todo)]"
            :style="todoColorStyle(todo, false)"
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
                button.todo-project-tag.todo-project-tag--button(
                  type="button"
                  :class="{ 'todo-project-tag--empty': !todoProject(todo) }"
                  :title="todoProject(todo) ? 'Change project' : 'Add to a project'"
                  :aria-label="projectTagAriaLabel(todo)"
                  @click.stop="openProjectMenu(todo, $event)"
                )
                  span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                  span {{ todoProject(todo) ? projectLabel(todo.projectId) : 'Project' }}
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
                span.todo-project-tag(v-if="todoProject(todo)")
                  span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                  | {{ projectLabel(todo.projectId) }}
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
        div.todo-plan-projects(v-if="planProgressTotal > 0 || projects.length > 0")
          div.todo-progress-card(
            v-if="planProgressTotal > 0"
            :class="{ 'todo-progress-card--complete': planProgressComplete }"
          )
            div.todo-progress-ring(ref="progressRing" role="img" :aria-label="planMixLabel")
              svg.todo-progress-ring-svg(viewBox="0 0 100 100" aria-hidden="true")
                defs
                  linearGradient#todo-progress-ring-gradient(x1="0" y1="0" x2="1" y2="1")
                    stop(offset="0%" stop-color="#bef264")
                    stop(offset="50%" stop-color="#10b981")
                    stop(offset="100%" stop-color="#06b6d4")
                circle.todo-progress-ring-track(cx="50" cy="50" :r="progressRingRadius")
                circle.todo-progress-ring-value(
                  cx="50"
                  cy="50"
                  :r="progressRingRadius"
                  :stroke-dasharray="progressRingCircumference"
                  :stroke-dashoffset="progressRingOffset"
                  :opacity="displayedProgress > 0.002 ? 1 : 0"
                )
              div.todo-progress-ring-center
                template(v-if="planProgressComplete")
                  svg.todo-progress-ring-check(viewBox="0 0 24 24" aria-hidden="true")
                    path(d="M5 12.5l4.5 4.5L19 7.5")
                  span.todo-progress-ring-sub Done!
                template(v-else)
                  strong.todo-progress-ring-percent {{ displayedProgressPercent }}%
                  span.todo-progress-ring-sub {{ planProgressDone }}/{{ planProgressTotal }}
            div.todo-progress-head
              div.section-label Today's progress
              transition(name="todo-cheer" mode="out-in")
                div.todo-progress-cheer(:key="progressCheer" aria-live="polite") {{ progressCheer }}
            div.todo-progress-tiles(
              :class="{ 'todo-progress-tiles--intro': progressIntro }"
              aria-hidden="true"
            )
              div.todo-progress-group(
                v-for="group in progressTileGroups"
                :key="'group-' + group.id"
                :style="group.style"
                :title="group.name + ': ' + group.done + ' of ' + group.count + ' done'"
              )
                span.todo-progress-tile(
                  v-for="(tile, index) in group.tiles"
                  :key="tile.key"
                  :class="{ 'todo-progress-tile--done': tile.done, 'todo-progress-tile--fresh': progressPulseShareId === group.id && index === group.done - 1 }"
                  :style="{ '--i': tile.order }"
                )
                  svg.todo-progress-tile-check(v-if="tile.done" viewBox="0 0 16 16")
                    path(d="M3.5 8.5l3 3 6-7")
                  span.todo-progress-burst(
                    v-if="progressPulseShareId === group.id && index === group.done - 1"
                    :key="'burst-' + progressPulseKey"
                  )
                    span.todo-progress-spark(
                      v-for="spark in progressSparks"
                      :key="spark.key"
                      :style="spark.style"
                    )
                    span.todo-progress-plus +1
            div.todo-progress-confetti(
              v-if="progressCelebrationKey > 0"
              :key="'confetti-' + progressCelebrationKey"
              aria-hidden="true"
            )
              span.todo-progress-confetto(
                v-for="piece in progressConfetti"
                :key="piece.key"
                :style="piece.style"
              )
            div.todo-plan-achievements(v-if="doneTodayTodos.length > 0")
              span.todo-plan-achievements-label
                icon(name="trophy")
                | Done today
              span.todo-achievement-chip(
                v-for="todo in visibleDoneTodayTodos"
                :key="'done-' + todo.id"
                :class="{ 'todo-achievement-chip--new': todo.id === latestDoneTodoId }"
                :style="achievementChipStyle(todo)"
                :title="todo.title + ' · ' + planDoneLabel(todo)"
              )
                icon(name="check")
                span.todo-achievement-title {{ todo.title }}
              span.todo-achievement-more(
                v-if="hiddenDoneTodayCount > 0"
                :title="hiddenDoneTodayTitles"
              ) +{{ hiddenDoneTodayCount }} more
          div.todo-plan-filter(
            v-if="projects.length > 0"
            role="group"
            aria-label="Filter the day plan by project"
          )
            span.todo-plan-filter-label
              icon(name="filter")
              | Show
            button.todo-plan-filter-chip(
              type="button"
              :class="{ 'todo-plan-filter-chip--active': activeProjectFilter === 'all' }"
              :aria-pressed="activeProjectFilter === 'all' ? 'true' : 'false'"
              @click="selectProjectFilter('all')"
            )
              span All projects
              span.todo-plan-filter-count(
                :class="{ 'todo-plan-filter-count--progress': planProgressDone > 0, 'todo-plan-filter-count--complete': planProgressComplete }"
              ) {{ progressCountLabel(planProgressDone, planProgressTotal) }}
            button.todo-plan-filter-chip(
              v-for="option in planFilterOptions"
              :key="'plan-filter-' + option.id"
              type="button"
              :class="{ 'todo-plan-filter-chip--active': activeProjectFilter === option.id, 'todo-plan-filter-chip--idle': option.count === 0 }"
              :style="{ '--chip-color': option.color, '--chip-tint': option.tint }"
              :aria-pressed="activeProjectFilter === option.id ? 'true' : 'false'"
              :title="option.count === 0 ? 'Nothing planned' : option.done + ' of ' + option.count + ' done today'"
              @click="selectProjectFilter(activeProjectFilter === option.id ? 'all' : option.id)"
            )
              span.todo-project-pill-dot(
                :class="{ 'todo-project-pill-dot--inbox': option.id === 'inbox' }"
                :style="option.id === 'inbox' ? {} : { background: option.color }"
              )
              span {{ option.name }}
              span.todo-plan-filter-count(
                :class="{ 'todo-plan-filter-count--progress': option.done > 0, 'todo-plan-filter-count--complete': option.count > 0 && option.done === option.count }"
              ) {{ progressCountLabel(option.done, option.count) }}
        div.todo-plan-layout
          section.todo-plan-panel.todo-plan-panel--selected
            div.todo-section-header
              div
                div.section-label Order
                h5.mb-0 Plan day
              span.todo-plan-subtle {{ planProgressLabel }}
            div.todo-frog-card(
              :class="{ 'todo-frog-card--empty': !frogTodo && !frogIsEaten, 'todo-frog-card--drop-active': draggedFrogTodoId || draggedPlanTodoId, 'todo-frog-card--drop-over': frogDropActive, 'todo-frog-card--eaten': frogIsEaten, 'todo-frog-card--can-wake': frogIsEaten && openPlannedTodos.length > 0, 'todo-frog-card--waking': frogJustWoke }"
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
                div.todo-frog-wake-glow(v-if="frogJustWoke" aria-hidden="true")
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
                h5.mb-1(v-if="frogDropActive && frogIsEaten") Let go to wake the frog
                h5.mb-1(v-else-if="frogJustWoke") Frog awake!
                h5.mb-1(v-else-if="frogIsEaten") Frog eaten today
                h5.mb-1(v-else-if="frogTodo") Eat this frog first
                h5.mb-1(v-else) Pick your frog
                p.todo-frog-copy(v-if="frogDropActive && frogIsEaten") This task becomes your new frog.
                p.todo-frog-copy(v-else-if="frogIsEaten") {{ frogEatenCopy }}
                p.todo-frog-copy(v-else-if="frogTodo") {{ frogTodo.title }}
                p.todo-frog-copy(v-else) Drag a todo here or select one below.
                p.todo-frog-wake-hint(v-if="frogIsEaten && openPlannedTodos.length > 0")
                  icon.mr-1(name="hand-pointer")
                  | Drag a task here to wake the frog, or tap one below.
                p.todo-frog-wake-hint(v-else-if="frogIsEaten")
                  icon.mr-1(name="plus-circle")
                  | Add another task to your plan to wake the frog.
                div.todo-frog-meta(v-if="frogTodo && !frogIsEaten")
                  span.todo-area-dot(:style="{ background: areaColor(frogTodo.area) }")
                  span {{ areaLabel(frogTodo.area) }}
                  span.todo-project-tag(v-if="todoProject(frogTodo)")
                    span.todo-project-tag-dot(:style="{ background: projectColor(frogTodo.projectId) }")
                    | {{ projectLabel(frogTodo.projectId) }}
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
              span.sr-only(aria-live="polite") {{ frogWakeAnnouncement }}
            div.todo-frog-picker(
              v-if="openPlannedTodos.length > 0"
              :aria-label="frogIsEaten ? 'Choose a task to wake the frog' : 'Choose frog of the day'"
            )
              button.todo-frog-pill(
                v-for="todo in openPlannedTodos"
                :key="'frog-' + todo.id"
                type="button"
                :class="{ 'todo-frog-pill--active': isFrogTodo(todo), 'todo-frog-pill--wake': frogIsEaten }"
                :title="frogIsEaten ? 'Wake the frog with ' + todo.title : 'Make ' + todo.title + ' the frog'"
                @click="selectFrogTodo(todo)"
              )
                span.todo-frog-pill-dot(:style="{ background: todoAccentColor(todo) }")
                span {{ todo.title }}
            div.todo-empty(v-if="plannedTodos.length === 0") No todos selected.
            div.todo-empty(v-else-if="visiblePlannedTodos.length === 0")
              | Nothing planned in {{ selectedProjectLabel }} today.
            div.todo-plan-list(v-if="visiblePlannedTodos.length > 0")
              div.todo-plan-card(
                v-for="todo in visiblePlannedTodos"
                :key="todo.id"
                :class="[{ 'todo-plan-card--checking': isCompleting(todo), 'todo-plan-card--done': isPlanTodoDone(todo), 'todo-plan-card--frog': isFrogTodo(todo), 'todo-plan-card--dragging': draggedFrogTodoId === todo.id || draggedPlanTodoId === todo.id, 'todo-plan-card--drop-before': planDropTargetId === todo.id && planDropPosition === 'before', 'todo-plan-card--drop-after': planDropTargetId === todo.id && planDropPosition === 'after' }, projectColorClass(todo)]"
                :style="todoColorStyle(todo)"
                :draggable="!isPlanTodoDone(todo)"
                @dragstart="startPlanDrag(todo, $event)"
                @dragover.prevent="handlePlanDragOver(todo, $event)"
                @dragenter.prevent="handlePlanDragOver(todo, $event)"
                @dragleave="handlePlanDragLeave(todo, $event)"
                @drop.prevent="dropTodoOnPlan(todo, $event)"
                @dragend="endPlanDrag"
                @mousedown="startFrogMouseDrag(todo, $event)"
                @pointerdown="startFrogPointerDrag(todo, $event)"
                @pointermove="handleFrogPointerMove($event)"
                @pointerup="endFrogPointerDrag($event)"
                @pointercancel="cancelFrogPointerDrag($event)"
              )
                div.todo-plan-index {{ planPositions[todo.id] }}
                div.todo-card-main
                  div.todo-card-title-row
                    span.todo-area-dot(:style="{ background: todoAccentColor(todo) }")
                    strong.todo-plan-title {{ todo.title }}
                    span.todo-frog-badge(v-if="isFrogTodo(todo) && !isPlanTodoDone(todo)") frog
                    span.todo-drag-handle(title="Drag to reorder")
                      icon(name="grip-lines")
                  div.todo-card-meta
                    span {{ areaLabel(todo.area) }}
                    button.todo-project-tag.todo-project-tag--button(
                      type="button"
                      :class="{ 'todo-project-tag--empty': !todoProject(todo) }"
                      :title="todoProject(todo) ? 'Change project' : 'Add to a project'"
                      :aria-label="projectTagAriaLabel(todo)"
                      @click.stop="openProjectMenu(todo, $event)"
                    )
                      span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                      span {{ todoProject(todo) ? projectLabel(todo.projectId) : 'Project' }}
                    span {{ dueLabel(todo) }}
                    span(v-if="isPlanTodoDone(todo)") {{ planDoneLabel(todo) }}
                    span(v-if="todo.repeat !== 'none'") {{ repeatLabel(todo) }}
                  div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
                div.todo-plan-actions
                  button.todo-check-button.todo-check-button--action(
                    type="button"
                    :class="{ 'todo-check-button--complete': isCompleting(todo), 'todo-check-button--done': isPlanTodoDone(todo) }"
                    :disabled="isCompleting(todo) || isPlanTodoDone(todo)"
                    :aria-label="isPlanTodoDone(todo) ? todo.title + ' is done' : 'Complete ' + todo.title"
                    :title="isPlanTodoDone(todo) ? 'Done' : 'Complete'"
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
            div.todo-plan-hidden(v-if="hiddenPlannedCount > 0")
              span {{ hiddenPlannedCount }} more planned in other projects
              b-button(size="sm" variant="link" type="button" @click="selectProjectFilter('all')") Show all
          section.todo-plan-panel.todo-plan-panel--available
            div.todo-section-header
              div
                div.section-label Choose
                h5.mb-0 Available todos
              span.todo-count {{ planCandidateTodos.length }}
            div.todo-empty(v-if="planCandidateTodos.length === 0") Nothing else available.
            div.todo-plan-choice-group(
              v-for="group in planCandidateGroups"
              :key="'choice-group-' + group.id"
            )
              div.todo-plan-choice-group-header
                span.todo-project-pill-dot(
                  :class="{ 'todo-project-pill-dot--inbox': group.id === 'inbox' }"
                  :style="group.id === 'inbox' ? {} : { background: group.color }"
                )
                span.todo-plan-choice-group-name {{ group.name }}
                span.todo-plan-choice-group-count {{ group.todos.length }}
              div.todo-plan-choice(
                v-for="todo in group.todos"
                :key="todo.id"
                :class="[{ 'todo-plan-choice--dragging': draggedFrogTodoId === todo.id }, projectColorClass(todo)]"
                :style="todoColorStyle(todo)"
                @mousedown="startFrogMouseDrag(todo, $event)"
                @pointerdown="startFrogPointerDrag(todo, $event)"
                @pointermove="handleFrogPointerMove($event)"
                @pointerup="endFrogPointerDrag($event)"
                @pointercancel="cancelFrogPointerDrag($event)"
              )
                div.todo-card-main
                  div.todo-card-title-row
                    span.todo-area-dot(:style="{ background: todoAccentColor(todo) }")
                    strong {{ todo.title }}
                  div.todo-card-meta
                    span {{ areaLabel(todo.area) }}
                    button.todo-project-tag.todo-project-tag--button(
                      type="button"
                      :class="{ 'todo-project-tag--empty': !todoProject(todo) }"
                      :title="todoProject(todo) ? 'Change project' : 'Add to a project'"
                      :aria-label="projectTagAriaLabel(todo)"
                      @click.stop="openProjectMenu(todo, $event)"
                    )
                      span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                      span {{ todoProject(todo) ? projectLabel(todo.projectId) : 'Project' }}
                    span {{ dueLabel(todo) }}
                    span(v-if="todo.repeat !== 'none'") {{ repeatShortLabel(todo) }}
                  div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
                div.todo-card-actions
                  b-button(
                    size="sm"
                    variant="primary"
                    type="button"
                    title="Add to today's plan"
                    @click="addToDayPlan(todo)"
                  )
                    icon.todo-add-icon(name="plus")
                    span.todo-add-label Add
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
                  :class="[{ 'todo-mini-card--checking': isCompleting(todo), 'todo-mini-card--dragging': draggedCalendarTodoId === todo.id }, projectColorClass(todo)]"
                  :style="todoColorStyle(todo)"
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
                    button.todo-project-tag.todo-project-tag--button(
                      type="button"
                      :class="{ 'todo-project-tag--empty': !todoProject(todo) }"
                      :title="todoProject(todo) ? 'Change project' : 'Add to a project'"
                      :aria-label="projectTagAriaLabel(todo)"
                      @click.stop="openProjectMenu(todo, $event)"
                    )
                      span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                      span(v-if="todoProject(todo)") {{ projectLabel(todo.projectId) }}
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
                :class="[{ 'todo-matrix-card--dragging': draggedMatrixTodoId === todo.id, 'todo-matrix-card--checking': isCompleting(todo) }, projectColorClass(todo)]"
                :style="todoColorStyle(todo)"
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
                  span.todo-area-dot(:style="{ background: todoAccentColor(todo) }")
                  strong {{ todo.title }}
                  span.todo-drag-handle(title="Drag to move")
                    icon(name="grip-lines")
                div.todo-mini-meta
                  span {{ areaLabel(todo.area) }}
                  button.todo-project-tag.todo-project-tag--button(
                    type="button"
                    :class="{ 'todo-project-tag--empty': !todoProject(todo) }"
                    :title="todoProject(todo) ? 'Change project' : 'Add to a project'"
                    :aria-label="projectTagAriaLabel(todo)"
                    @click.stop="openProjectMenu(todo, $event)"
                  )
                    span.todo-project-tag-dot(:style="{ background: projectColor(todo.projectId) }")
                    span {{ todoProject(todo) ? projectLabel(todo.projectId) : 'Project' }}
                  span {{ dueLabel(todo) }}
                  span(v-if="todo.repeat !== 'none'") {{ repeatShortLabel(todo) }}
                div.todo-card-notes(v-if="todo.notes") {{ todo.notes }}
                div.todo-card-actions.todo-matrix-actions
                  b-button(size="sm" variant="outline-secondary" @click.stop="editTodo(todo)" title="Edit")
                    icon(name="pen")
                  b-button(size="sm" variant="outline-danger" @click.stop="deleteTodo(todo.id)" title="Delete")
                    icon(name="trash")

  div.todo-project-menu(
    v-if="projectMenuTodo"
    ref="projectMenu"
    role="dialog"
    aria-label="Choose a project"
    :style="{ top: projectMenuTop + 'px', left: projectMenuLeft + 'px' }"
  )
    div.todo-project-menu-title
      span Project for
      strong {{ projectMenuTodo.title }}
    div.todo-project-menu-list(role="menu")
      button.todo-project-menu-item(
        v-for="project in projects"
        :key="'menu-' + project.id"
        type="button"
        role="menuitemradio"
        :aria-checked="projectMenuTodo.projectId === project.id ? 'true' : 'false'"
        :class="{ 'todo-project-menu-item--active': projectMenuTodo.projectId === project.id }"
        :style="{ '--chip-tint': projectTint(project.color, 0.14) }"
        @click="assignTodoProject(projectMenuTodo.id, project.id)"
      )
        span.todo-project-pill-dot(:style="{ background: project.color }")
        span.todo-project-menu-name {{ project.name }}
        icon(v-if="projectMenuTodo.projectId === project.id" name="check")
      button.todo-project-menu-item(
        type="button"
        role="menuitemradio"
        :aria-checked="todoProject(projectMenuTodo) ? 'false' : 'true'"
        :class="{ 'todo-project-menu-item--active': !todoProject(projectMenuTodo) }"
        @click="assignTodoProject(projectMenuTodo.id, '')"
      )
        span.todo-project-pill-dot.todo-project-pill-dot--inbox
        span.todo-project-menu-name No project (Inbox)
        icon(v-if="!todoProject(projectMenuTodo)" name="check")
    form.todo-project-menu-create(v-if="projectMenuCreating" @submit.prevent="createProjectFromMenu")
      input.form-control.form-control-sm(
        ref="projectMenuInput"
        v-model.trim="projectMenuName"
        placeholder="New project name"
        aria-label="New project name"
        autocomplete="off"
      )
      div.todo-project-color-picker(aria-label="Project color")
        button.todo-project-color(
          v-for="color in projectColors"
          :key="'menu-color-' + color"
          type="button"
          :class="{ 'todo-project-color--active': projectMenuColor === color }"
          :style="{ background: color }"
          :aria-label="'Use color ' + color"
          @click="projectMenuColor = color"
        )
      b-button(size="sm" variant="primary" type="submit" :disabled="!projectMenuName")
        | Create &amp; assign
    button.todo-project-menu-item.todo-project-menu-item--new(
      v-else
      type="button"
      @click="startProjectMenuCreate"
    )
      icon(name="plus")
      span New project…
</template>

<script lang="ts">
import 'vue-awesome/icons/border-all';
import 'vue-awesome/icons/calendar-alt';
import 'vue-awesome/icons/calendar-day';
import 'vue-awesome/icons/check';
import 'vue-awesome/icons/check-circle';
import 'vue-awesome/icons/clipboard-list';
import 'vue-awesome/icons/filter';
import 'vue-awesome/icons/grip-lines';
import 'vue-awesome/icons/hand-pointer';
import 'vue-awesome/icons/list-ul';
import 'vue-awesome/icons/minus';
import 'vue-awesome/icons/pen';
import 'vue-awesome/icons/plus';
import 'vue-awesome/icons/plus-circle';
import 'vue-awesome/icons/sync';
import 'vue-awesome/icons/tasks';
import 'vue-awesome/icons/times';
import 'vue-awesome/icons/trash';
import 'vue-awesome/icons/trophy';
import moment from 'moment';
import {
  cleanProjectName,
  findProjectByName,
  INBOX_PROJECT_COLOR,
  isProjectColor,
  mergeTodoProjects,
  nextProjectColor,
  normalizeTodoProjects,
  ProjectProgressShare,
  projectProgressShares,
  projectTint,
  TodoProject,
  TODO_PROJECT_COLORS,
} from '~/util/todoProjects';
import { loadStoredValue, onStoredValueChange, saveStoredValue } from '~/util/focusfrogStorage';

type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';
type TodoArea = 'work' | 'personal' | 'health' | 'home' | 'admin';

interface TodoItem {
  id: string;
  title: string;
  notes: string;
  projectId: string;
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
  projectId: string;
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
const TODO_PROJECT_STORAGE_KEY = 'timetracker.todoProjects.v1';
const TODO_DAY_PLAN_STORAGE_KEY = 'timetracker.todoDayPlan.v1';
const TODO_FROG_STORAGE_KEY = 'timetracker.todoFrog.v1';
const TODO_SERVER_STORAGE_KEYS = {
  todos: 'todos',
  projects: 'todoProjects',
  dayPlan: 'todoDayPlan',
  frog: 'todoFrog',
} as const;
const TODO_EDITOR_MODAL_ID = 'todo-editor-modal';
const CALENDAR_PAST_BUFFER_DAYS = 14;
const CALENDAR_FUTURE_DAYS = 28;
const CALENDAR_SCROLL_BATCH_DAYS = 14;
const DAY_PLAN_ROLLOVER_HOUR = 6;
const DONE_TODAY_VISIBLE_LIMIT = 6;
const PROGRESS_PULSE_MS = 1400;
const PROGRESS_RING_RADIUS = 42;
const PROGRESS_COUNT_UP_MS = 900;
const PROGRESS_INTRO_STAGGER_MS = 60;
const PROGRESS_CELEBRATION_MS = 2600;
// Each completion chimes one step higher on a major scale; the last task lands on the octave.
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
const PROGRESS_SPARKS = Array.from({ length: 10 }, (_item, index) => ({
  key: `spark-${index}`,
  angle: index * 36,
  distance: index % 2 === 0 ? 40 : 28,
  gold: index % 3 === 0,
}));
// Fixed pseudo-random layout so the confetti looks scattered but renders the same every time.
const PROGRESS_CONFETTI = Array.from({ length: 42 }, (_item, index) => ({
  key: `confetto-${index}`,
  left: (index * 37 + 11) % 100,
  delay: (index % 7) * 60,
  drift: ((index * 53) % 140) - 70,
  spin: ((index * 97) % 540) + 240,
  size: 6 + (index % 3) * 2,
  round: index % 4 === 0,
}));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

function progressChimeSemitones(fraction: number): number {
  const step = Math.round(Math.min(1, Math.max(0, fraction)) * (MAJOR_SCALE_STEPS.length - 1));
  return MAJOR_SCALE_STEPS[step];
}

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
    projectId: '',
    area: 'work',
    dueDate: '',
    dueTime: '',
    repeat: 'none',
    repeatEvery: 2,
    important: false,
    urgent: false,
  };
}

function currentPlanDate(): string {
  return moment().subtract(DAY_PLAN_ROLLOVER_HOUR, 'hours').format('YYYY-MM-DD');
}

function timestampInPlanDate(timestamp: string, planDate: string): boolean {
  if (!timestamp || !planDate) return false;
  const start = moment(`${planDate} ${DAY_PLAN_ROLLOVER_HOUR}:00`, 'YYYY-MM-DD H:mm');
  const end = start.clone().add(1, 'day');
  const value = moment(timestamp);
  return value.isSameOrAfter(start) && value.isBefore(end);
}

export default {
  name: 'Todos',
  data() {
    return {
      todos: [] as TodoItem[],
      projects: [] as TodoProject[],
      activeProjectFilter: 'all',
      projectComposerOpen: false,
      newProjectName: '',
      newProjectColor: TODO_PROJECT_COLORS[0] as string,
      creatingEditorProject: false,
      editorProjectName: '',
      editorProjectColor: TODO_PROJECT_COLORS[1] as string,
      projectColors: [...TODO_PROJECT_COLORS] as string[],
      projectEditMode: false,
      projectMenuTodoId: '',
      projectMenuTrigger: null as HTMLElement | null,
      projectMenuTop: 0,
      projectMenuLeft: 0,
      projectMenuCreating: false,
      projectMenuName: '',
      projectMenuColor: TODO_PROJECT_COLORS[0] as string,
      dayPlanIds: [] as string[],
      frogTodoId: '',
      frogEatenTodoId: '',
      frogEatenToday: false,
      frogEatenTitle: '',
      completingTodoId: '',
      progressPulseShareId: '',
      progressPulseKey: 0,
      progressPulseTimer: 0,
      latestDoneTodoId: '',
      progressCelebrationKey: 0,
      progressCelebrationTimer: 0,
      progressIntro: true,
      progressIntroTimer: 0,
      displayedProgress: 0,
      progressFrame: 0,
      draggedFrogTodoId: '',
      frogDropActive: false,
      frogJustWoke: false,
      frogWakeAnnouncement: '',
      frogWakeTimer: 0,
      frogPointerTodoId: '',
      frogPointerStartX: 0,
      frogPointerStartY: 0,
      draggedCalendarTodoId: '',
      draggedCalendarTargetKey: '',
      draggedMatrixTodoId: '',
      draggedMatrixTargetKey: '',
      draggedPlanTodoId: '',
      planDropTargetId: '',
      planDropPosition: '',
      draft: blankDraft(),
      editingId: '',
      viewMode: 'plan',
      planDayDate: currentPlanDate(),
      planRolloverTimer: 0,
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
    projectOptions() {
      return [
        { value: '', text: 'Inbox (no project)' },
        ...this.projects.map(project => ({ value: project.id, text: project.name })),
      ];
    },
    allActiveTodos(): TodoItem[] {
      return this.todos
        .filter(todo => !todo.completed)
        .sort((a, b) => this.todoDueMoment(a).valueOf() - this.todoDueMoment(b).valueOf());
    },
    projectsById(): Record<string, TodoProject> {
      return Object.fromEntries(this.projects.map(project => [project.id, project]));
    },
    activeTodos(): TodoItem[] {
      return this.allActiveTodos.filter(this.matchesProjectFilter);
    },
    inboxTodoCount(): number {
      return this.allActiveTodos.filter(todo => this.projectKey(todo) === 'inbox').length;
    },
    projectsWithCounts(): Array<TodoProject & { todoCount: number }> {
      return this.projects.map(project => ({
        ...project,
        todoCount: this.allActiveTodos.filter(todo => todo.projectId === project.id).length,
      }));
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
        .filter(todo => todo.completed && this.matchesProjectFilter(todo))
        .sort(
          (a, b) =>
            moment(b.completedAt || b.updatedAt).valueOf() -
            moment(a.completedAt || a.updatedAt).valueOf()
        )
        .slice(0, 8);
    },
    doneTodoCount(): number {
      return this.todos.reduce(
        (total, todo) => total + Math.max(0, Number(todo.completedCount || 0)),
        0
      );
    },
    doneTodayCount(): number {
      const today = currentPlanDate();
      return this.todos.filter(
        todo => todo.lastCompletedAt && timestampInPlanDate(todo.lastCompletedAt, today)
      ).length;
    },
    doneTodoLabel(): string {
      return this.doneTodoCount === 1 ? 'task done' : 'tasks done';
    },
    todoSummary(): string {
      const due = this.dueTodos.length;
      const upcoming = this.activeTodos.length - due;
      const project = this.selectedProjectLabel;
      return `${due} due now, ${upcoming} upcoming${project ? ` in ${project}` : ''}`;
    },
    selectedProjectLabel(): string {
      if (this.activeProjectFilter === 'all') return '';
      if (this.activeProjectFilter === 'inbox') return 'Inbox';
      return this.projects.find(project => project.id === this.activeProjectFilter)?.name || '';
    },
    todayPlanLabel(): string {
      return moment(this.planDayDate, 'YYYY-MM-DD').format('dddd, MMM D');
    },
    plannedTodos(): TodoItem[] {
      const todosById = new Map(this.todos.map(todo => [todo.id, todo]));
      return this.dayPlanIds
        .map(id => todosById.get(id))
        .filter((todo): todo is TodoItem => Boolean(todo));
    },
    visiblePlannedTodos(): TodoItem[] {
      return this.plannedTodos.filter(this.matchesProjectFilter);
    },
    hiddenPlannedCount(): number {
      return this.plannedTodos.length - this.visiblePlannedTodos.length;
    },
    planPositions(): Record<string, number> {
      return Object.fromEntries(this.plannedTodos.map((todo, index) => [todo.id, index + 1]));
    },
    // Everything finished today, planned or not, oldest first.
    doneTodayTodos(): TodoItem[] {
      const planDate = this.planDayDate || currentPlanDate();
      return this.todos
        .filter(todo => timestampInPlanDate(todo.lastCompletedAt, planDate))
        .sort((a, b) => moment(a.lastCompletedAt).valueOf() - moment(b.lastCompletedAt).valueOf());
    },
    visibleDoneTodayTodos(): TodoItem[] {
      return this.doneTodayTodos.slice(-DONE_TODAY_VISIBLE_LIMIT);
    },
    hiddenDoneTodayCount(): number {
      return this.doneTodayTodos.length - this.visibleDoneTodayTodos.length;
    },
    hiddenDoneTodayTitles(): string {
      return this.doneTodayTodos
        .slice(0, this.hiddenDoneTodayCount)
        .map(todo => todo.title)
        .join('\n');
    },
    // Today's plan plus todos finished today without being planned, so every
    // completion shows up in the progress line.
    planProgressShares(): ProjectProgressShare[] {
      const plannedIds = new Set(this.dayPlanIds);
      const unplannedDone = this.doneTodayTodos.filter(todo => !plannedIds.has(todo.id));
      return projectProgressShares(this.projects, [
        ...this.plannedTodos.map(todo => ({
          projectId: todo.projectId,
          done: this.isPlanTodoDone(todo),
        })),
        ...unplannedDone.map(todo => ({ projectId: todo.projectId, done: true })),
      ]);
    },
    planProgressTotal(): number {
      return this.planProgressShares.reduce((total, share) => total + share.count, 0);
    },
    planProgressDone(): number {
      return this.planProgressShares.reduce((total, share) => total + share.done, 0);
    },
    planProgressPercent(): number {
      if (this.planProgressTotal === 0) return 0;
      return Math.round((100 * this.planProgressDone) / this.planProgressTotal);
    },
    planProgressComplete(): boolean {
      return this.planProgressTotal > 0 && this.planProgressDone === this.planProgressTotal;
    },
    planProgressFraction(): number {
      return this.planProgressTotal === 0 ? 0 : this.planProgressDone / this.planProgressTotal;
    },
    displayedProgressPercent(): number {
      return Math.round(this.displayedProgress * 100);
    },
    progressRingRadius(): number {
      return PROGRESS_RING_RADIUS;
    },
    progressRingCircumference(): number {
      return 2 * Math.PI * PROGRESS_RING_RADIUS;
    },
    progressRingOffset(): number {
      return this.progressRingCircumference * (1 - this.displayedProgress);
    },
    progressCheer(): string {
      const done = this.planProgressDone;
      const remaining = this.planProgressTotal - done;
      if (this.planProgressComplete) return 'Day cleared! Every single task is done.';
      if (done === 0) return 'Your first win is one click away.';
      if (remaining === 1) return 'One more and the day is cleared!';
      if (this.planProgressFraction >= 0.75) return `Almost there, only ${remaining} to go.`;
      if (this.planProgressFraction >= 0.5) return `Past halfway! ${remaining} to go.`;
      if (done === 1) return 'First one down. Keep the momentum!';
      return `Nice, ${done} down and ${remaining} to go.`;
    },
    // One tile per task, grouped by project; done tiles fill each group from the left.
    progressTileGroups(): Array<
      ProjectProgressShare & {
        style: Record<string, string | number>;
        tiles: Array<{ key: string; done: boolean; order: number }>;
      }
    > {
      let doneOrder = 0;
      return this.planProgressShares.map(share => ({
        ...share,
        style: {
          '--count': share.count,
          '--tile-color': share.color,
          '--tile-tint': projectTint(share.color, 0.14),
          '--tile-ring': projectTint(share.color, 0.5),
          '--tile-glow': projectTint(share.color, 0.5),
        },
        tiles: Array.from({ length: share.count }, (_item, index) => ({
          key: `${share.id}-${index}`,
          done: index < share.done,
          order: index < share.done ? doneOrder++ : 0,
        })),
      }));
    },
    progressSparks(): Array<{ key: string; style: Record<string, string> }> {
      return PROGRESS_SPARKS.map(spark => ({
        key: spark.key,
        style: {
          '--angle': `${spark.angle}deg`,
          '--distance': `${spark.distance}px`,
          ...(spark.gold ? { background: '#fbbf24' } : {}),
        },
      }));
    },
    progressConfetti(): Array<{ key: string; style: Record<string, string> }> {
      const colors = [
        ...this.planProgressShares.map(share => share.color),
        '#fbbf24',
        '#34d399',
        '#f472b6',
      ];
      return PROGRESS_CONFETTI.map((piece, index) => ({
        key: piece.key,
        style: {
          left: `${piece.left}%`,
          width: `${piece.size}px`,
          height: `${piece.round ? piece.size : piece.size * 1.6}px`,
          borderRadius: piece.round ? '50%' : '2px',
          background: colors[index % colors.length],
          animationDelay: `${piece.delay}ms`,
          '--drift': `${piece.drift}px`,
          '--spin': `${piece.spin}deg`,
        },
      }));
    },
    planMixLabel(): string {
      const parts = this.planProgressShares.map(
        share => `${share.name} ${share.done} of ${share.count}`
      );
      return `Today's progress: ${this.planProgressDone} of ${
        this.planProgressTotal
      } done. ${parts.join(', ')}`;
    },
    planFilterOptions(): Array<ProjectProgressShare & { tint: string }> {
      const sharesById = new Map<string, ProjectProgressShare>(
        this.planProgressShares.map(share => [share.id, share])
      );
      return [
        ...this.projects.map(project => ({
          id: project.id,
          name: project.name,
          color: project.color,
        })),
        { id: 'inbox', name: 'Inbox', color: INBOX_PROJECT_COLOR },
      ].map(option => ({
        ...option,
        count: sharesById.get(option.id)?.count || 0,
        done: sharesById.get(option.id)?.done || 0,
        tint: projectTint(option.color, 0.14),
      }));
    },
    projectMenuTodo(): TodoItem | null {
      if (!this.projectMenuTodoId) return null;
      return this.todos.find(todo => todo.id === this.projectMenuTodoId) || null;
    },
    openPlannedTodos(): TodoItem[] {
      return this.plannedTodos.filter(todo => !this.isPlanTodoDone(todo));
    },
    frogTodo(): TodoItem | null {
      if (this.frogEatenToday) return null;
      const planned = this.openPlannedTodos;
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
    // Available todos grouped by project in the Projects bar's order, Inbox last;
    // each group keeps the due-date order.
    planCandidateGroups(): Array<{ id: string; name: string; color: string; todos: TodoItem[] }> {
      const groups = [
        ...this.projects.map(project => ({
          id: project.id,
          name: project.name,
          color: project.color,
          todos: [] as TodoItem[],
        })),
        { id: 'inbox', name: 'Inbox', color: INBOX_PROJECT_COLOR, todos: [] as TodoItem[] },
      ];
      const groupsById = new Map(groups.map(group => [group.id, group]));
      for (const todo of this.planCandidateTodos) {
        groupsById.get(this.projectKey(todo))?.todos.push(todo);
      }
      return groups.filter(group => group.todos.length > 0);
    },
    planProgressLabel(): string {
      const selected = this.plannedTodos.length;
      const done = this.plannedTodos.filter(todo => this.isPlanTodoDone(todo)).length;
      if (selected === 0) return '0 selected';
      return done > 0
        ? `${done}/${selected} done`
        : selected === 1
        ? '1 selected'
        : `${selected} selected`;
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
    projectMenuTodo(todo) {
      if (!todo && this.projectMenuTodoId) this.closeProjectMenu();
    },
    viewMode(mode) {
      if (mode === 'calendar') {
        this.$nextTick(() => this.scrollCalendarToFocus());
      }
      // The day plan always opens with every project visible.
      if (mode === 'plan') {
        this.activeProjectFilter = 'all';
        this.startProgressIntro();
      }
    },
    planProgressFraction(fraction: number) {
      this.animateProgressTo(fraction);
    },
    'draft.dueDate'(dueDate) {
      if (!dueDate) {
        this.draft.dueTime = '';
        this.draft.repeat = 'none';
      }
    },
  },
  mounted() {
    this.loadProjects();
    this.loadTodos();
    this.loadDayPlan();
    this.loadFrogTodo();
    this.pruneDayPlan();
    this.syncFrogTodoToFirstPlan();
    this.startProgressIntro();
    this.planRolloverTimer = window.setInterval(this.handlePlanDayRollover, 60 * 1000);
    void this.loadServerTodoState();
    // Edits made on another device (the phone) while this page is open.
    [
      onStoredValueChange(TODO_SERVER_STORAGE_KEYS.todos, this.applyCloudTodos),
      onStoredValueChange(TODO_SERVER_STORAGE_KEYS.projects, this.applyCloudProjects),
      onStoredValueChange(TODO_SERVER_STORAGE_KEYS.dayPlan, value => {
        this.applyCloudDayPlan(value);
        this.pruneDayPlan();
        this.syncFrogTodoToFirstPlan();
      }),
      onStoredValueChange(TODO_SERVER_STORAGE_KEYS.frog, this.applyCloudFrog),
    ].forEach(stop => this.$once('hook:beforeDestroy', stop));
  },
  beforeDestroy() {
    this.closeProjectMenu();
    const menu = this.$refs.projectMenu as HTMLElement | undefined;
    menu?.parentNode?.removeChild(menu);
    if (this.planRolloverTimer) {
      window.clearInterval(this.planRolloverTimer);
    }
    if (this.frogWakeTimer) {
      window.clearTimeout(this.frogWakeTimer);
    }
    if (this.progressPulseTimer) {
      window.clearTimeout(this.progressPulseTimer);
    }
    if (this.progressCelebrationTimer) {
      window.clearTimeout(this.progressCelebrationTimer);
    }
    if (this.progressIntroTimer) {
      window.clearTimeout(this.progressIntroTimer);
    }
    if (this.progressFrame) {
      window.cancelAnimationFrame(this.progressFrame);
    }
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
      const selectedProjectId =
        this.activeProjectFilter !== 'all' && this.activeProjectFilter !== 'inbox'
          ? this.activeProjectFilter
          : '';
      this.draft = {
        ...blankDraft(),
        projectId: selectedProjectId,
        ...prefill,
      };
      this.resetEditorProjectComposer();
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
    selectProjectFilter(projectId: string) {
      this.activeProjectFilter = projectId;
      this.ensureCalendarCoversAnchor();
      if (this.viewMode === 'calendar') {
        this.$nextTick(() => this.scrollCalendarToFocus());
      }
    },
    createProject(name: string, color: string): TodoProject | null {
      const cleanedName = cleanProjectName(name);
      if (!cleanedName) return null;
      const existing = findProjectByName(this.projects, cleanedName);
      if (existing) return existing;

      const now = moment().toISOString();
      const project: TodoProject = {
        id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: cleanedName,
        color: isProjectColor(color) ? color : nextProjectColor(this.projects),
        createdAt: now,
        updatedAt: now,
      };
      this.projects = [...this.projects, project].sort((a, b) => a.name.localeCompare(b.name));
      this.saveProjects();
      return project;
    },
    createProjectFromBrowser() {
      const project = this.createProject(this.newProjectName, this.newProjectColor);
      if (!project) return;
      if (this.viewMode !== 'plan') this.activeProjectFilter = project.id;
      this.newProjectName = '';
      this.projectComposerOpen = false;
    },
    toggleProjectComposer() {
      this.projectComposerOpen = !this.projectComposerOpen;
      if (this.projectComposerOpen) {
        this.projectEditMode = false;
        this.newProjectColor = nextProjectColor(this.projects);
      }
    },
    createEditorProject() {
      const project = this.createProject(this.editorProjectName, this.editorProjectColor);
      if (!project) return;
      this.draft.projectId = project.id;
      this.resetEditorProjectComposer();
    },
    resetEditorProjectComposer() {
      this.creatingEditorProject = false;
      this.editorProjectName = '';
      this.editorProjectColor = nextProjectColor(this.projects);
    },
    updateProject(projectId: string, changes: Partial<TodoProject>) {
      this.projects = this.projects
        .map(project =>
          project.id === projectId
            ? { ...project, ...changes, updatedAt: moment().toISOString() }
            : project
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      this.saveProjects();
    },
    recolorProject(projectId: string, color: string) {
      if (!isProjectColor(color)) return;
      this.updateProject(projectId, { color });
    },
    renameProject(projectId: string, input: HTMLInputElement) {
      const project = this.projectsById[projectId];
      if (!project) return;
      const name = cleanProjectName(input.value);
      const duplicate = findProjectByName(this.projects, name);
      if (!name || (duplicate && duplicate.id !== projectId)) {
        input.value = project.name;
        return;
      }
      input.value = name;
      if (name !== project.name) this.updateProject(projectId, { name });
    },
    async deleteProject(projectId: string) {
      const project = this.projectsById[projectId];
      if (!project) return;
      const todoCount = this.todos.filter(todo => todo.projectId === projectId).length;
      const message =
        todoCount > 0
          ? `Delete "${project.name}"? Its ${todoCount} todo${
              todoCount === 1 ? '' : 's'
            } will move to the Inbox.`
          : `Delete "${project.name}"?`;
      const confirmed = await this.$bvModal.msgBoxConfirm(message, {
        title: 'Delete project',
        okTitle: 'Delete',
        okVariant: 'danger',
        cancelTitle: 'Keep',
        centered: true,
      });
      if (!confirmed) return;

      const now = moment().toISOString();
      this.projects = this.projects.filter(item => item.id !== projectId);
      this.todos = this.todos.map(todo =>
        todo.projectId === projectId ? { ...todo, projectId: '', updatedAt: now } : todo
      );
      if (this.activeProjectFilter === projectId) this.activeProjectFilter = 'all';
      if (this.draft.projectId === projectId) this.draft.projectId = '';
      if (this.projects.length === 0) this.projectEditMode = false;
      this.saveProjects();
      this.saveTodos();
    },
    assignTodoProject(todoId: string, projectId: string) {
      const nextProjectId = projectId && this.projectsById[projectId] ? projectId : '';
      const now = moment().toISOString();
      this.todos = this.todos.map(todo =>
        todo.id === todoId && todo.projectId !== nextProjectId
          ? { ...todo, projectId: nextProjectId, updatedAt: now }
          : todo
      );
      this.saveTodos();
      this.closeProjectMenu(true);
    },
    openProjectMenu(todo: TodoItem, event: MouseEvent) {
      const trigger = event.currentTarget as HTMLElement | null;
      if (!trigger) return;
      if (this.projectMenuTodoId === todo.id) {
        this.closeProjectMenu();
        return;
      }
      this.closeProjectMenu();
      this.projectMenuTrigger = trigger;
      this.projectMenuTodoId = todo.id;
      this.projectMenuCreating = false;
      this.projectMenuName = '';
      this.projectMenuColor = nextProjectColor(this.projects);
      const rect = trigger.getBoundingClientRect();
      this.projectMenuLeft = rect.left;
      this.projectMenuTop = rect.bottom + 6;
      window.addEventListener('mousedown', this.handleProjectMenuOutside, true);
      window.addEventListener('touchstart', this.handleProjectMenuOutside, true);
      window.addEventListener('keydown', this.handleProjectMenuKeydown);
      window.addEventListener('resize', this.handleProjectMenuViewportChange);
      window.addEventListener('scroll', this.handleProjectMenuViewportChange, true);
      this.$nextTick(() => {
        const menu = this.$refs.projectMenu as HTMLElement | undefined;
        if (!menu) return;
        // Escape themed containers that clip overflow or create their own fixed-position context.
        if (menu.parentNode !== document.body) document.body.appendChild(menu);
        this.positionProjectMenu();
        const current = menu.querySelector('.todo-project-menu-item--active') as HTMLElement | null;
        (current || (menu.querySelector('.todo-project-menu-item') as HTMLElement | null))?.focus({
          preventScroll: true,
        });
      });
    },
    positionProjectMenu() {
      const menu = this.$refs.projectMenu as HTMLElement | undefined;
      const trigger = this.projectMenuTrigger as HTMLElement | null;
      if (!menu || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      let nextTop = rect.bottom + 6;
      if (nextTop + height > window.innerHeight - margin && rect.top - height - 6 >= margin) {
        nextTop = rect.top - height - 6;
      }
      this.projectMenuLeft = Math.min(Math.max(margin, rect.left), maxLeft);
      this.projectMenuTop = Math.max(
        margin,
        Math.min(nextTop, window.innerHeight - height - margin)
      );
    },
    closeProjectMenu(restoreFocus = false) {
      window.removeEventListener('mousedown', this.handleProjectMenuOutside, true);
      window.removeEventListener('touchstart', this.handleProjectMenuOutside, true);
      window.removeEventListener('keydown', this.handleProjectMenuKeydown);
      window.removeEventListener('resize', this.handleProjectMenuViewportChange);
      window.removeEventListener('scroll', this.handleProjectMenuViewportChange, true);
      const trigger = this.projectMenuTrigger as HTMLElement | null;
      this.projectMenuTrigger = null;
      this.projectMenuTodoId = '';
      this.projectMenuCreating = false;
      if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    },
    handleProjectMenuOutside(event: Event) {
      const target = event.target as Node | null;
      const menu = this.$refs.projectMenu as HTMLElement | undefined;
      const trigger = this.projectMenuTrigger as HTMLElement | null;
      if (target && (menu?.contains(target) || trigger?.contains(target))) return;
      this.closeProjectMenu();
    },
    handleProjectMenuKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') this.closeProjectMenu(true);
    },
    handleProjectMenuViewportChange(event?: Event) {
      const menu = this.$refs.projectMenu as HTMLElement | undefined;
      if (
        event?.type === 'scroll' &&
        menu &&
        event.target instanceof Node &&
        menu.contains(event.target)
      ) {
        return;
      }
      // Keep the picker anchored to its tag while scrolling; close once the tag leaves the screen.
      const trigger = this.projectMenuTrigger as HTMLElement | null;
      const rect = trigger?.isConnected ? trigger.getBoundingClientRect() : null;
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        this.closeProjectMenu();
        return;
      }
      this.positionProjectMenu();
    },
    startProjectMenuCreate() {
      this.projectMenuCreating = true;
      this.projectMenuColor = nextProjectColor(this.projects);
      this.$nextTick(() => {
        this.positionProjectMenu();
        (this.$refs.projectMenuInput as HTMLInputElement | undefined)?.focus({
          preventScroll: true,
        });
      });
    },
    createProjectFromMenu() {
      const todoId = this.projectMenuTodoId;
      const project = this.createProject(this.projectMenuName, this.projectMenuColor);
      if (!project || !todoId) return;
      this.assignTodoProject(todoId, project.id);
    },
    // While signed in to the cloud, its copy replaces this page's: merging would bring
    // back todos that were deleted on another device.
    applyCloudTodos(value: unknown) {
      const todos = (Array.isArray(value) ? value : [])
        .map(this.normalizeTodo)
        .sort((a, b) => this.todoDueMoment(a).valueOf() - this.todoDueMoment(b).valueOf());
      if (JSON.stringify(todos) === JSON.stringify(this.todos)) return;
      this.todos = todos;
      this.saveTodos();
      this.ensureCalendarCoversAnchor();
    },
    applyCloudProjects(value: unknown) {
      const projects = normalizeTodoProjects(Array.isArray(value) ? value : []).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      if (JSON.stringify(projects) === JSON.stringify(this.projects)) return;
      this.projects = projects;
      this.saveProjects();
    },
    applyCloudDayPlan(value: unknown) {
      const plan = value as Partial<DayPlanRecord> | null;
      if (!plan || !Array.isArray(plan.todoIds)) {
        // Nothing in the cloud yet: this device's plan becomes the shared one.
        this.saveDayPlan();
        return;
      }
      const today = currentPlanDate();
      const ids = plan.todoIds.filter(id => typeof id === 'string');
      const nextIds =
        plan.date === today
          ? ids
          : this.rollOverDayPlanIds(ids, typeof plan.date === 'string' ? plan.date : today);
      this.planDayDate = today;
      if (plan.date === today && JSON.stringify(nextIds) === JSON.stringify(this.dayPlanIds)) {
        return;
      }
      this.dayPlanIds = nextIds;
      this.saveDayPlan();
    },
    applyCloudFrog(value: unknown) {
      const frog = value as Partial<FrogPlanRecord> | null;
      if (!frog || typeof frog !== 'object') {
        this.saveFrogTodo();
        return;
      }
      const isToday = frog.date === currentPlanDate();
      const todoId = isToday && typeof frog.todoId === 'string' ? frog.todoId : '';
      const eatenToday = Boolean(isToday && frog.eatenToday);
      const eatenTitle =
        isToday && typeof frog.eatenTodoTitle === 'string' ? frog.eatenTodoTitle : '';
      if (
        isToday &&
        todoId === this.frogTodoId &&
        eatenToday === this.frogEatenToday &&
        eatenTitle === this.frogEatenTitle
      ) {
        return;
      }
      this.frogTodoId = todoId;
      this.frogEatenToday = eatenToday;
      this.frogEatenTitle = eatenTitle;
      this.saveFrogTodo();
    },
    mergeTodos(localTodos: TodoItem[], serverTodos: TodoItem[]): TodoItem[] {
      const byId = new Map<string, TodoItem>();
      const score = (todo: TodoItem) =>
        moment(todo.updatedAt || todo.completedAt || todo.createdAt || 0).valueOf();

      [...serverTodos, ...localTodos].forEach(todo => {
        const normalized = this.normalizeTodo(todo);
        const existing = byId.get(normalized.id);
        if (!existing || score(normalized) >= score(existing)) {
          byId.set(normalized.id, normalized);
        }
      });

      return Array.from(byId.values()).sort(
        (a, b) => this.todoDueMoment(a).valueOf() - this.todoDueMoment(b).valueOf()
      );
    },
    async loadServerTodoState() {
      const [todos, projects, dayPlan, frog] = await Promise.all([
        loadStoredValue(TODO_SERVER_STORAGE_KEYS.todos),
        loadStoredValue(TODO_SERVER_STORAGE_KEYS.projects),
        loadStoredValue(TODO_SERVER_STORAGE_KEYS.dayPlan),
        loadStoredValue(TODO_SERVER_STORAGE_KEYS.frog),
      ]);
      if (todos.fromCloud) {
        this.applyCloudProjects(projects.value);
        this.applyCloudTodos(todos.value);
        this.applyCloudDayPlan(dayPlan.value);
        this.applyCloudFrog(frog.value);
        this.pruneDayPlan();
        this.syncFrogTodoToFirstPlan();
        return;
      }
      const [serverTodos, serverProjects, serverDayPlan, serverFrog]: any[] = [
        todos.value,
        projects.value,
        dayPlan.value,
        frog.value,
      ];

      if (Array.isArray(serverProjects) && serverProjects.length > 0) {
        const mergedProjects = mergeTodoProjects(
          this.projects,
          normalizeTodoProjects(serverProjects)
        );
        if (JSON.stringify(mergedProjects) !== JSON.stringify(this.projects)) {
          this.projects = mergedProjects;
          this.saveProjects(false);
        }
      } else if (this.projects.length > 0) {
        void saveStoredValue(TODO_SERVER_STORAGE_KEYS.projects, this.projects);
      }

      if (Array.isArray(serverTodos) && serverTodos.length > 0) {
        const mergedTodos = this.mergeTodos(this.todos, serverTodos.map(this.normalizeTodo));
        if (JSON.stringify(mergedTodos) !== JSON.stringify(this.todos)) {
          this.todos = mergedTodos;
          this.saveTodos(false);
          this.ensureCalendarCoversAnchor();
        }
      } else if (this.todos.length > 0) {
        void saveStoredValue(TODO_SERVER_STORAGE_KEYS.todos, this.todos);
      }

      const today = currentPlanDate();
      this.planDayDate = today;
      if (
        serverDayPlan &&
        typeof serverDayPlan === 'object' &&
        serverDayPlan.date === today &&
        Array.isArray(serverDayPlan.todoIds) &&
        this.dayPlanIds.length === 0
      ) {
        this.dayPlanIds = serverDayPlan.todoIds.filter(id => typeof id === 'string');
        this.saveDayPlan(false);
      } else if (
        serverDayPlan &&
        typeof serverDayPlan === 'object' &&
        serverDayPlan.date !== today &&
        Array.isArray(serverDayPlan.todoIds) &&
        this.dayPlanIds.length === 0
      ) {
        this.dayPlanIds = this.rollOverDayPlanIds(
          serverDayPlan.todoIds.filter(id => typeof id === 'string'),
          typeof serverDayPlan.date === 'string' ? serverDayPlan.date : today
        );
        this.saveDayPlan();
      } else if (this.dayPlanIds.length > 0) {
        this.saveDayPlan();
      }

      if (
        serverFrog &&
        typeof serverFrog === 'object' &&
        serverFrog.date === today &&
        !this.frogTodoId &&
        !this.frogEatenToday
      ) {
        this.frogTodoId = typeof serverFrog.todoId === 'string' ? serverFrog.todoId : '';
        this.frogEatenToday = Boolean(serverFrog.eatenToday);
        this.frogEatenTitle =
          typeof serverFrog.eatenTodoTitle === 'string' ? serverFrog.eatenTodoTitle : '';
        this.saveFrogTodo(false);
      } else if (this.frogTodoId || this.frogEatenToday || this.frogEatenTitle) {
        this.saveFrogTodo();
      }

      this.pruneDayPlan();
      this.syncFrogTodoToFirstPlan();
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
    saveTodos(syncServer = true) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(this.todos));
      }
      if (syncServer) void saveStoredValue(TODO_SERVER_STORAGE_KEYS.todos, this.todos);
    },
    loadProjects() {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(TODO_PROJECT_STORAGE_KEY);
        this.projects = normalizeTodoProjects(raw ? JSON.parse(raw) : []).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      } catch (err) {
        console.error('Could not load todo projects:', err);
        this.projects = [];
      }
    },
    saveProjects(syncServer = true) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TODO_PROJECT_STORAGE_KEY, JSON.stringify(this.projects));
      }
      if (syncServer) void saveStoredValue(TODO_SERVER_STORAGE_KEYS.projects, this.projects);
    },
    loadDayPlan() {
      if (typeof localStorage === 'undefined') return;
      const today = currentPlanDate();
      this.planDayDate = today;
      try {
        const raw = localStorage.getItem(TODO_DAY_PLAN_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<DayPlanRecord>) : null;
        if (parsed?.date === today && Array.isArray(parsed.todoIds)) {
          this.dayPlanIds = parsed.todoIds.filter(id => typeof id === 'string');
        } else if (parsed?.date && Array.isArray(parsed.todoIds)) {
          this.dayPlanIds = this.rollOverDayPlanIds(
            parsed.todoIds.filter(id => typeof id === 'string'),
            parsed.date
          );
          this.saveDayPlan();
        } else {
          this.dayPlanIds = [];
        }
      } catch (err) {
        console.error('Could not load day plan:', err);
        this.dayPlanIds = [];
      }
    },
    saveDayPlan(syncServer = true) {
      const record: DayPlanRecord = {
        date: this.planDayDate || currentPlanDate(),
        todoIds: this.dayPlanIds,
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TODO_DAY_PLAN_STORAGE_KEY, JSON.stringify(record));
      }
      if (syncServer) void saveStoredValue(TODO_SERVER_STORAGE_KEYS.dayPlan, record);
    },
    loadFrogTodo() {
      if (typeof localStorage === 'undefined') return;
      const today = currentPlanDate();
      this.planDayDate = today;
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
    saveFrogTodo(syncServer = true) {
      const record: FrogPlanRecord = {
        date: this.planDayDate || currentPlanDate(),
        todoId: this.frogTodoId,
        eatenToday: this.frogEatenToday,
        eatenTodoTitle: this.frogEatenTitle,
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TODO_FROG_STORAGE_KEY, JSON.stringify(record));
        window.dispatchEvent(
          new CustomEvent('focusfrog:frog-state-changed', {
            detail: record,
          })
        );
      }
      if (syncServer) void saveStoredValue(TODO_SERVER_STORAGE_KEYS.frog, record);
    },
    isTodoDoneForPlanDate(todo: TodoItem, planDate: string): boolean {
      if (todo.completed) return true;
      return Boolean(todo.lastCompletedAt && timestampInPlanDate(todo.lastCompletedAt, planDate));
    },
    rollOverDayPlanIds(todoIds: string[], previousPlanDate: string): string[] {
      const todosById = new Map(this.todos.map(todo => [todo.id, todo]));
      return todoIds.filter((id, index, ids) => {
        if (ids.indexOf(id) !== index) return false;
        const todo = todosById.get(id);
        return Boolean(todo && !this.isTodoDoneForPlanDate(todo, previousPlanDate));
      });
    },
    handlePlanDayRollover() {
      const nextPlanDate = currentPlanDate();
      if (this.planDayDate === nextPlanDate) return;

      const previousPlanDate = this.planDayDate;
      this.planDayDate = nextPlanDate;
      this.dayPlanIds = this.rollOverDayPlanIds(this.dayPlanIds, previousPlanDate);
      this.frogTodoId = '';
      this.frogEatenTodoId = '';
      this.frogEatenToday = false;
      this.frogEatenTitle = '';
      this.saveDayPlan();
      this.saveFrogTodo();
      this.syncFrogTodoToFirstPlan();
    },
    pruneDayPlan() {
      const existingIds = new Set(this.todos.map(todo => todo.id));
      const nextIds = this.dayPlanIds.filter(
        (id, index, ids) => existingIds.has(id) && ids.indexOf(id) === index
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
      const firstTodoId = this.openPlannedTodos[0]?.id || '';
      if (this.frogTodoId === firstTodoId) return;
      this.frogTodoId = firstTodoId;
      this.frogEatenTodoId = '';
      this.saveFrogTodo();
    },
    moveTodoToPlanFront(todoId: string) {
      const todo = this.allActiveTodos.find(item => item.id === todoId);
      if (!todo) return;
      const isWakingFrog = this.frogIsEaten;
      this.frogEatenToday = false;
      this.frogEatenTitle = '';
      this.dayPlanIds = [todo.id, ...this.dayPlanIds.filter(id => id !== todo.id)];
      this.saveDayPlan();
      this.syncFrogTodoToFirstPlan();
      if (isWakingFrog) this.announceFrogWake(todo);
    },
    announceFrogWake(todo: TodoItem) {
      if (this.frogWakeTimer) {
        window.clearTimeout(this.frogWakeTimer);
      }
      this.frogJustWoke = false;
      this.frogWakeAnnouncement = `${todo.title} is your new frog. The frog is awake.`;
      this.$nextTick(() => {
        this.frogJustWoke = true;
        this.frogWakeTimer = window.setTimeout(() => {
          this.frogJustWoke = false;
          this.frogWakeTimer = 0;
        }, 1100);
      });
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
    startPlanDrag(todo: TodoItem, event: DragEvent) {
      if (this.isPlanTodoDone(todo)) {
        event.preventDefault();
        return;
      }
      this.cancelFrogMouseDrag();
      this.cancelFrogPointerDrag();
      this.draggedPlanTodoId = todo.id;
      this.planDropTargetId = '';
      this.planDropPosition = '';
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'copyMove';
        event.dataTransfer.setData('text/plain', todo.id);
      }
    },
    handlePlanDragOver(todo: TodoItem, event: DragEvent) {
      const todoId = this.draggedPlanTodoId || event.dataTransfer?.getData('text/plain') || '';
      if (!todoId || todoId === todo.id || !this.dayPlanIds.includes(todoId)) return;
      const target = event.currentTarget as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      this.planDropTargetId = todo.id;
      this.planDropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    },
    handlePlanDragLeave(todo: TodoItem, event: DragEvent) {
      const currentTarget = event.currentTarget as HTMLElement | null;
      const relatedTarget = event.relatedTarget as Node | null;
      if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
      if (this.planDropTargetId === todo.id) {
        this.planDropTargetId = '';
        this.planDropPosition = '';
      }
    },
    dropTodoOnPlan(todo: TodoItem, event: DragEvent) {
      const todoId = this.draggedPlanTodoId || event.dataTransfer?.getData('text/plain') || '';
      const position =
        this.planDropTargetId === todo.id && this.planDropPosition
          ? this.planDropPosition
          : 'after';
      this.reorderPlannedTodo(todoId, todo.id, position);
      this.endPlanDrag();
    },
    endPlanDrag() {
      this.draggedPlanTodoId = '';
      this.planDropTargetId = '';
      this.planDropPosition = '';
    },
    reorderPlannedTodo(todoId: string, targetTodoId: string, position: string) {
      if (!todoId || !targetTodoId || todoId === targetTodoId) return;
      if (!this.dayPlanIds.includes(todoId) || !this.dayPlanIds.includes(targetTodoId)) return;
      const nextIds = this.dayPlanIds.filter(id => id !== todoId);
      const targetIndex = nextIds.indexOf(targetTodoId);
      if (targetIndex < 0) return;
      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      nextIds.splice(insertIndex, 0, todoId);
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
      const todo = this.allActiveTodos.find(item => item.id === todoId);
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
      if (this.draggedFrogTodoId || this.draggedPlanTodoId) {
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
      const todoId =
        this.draggedFrogTodoId ||
        this.draggedPlanTodoId ||
        event.dataTransfer?.getData('text/plain');
      if (todoId) this.selectFrogTodoById(todoId);
      this.endFrogDrag();
      this.endPlanDrag();
    },
    endFrogDrag() {
      this.draggedFrogTodoId = '';
      this.frogDropActive = false;
    },
    startFrogPointerDrag(todo: TodoItem, event: PointerEvent) {
      if (event.button !== 0) return;
      if (this.isPlanTodoDone(todo)) return;
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
      if (this.isPlanTodoDone(todo)) return;
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
      return laneTimes[lane] ?? '';
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
      const inPlan = this.dayPlanIds.includes(todo.id);
      const nextTotal = this.planProgressTotal + (inPlan ? 0 : 1);
      const clearsDay = inPlan && nextTotal - this.planProgressDone === 1;
      this.playTodoCompleteSound(
        progressChimeSemitones((this.planProgressDone + 1) / nextTotal),
        clearsDay
      );
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
    playTodoCompleteSound(semitones = 0, fanfare = false) {
      if (typeof window === 'undefined') return;
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) return;
        const audioContext = new AudioContextClass();
        const now = audioContext.currentTime;
        const masterGain = audioContext.createGain();
        masterGain.gain.setValueAtTime(0.8, now);
        masterGain.connect(audioContext.destination);

        const playTone = (
          frequency: number,
          startOffset: number,
          duration: number,
          volume: number
        ) => {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const start = now + startOffset;
          const end = start + duration;

          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, start);
          oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, end);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
          gain.gain.exponentialRampToValueAtTime(volume * 0.55, start + duration * 0.35);
          gain.gain.exponentialRampToValueAtTime(0.0001, end);

          oscillator.connect(gain);
          gain.connect(masterGain);
          oscillator.start(start);
          oscillator.stop(end + 0.01);
          return oscillator;
        };

        // A soft tactile pop followed by a warm major-third chime.
        const pop = audioContext.createOscillator();
        const popGain = audioContext.createGain();
        pop.type = 'sine';
        pop.frequency.setValueAtTime(185, now);
        pop.frequency.exponentialRampToValueAtTime(105, now + 0.075);
        popGain.gain.setValueAtTime(0.0001, now);
        popGain.gain.exponentialRampToValueAtTime(0.045, now + 0.004);
        popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
        pop.connect(popGain);
        popGain.connect(masterGain);
        pop.start(now);
        pop.stop(now + 0.085);

        const pitch = 2 ** (semitones / 12);
        playTone(698.46 * pitch, 0.015, 0.22, 0.032);
        playTone(1396.91 * pitch, 0.015, 0.16, 0.008);
        let finalTone = playTone(880 * pitch, 0.095, 0.34, 0.045);
        playTone(1760 * pitch, 0.095, 0.22, 0.007);

        if (fanfare) {
          // A rising F major arpeggio for clearing the whole day.
          [698.46, 880, 1046.5, 1396.91].forEach((frequency, index) => {
            const isLast = index === 3;
            const tone = playTone(frequency, 0.4 + index * 0.1, isLast ? 0.9 : 0.3, 0.034);
            playTone(frequency * 2, 0.4 + index * 0.1, isLast ? 0.5 : 0.2, 0.006);
            if (isLast) finalTone = tone;
          });
        }

        if (audioContext.state === 'suspended') {
          void audioContext.resume();
        }
        finalTone.onended = () => void audioContext.close();
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
      const dueDate = typeof todo.dueDate === 'string' ? todo.dueDate : '';
      const normalized = {
        ...todo,
        title: todo.title || '',
        notes: todo.notes || '',
        projectId: typeof todo.projectId === 'string' ? todo.projectId : '',
        area: AREA_CONFIG[todo.area] ? todo.area : 'work',
        dueDate,
        dueTime: dueDate ? todo.dueTime || '' : '',
        repeat: dueDate ? todo.repeat || 'none' : 'none',
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
    normalizedDraft(): TodoDraft {
      const repeatEvery = Math.max(1, Number(this.draft.repeatEvery || 1));
      if (!this.draft.dueDate) {
        return {
          ...this.draft,
          dueDate: '',
          dueTime: '',
          repeat: 'none',
          repeatEvery,
        };
      }
      return {
        ...this.draft,
        repeatEvery,
      };
    },
    saveTodo() {
      if (!this.draft.title) return;
      const now = moment().toISOString();
      const draft = this.normalizedDraft();
      if (this.editingId) {
        this.todos = this.todos.map(todo =>
          todo.id === this.editingId
            ? {
                ...todo,
                ...draft,
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
            ...draft,
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
      this.resetEditorProjectComposer();
    },
    editTodo(todo: TodoItem) {
      this.editingId = todo.id;
      this.draft = {
        title: todo.title,
        notes: todo.notes,
        projectId: todo.projectId,
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
              // Undo the completion so it leaves today's progress and the done counters.
              completedCount: Math.max(0, item.completedCount - 1),
              lastCompletedAt:
                item.lastCompletedAt === item.completedAt ? '' : item.lastCompletedAt,
              updatedAt: moment().toISOString(),
            }
          : item
      );
      this.saveTodos();
      this.ensureCalendarCoversAnchor();
    },
    completeTodo(todo: TodoItem) {
      const wasComplete = this.planProgressComplete;
      const now = moment();
      if (todo.repeat !== 'none' && todo.dueDate) {
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
      // Planned todos stay in the plan as done, wherever they were checked off.
      if (this.dayPlanIds.includes(todo.id)) {
        this.saveDayPlan();
        this.syncFrogTodoToFirstPlan();
      }
      this.pulseProgress(todo, !wasComplete && this.planProgressComplete);
      this.ensureCalendarCoversAnchor();
    },
    pulseProgress(todo: TodoItem, dayCleared = false) {
      if (this.progressPulseTimer) {
        window.clearTimeout(this.progressPulseTimer);
      }
      this.progressPulseShareId = this.projectKey(todo);
      this.progressPulseKey += 1;
      this.latestDoneTodoId = todo.id;
      this.progressPulseTimer = window.setTimeout(() => {
        this.progressPulseShareId = '';
        this.latestDoneTodoId = '';
        this.progressPulseTimer = 0;
      }, PROGRESS_PULSE_MS);
      this.bumpProgressRing(dayCleared);
      if (dayCleared) this.celebrateDayCleared();
    },
    bumpProgressRing(big: boolean) {
      const ring = this.$refs.progressRing as HTMLElement | undefined;
      if (!ring?.animate || prefersReducedMotion()) return;
      const peak = big ? 1.16 : 1.08;
      ring.animate(
        [
          { transform: 'scale(1)' },
          { transform: `scale(${peak})`, offset: 0.35 },
          { transform: 'scale(0.97)', offset: 0.7 },
          { transform: 'scale(1)' },
        ],
        { duration: big ? 800 : 560, easing: 'ease-out' }
      );
    },
    celebrateDayCleared() {
      if (this.progressCelebrationTimer) {
        window.clearTimeout(this.progressCelebrationTimer);
      }
      if (prefersReducedMotion()) return;
      this.progressCelebrationKey += 1;
      this.progressCelebrationTimer = window.setTimeout(() => {
        this.progressCelebrationKey = 0;
        this.progressCelebrationTimer = 0;
      }, PROGRESS_CELEBRATION_MS);
    },
    // Done tiles fill in one after another and the ring counts up whenever the plan opens.
    startProgressIntro() {
      if (this.progressIntroTimer) {
        window.clearTimeout(this.progressIntroTimer);
      }
      const reduceMotion = prefersReducedMotion();
      this.progressIntro = !reduceMotion;
      this.displayedProgress = reduceMotion ? this.planProgressFraction : 0;
      this.animateProgressTo(this.planProgressFraction);
      this.progressIntroTimer = window.setTimeout(() => {
        this.progressIntro = false;
        this.progressIntroTimer = 0;
      }, this.planProgressDone * PROGRESS_INTRO_STAGGER_MS + 700);
    },
    animateProgressTo(target: number) {
      if (this.progressFrame) {
        window.cancelAnimationFrame(this.progressFrame);
        this.progressFrame = 0;
      }
      const from = this.displayedProgress;
      if (from === target || prefersReducedMotion()) {
        this.displayedProgress = target;
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / PROGRESS_COUNT_UP_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        this.displayedProgress = from + (target - from) * eased;
        this.progressFrame = t < 1 ? window.requestAnimationFrame(step) : 0;
      };
      this.progressFrame = window.requestAnimationFrame(step);
    },
    achievementChipStyle(todo: TodoItem): Record<string, string> {
      const color = this.todoAccentColor(todo);
      return {
        '--chip-color': color,
        '--chip-tint': projectTint(color, 0.14),
        '--chip-border': projectTint(color, 0.45),
      };
    },
    progressCountLabel(done: number, count: number): string {
      return done > 0 ? `${done}/${count}` : String(count);
    },
    todoDueMoment(todo: TodoItem) {
      if (!todo.dueDate) return moment('9999-12-31 23:59', 'YYYY-MM-DD HH:mm');
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
      if (!todo.dueDate) return 'Anytime';
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
    isPlanTodoDone(todo: TodoItem): boolean {
      return this.isTodoDoneForPlanDate(todo, this.planDayDate || currentPlanDate());
    },
    planDoneLabel(todo: TodoItem): string {
      const timestamp = todo.completedAt || todo.lastCompletedAt;
      return timestamp ? `Done ${moment(timestamp).format('HH:mm')}` : 'Done today';
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
    todoProject(todo: TodoItem): TodoProject | null {
      return this.projectsById[todo.projectId] || null;
    },
    projectLabel(projectId: string): string {
      return this.projectsById[projectId]?.name || 'Project';
    },
    projectColor(projectId: string): string {
      return this.projectsById[projectId]?.color || INBOX_PROJECT_COLOR;
    },
    projectTint(color: string, alpha: number): string {
      return projectTint(color, alpha);
    },
    // Todos pointing at a missing project (e.g. deleted elsewhere) count as Inbox.
    projectKey(todo: TodoItem): string {
      return this.projectsById[todo.projectId] ? todo.projectId : 'inbox';
    },
    matchesProjectFilter(todo: TodoItem): boolean {
      return (
        this.activeProjectFilter === 'all' || this.projectKey(todo) === this.activeProjectFilter
      );
    },
    todoAccentColor(todo: TodoItem): string {
      return this.todoProject(todo)?.color || this.areaColor(todo.area);
    },
    todoColorStyle(todo: TodoItem, areaBorder = true): Record<string, string> {
      const project = this.todoProject(todo);
      if (!project) return areaBorder ? { borderColor: this.areaColor(todo.area) } : {};
      return {
        '--todo-project-color': project.color,
        '--todo-project-tint': projectTint(project.color, 0.13),
      };
    },
    projectColorClass(todo: TodoItem) {
      return { 'todo-project-colored': Boolean(this.todoProject(todo)) };
    },
    projectTagAriaLabel(todo: TodoItem): string {
      const project = this.todoProject(todo);
      return project
        ? `Project ${project.name}. Change project for ${todo.title}`
        : `No project. Add ${todo.title} to a project`;
    },
    todoCardClass(todo: TodoItem) {
      return {
        'todo-card--due': this.todoDueMoment(todo).isSameOrBefore(moment()),
        'todo-card--repeating': todo.repeat !== 'none',
        'todo-card--checking': this.isCompleting(todo),
        ...this.projectColorClass(todo),
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
        .filter(todo => todo.dueDate)
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

.todo-header-meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.todo-done-counter {
  display: inline-flex;
  align-items: center;
  min-height: 1.85rem;
  gap: 0.35rem;
  padding: 0.24rem 0.62rem;
  border: 1px solid rgba(16, 185, 129, 0.34);
  border-radius: 999px;
  background: rgba(236, 253, 245, 0.9);
  color: #065f46;
  font-size: 0.86rem;
  font-weight: 800;
}

.todo-done-counter .fa-icon {
  margin: 0;
  color: #10b981;
}

.todo-done-counter strong {
  color: #047857;
  font-size: 0.98rem;
  line-height: 1;
}

.todo-done-counter-today {
  margin-left: 0.15rem;
  padding-left: 0.45rem;
  border-left: 1px solid rgba(16, 185, 129, 0.34);
  color: #be185d;
}

.todo-project-browser {
  padding: 0.9rem 1rem;
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.92), rgba(253, 242, 248, 0.78));
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
}

.todo-project-browser-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.todo-project-help {
  margin: 0.18rem 0 0;
  color: #64748b;
  font-size: 0.82rem;
}

.todo-project-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.48rem;
  margin-top: 0.72rem;
}

.todo-project-pill {
  appearance: none;
  display: inline-flex;
  align-items: center;
  min-height: 2.2rem;
  gap: 0.42rem;
  padding: 0.42rem 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease,
    transform 120ms ease;
}

.todo-project-pill:hover {
  border-color: rgba(16, 185, 129, 0.64);
  background: #ffffff;
  transform: translateY(-1px);
}

.todo-project-pill--active {
  border-color: #10b981;
  background: #ffffff;
  color: #065f46;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}

.todo-project-pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  font-size: 0.7rem;
  line-height: 1;
}

.todo-project-pill-dot,
.todo-project-tag-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
}

.todo-project-pill-dot--inbox {
  border: 2px solid #94a3b8;
  background: transparent;
}

.todo-project-composer {
  display: grid;
  grid-template-columns: minmax(13rem, 1fr) auto auto;
  align-items: center;
  gap: 0.7rem;
  margin-top: 0.75rem;
  padding: 0.72rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
}

.todo-project-composer--editor {
  margin-top: 0.5rem;
  background: rgba(248, 250, 252, 0.88);
}

.todo-project-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
}

.todo-project-color-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.todo-project-color {
  appearance: none;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(100, 116, 139, 0.42);
  cursor: pointer;
}

.todo-project-color--active {
  box-shadow: 0 0 0 2px #0f172a;
  transform: scale(1.08);
}

.todo-project-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.12rem 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.92);
  color: #475569;
  font-size: 0.72rem;
  font-weight: 800;
}

.todo-project-tag-dot {
  width: 0.48rem;
  height: 0.48rem;
}

html[data-dashboard-theme='flower'] .todo-done-counter {
  border-color: rgba(16, 185, 129, 0.42);
  background: rgba(255, 253, 245, 0.95);
  color: #102a4c;
}

html[data-dashboard-theme='flower'] .todo-done-counter strong,
html[data-dashboard-theme='flower'] .todo-done-counter .fa-icon {
  color: #10b981;
}

html[data-dashboard-theme='flower'] .todo-done-counter-today {
  border-left-color: rgba(236, 72, 153, 0.34);
  color: #be185d;
}

html[data-dashboard-theme='flower'] .todo-project-browser {
  border-color: rgba(236, 72, 153, 0.28);
  background: rgba(255, 253, 245, 0.72);
  box-shadow: 0 14px 34px rgba(128, 78, 89, 0.1);
  backdrop-filter: blur(12px);
}

html[data-dashboard-theme='flower'] .todo-project-pill,
html[data-dashboard-theme='flower'] .todo-project-composer,
html[data-dashboard-theme='flower'] .todo-project-tag {
  background: rgba(255, 253, 245, 0.82);
}

html[data-dashboard-theme='contrast'] .todo-done-counter {
  border-color: rgba(52, 211, 153, 0.58);
  background: rgba(16, 185, 129, 0.16);
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .todo-done-counter strong,
html[data-dashboard-theme='contrast'] .todo-done-counter .fa-icon {
  color: #86efac;
}

html[data-dashboard-theme='contrast'] .todo-done-counter-today {
  border-left-color: rgba(244, 114, 182, 0.48);
  color: #f9a8d4;
}

html[data-dashboard-theme='contrast'] .todo-project-browser {
  border-color: rgba(52, 211, 153, 0.34);
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.34), rgba(131, 24, 67, 0.22));
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .todo-project-help {
  color: #cbd5e1;
}

html[data-dashboard-theme='contrast'] .todo-project-pill,
html[data-dashboard-theme='contrast'] .todo-project-composer,
html[data-dashboard-theme='contrast'] .todo-project-tag {
  border-color: rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.78);
  color: #e2e8f0;
}

html[data-dashboard-theme='contrast'] .todo-project-pill--active {
  border-color: #34d399;
  color: #a7f3d0;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.14);
}

.todo-project-browser-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Project colors on todo cards. Themes force card borders/backgrounds with !important,
   so these rules need the extra specificity to keep the project color visible. */
.todos-page .todo-workspace .todo-project-colored.todo-project-colored {
  border-left-color: var(--todo-project-color) !important;
}

.todos-page .todo-workspace .todo-project-colored.todo-project-colored:not(.todo-plan-card--frog) {
  background-image: linear-gradient(90deg, var(--todo-project-tint), transparent 72%) !important;
}

.todo-project-tag--button {
  appearance: none;
  cursor: pointer;
  line-height: 1.25;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}

.todo-project-tag--button:hover,
.todo-project-tag--button:focus-visible {
  border-color: rgba(16, 185, 129, 0.62);
  background: #ffffff;
  color: #0f172a;
  outline: none;
}

.todo-project-tag--button:focus-visible {
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35);
}

.todo-project-tag--empty {
  border-style: dashed;
  background: transparent;
  color: #94a3b8;
}

.todo-project-tag--empty .todo-project-tag-dot {
  border: 1.5px dashed currentColor;
  background: transparent !important;
}

.todo-project-editor {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.72rem;
}

.todo-project-edit-row {
  display: grid;
  grid-template-columns: auto minmax(8rem, 14rem) auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
}

.todo-project-edit-count {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}

.todo-plan-projects {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 0.9rem;
}

.todo-progress-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    'ring head'
    'ring tiles';
  align-items: center;
  gap: 0.55rem 1.15rem;
  padding: 0.95rem 1.15rem;
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(236, 253, 245, 0.95),
    rgba(255, 255, 255, 0.9) 55%,
    rgba(240, 249, 255, 0.92)
  );
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  transition: border-color 400ms ease, box-shadow 400ms ease;
}

.todo-progress-card--complete {
  border-color: rgba(16, 185, 129, 0.55);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12), 0 12px 32px rgba(16, 185, 129, 0.2);
}

.todo-progress-ring {
  grid-area: ring;
  position: relative;
  width: 5.6rem;
  height: 5.6rem;
}

.todo-progress-ring-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  transform: rotate(-90deg);
}

.todo-progress-ring-track,
.todo-progress-ring-value {
  fill: none;
  stroke-width: 9;
}

.todo-progress-ring-track {
  stroke: rgba(148, 163, 184, 0.22);
}

.todo-progress-ring-value {
  stroke: url(#todo-progress-ring-gradient);
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.4));
}

.todo-progress-card--complete .todo-progress-ring-value {
  animation: todo-ring-glow 2.4s ease-in-out infinite;
}

.todo-progress-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.todo-progress-ring-percent {
  color: #065f46;
  font-size: 1.45rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.todo-progress-ring-sub {
  margin-top: 0.22rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.todo-progress-ring-check {
  width: 2.1rem;
  height: 2.1rem;
  fill: none;
  stroke: #10b981;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 22;
  animation: todo-check-draw 600ms ease-out 150ms backwards;
}

.todo-progress-head {
  grid-area: head;
  align-self: end;
  min-width: 0;
}

.todo-progress-cheer {
  margin-top: 0.15rem;
  color: #0f172a;
  font-size: 1.08rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.todo-progress-card--complete .todo-progress-cheer {
  color: #047857;
}

.todo-cheer-enter-active,
.todo-cheer-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.todo-cheer-enter {
  opacity: 0;
  transform: translateY(6px);
}

.todo-cheer-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.todo-progress-tiles {
  grid-area: tiles;
  align-self: start;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.7rem;
}

.todo-progress-group {
  display: flex;
  flex: var(--count) 1 0%;
  min-width: calc(var(--count) * 0.95rem);
  gap: 0.25rem;
}

/* Each tile is an empty slot; its ::before layer is the colored fill. */
.todo-progress-tile {
  position: relative;
  flex: 1 1 0;
  min-width: 0.7rem;
  height: 1.6rem;
  border-radius: 7px;
  background: var(--tile-tint);
  box-shadow: inset 0 0 0 1.5px var(--tile-ring);
}

.todo-progress-tile::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.4),
      rgba(255, 255, 255, 0.06) 48%,
      rgba(0, 0, 0, 0.08)
    ),
    var(--tile-color);
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.12), 0 3px 10px var(--tile-glow);
  opacity: 0;
  transform: scale(0.2);
}

.todo-progress-tile--done::before {
  opacity: 1;
  transform: none;
}

.todo-progress-tile-check {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  width: 0.85rem;
  height: 0.85rem;
  fill: none;
  stroke: #ffffff;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 15;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
  transform: translate(-50%, -50%);
}

/* A finished day keeps a gentle light wave running across the tiles. */
.todo-progress-card--complete .todo-progress-tile--done::before {
  animation: todo-tile-shimmer 3.6s ease-in-out infinite;
  animation-delay: calc(var(--i) * 70ms);
}

.todo-progress-tiles--intro .todo-progress-tile--done::before {
  animation: todo-tile-fill 480ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  animation-delay: calc(var(--i) * 60ms + 150ms);
}

.todo-progress-tiles--intro .todo-progress-tile-check {
  animation: todo-tile-check-draw 300ms ease-out backwards;
  animation-delay: calc(var(--i) * 60ms + 350ms);
}

.todo-progress-tile--fresh {
  z-index: 2;
  animation: todo-tile-bounce 650ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.todo-progress-tile--fresh::before {
  animation: todo-tile-fill 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.todo-progress-tile--fresh::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  animation: todo-tile-shockwave 750ms ease-out forwards;
  pointer-events: none;
}

.todo-progress-tile--fresh .todo-progress-tile-check {
  animation: todo-tile-check-draw 380ms ease-out 200ms backwards;
}

.todo-progress-burst {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 0;
  height: 0;
  pointer-events: none;
}

.todo-progress-spark {
  position: absolute;
  top: -4px;
  left: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tile-color);
  box-shadow: 0 0 6px var(--tile-glow);
  opacity: 0;
  animation: todo-spark 720ms cubic-bezier(0.22, 1, 0.36, 1) 60ms forwards;
}

.todo-progress-plus {
  position: absolute;
  top: -1.5rem;
  left: 0;
  color: var(--tile-color);
  font-size: 1rem;
  font-weight: 900;
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.95), 0 0 8px rgba(255, 255, 255, 0.8);
  opacity: 0;
  transform: translateX(-50%);
  animation: todo-plus-float 1000ms ease-out 80ms forwards;
}

.todo-progress-confetti {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.todo-progress-confetto {
  position: absolute;
  top: -14px;
  opacity: 0;
  animation: todo-confetti-fall 1900ms cubic-bezier(0.25, 0.6, 0.4, 1) forwards;
}

.todo-plan-achievements {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0.6rem;
  border-top: 1px dashed rgba(148, 163, 184, 0.35);
}

.todo-plan-achievements-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-right: 0.15rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 575px) {
  .todo-progress-card {
    grid-template-areas:
      'ring head'
      'tiles tiles';
    gap: 0.65rem 0.85rem;
    padding: 0.8rem 0.85rem;
  }

  .todo-progress-ring {
    width: 4.6rem;
    height: 4.6rem;
  }

  .todo-progress-ring-percent {
    font-size: 1.2rem;
  }

  .todo-progress-cheer {
    font-size: 0.98rem;
  }
}

.todo-plan-achievements-label .fa-icon {
  color: #f59e0b;
}

.todo-achievement-chip {
  display: inline-flex;
  align-items: center;
  max-width: 15rem;
  gap: 0.3rem;
  padding: 0.14rem 0.55rem 0.14rem 0.42rem;
  border: 1px solid var(--chip-border, rgba(16, 185, 129, 0.45));
  border-radius: 999px;
  background: var(--chip-tint, rgba(16, 185, 129, 0.14));
  color: #334155;
  font-size: 0.76rem;
  font-weight: 700;
}

.todo-achievement-chip .fa-icon {
  flex: none;
  width: 0.62rem;
  height: 0.62rem;
  color: var(--chip-color, #10b981);
}

.todo-achievement-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-achievement-chip--new {
  animation: todo-achievement-in 650ms cubic-bezier(0.22, 1, 0.36, 1);
}

.todo-achievement-more {
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: default;
}

html[data-dashboard-theme='flower'] .todo-achievement-chip {
  color: #102a4c;
}

/* dark.css forces light text on every button; bright mode needs it back for these chips. */
html[data-dashboard-theme='bright'] .todo-project-pill,
html[data-dashboard-theme='bright'] .todo-plan-filter-chip,
html[data-dashboard-theme='bright'] .todo-project-menu-item {
  color: #334155 !important;
}

html[data-dashboard-theme='bright'] .todo-project-tag--button {
  color: #475569 !important;
}

html[data-dashboard-theme='bright'] .todo-plan-filter-chip--idle,
html[data-dashboard-theme='bright'] .todo-project-tag--empty {
  color: #94a3b8 !important;
}

html[data-dashboard-theme='bright'] .todo-project-pill--active {
  color: #065f46 !important;
}

html[data-dashboard-theme='bright'] .todo-plan-filter-chip--active,
html[data-dashboard-theme='bright'] .todo-project-menu-item--active,
html[data-dashboard-theme='bright'] .todo-project-tag--button:hover,
html[data-dashboard-theme='bright'] .todo-project-tag--button:focus-visible {
  color: #0f172a !important;
}

html[data-dashboard-theme='flower'] .todo-progress-card {
  border-color: rgba(236, 72, 153, 0.24);
  background: linear-gradient(135deg, rgba(255, 253, 245, 0.92), rgba(253, 242, 248, 0.86));
  box-shadow: 0 14px 34px rgba(128, 78, 89, 0.1);
}

html[data-dashboard-theme='flower'] .todo-progress-plus {
  color: var(--tile-color) !important;
}

html[data-dashboard-theme='contrast'] .todo-progress-card {
  border-color: rgba(52, 211, 153, 0.26);
  background: linear-gradient(
    135deg,
    rgba(6, 78, 59, 0.45),
    rgba(15, 23, 42, 0.75) 55%,
    rgba(30, 27, 75, 0.5)
  );
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}

html[data-dashboard-theme='contrast'] .todo-progress-card--complete {
  border-color: rgba(52, 211, 153, 0.6);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.14), 0 0 36px rgba(16, 185, 129, 0.3);
}

html[data-dashboard-theme='contrast'] .todo-progress-ring-track {
  stroke: rgba(148, 163, 184, 0.16);
}

html[data-dashboard-theme='contrast'] .todo-progress-ring-percent,
html[data-dashboard-theme='contrast'] .todo-progress-cheer {
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .todo-progress-card--complete .todo-progress-cheer {
  color: #86efac;
}

html[data-dashboard-theme='contrast'] .todo-progress-ring-check {
  stroke: #4ade80;
}

html[data-dashboard-theme='contrast'] .todo-progress-plus {
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
}

html[data-dashboard-theme='contrast'] .todo-plan-achievements-label,
html[data-dashboard-theme='contrast'] .todo-achievement-more,
html[data-dashboard-theme='contrast'] .todo-progress-ring-sub {
  color: #94a3b8;
}

html[data-dashboard-theme='contrast'] .todo-achievement-chip {
  color: #e2e8f0;
}

html[data-dashboard-theme='contrast'] .todo-plan-achievements-label .fa-icon {
  color: #fbbf24;
}

.todo-plan-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.todo-plan-filter-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-right: 0.15rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.todo-plan-filter-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  min-height: 1.95rem;
  gap: 0.38rem;
  padding: 0.3rem 0.62rem;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease,
    transform 120ms ease;
}

.todo-plan-filter-chip:hover {
  border-color: var(--chip-color, #10b981);
  transform: translateY(-1px);
}

.todo-plan-filter-chip--idle {
  color: #94a3b8;
}

.todo-plan-filter-chip--active {
  border-color: var(--chip-color, #10b981);
  background: var(--chip-tint, rgba(16, 185, 129, 0.12));
  color: #0f172a;
  box-shadow: 0 0 0 2px var(--chip-tint, rgba(16, 185, 129, 0.14));
}

.todo-plan-filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  font-size: 0.68rem;
  line-height: 1;
}

.todo-plan-filter-count--progress {
  padding: 0 0.35rem;
  background: var(--chip-tint, rgba(16, 185, 129, 0.16));
  box-shadow: inset 0 0 0 1px var(--chip-color, #10b981);
}

.todo-plan-filter-count--complete {
  background: var(--chip-color, #10b981);
  box-shadow: none;
  color: #ffffff;
}

.todo-plan-hidden {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.7rem;
  padding: 0.3rem 0.7rem;
  border: 1px dashed rgba(148, 163, 184, 0.5);
  border-radius: 8px;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 700;
}

.todo-project-menu {
  position: fixed;
  z-index: 1045;
  width: 16rem;
  max-width: calc(100vw - 16px);
  padding: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}

.todo-project-menu-title {
  display: flex;
  min-width: 0;
  gap: 0.3rem;
  padding: 0.25rem 0.45rem 0.45rem;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
}

.todo-project-menu-title strong {
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-project-menu-list {
  display: grid;
  gap: 2px;
  max-height: 15rem;
  overflow-y: auto;
}

.todo-project-menu-item {
  appearance: none;
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.5rem;
  padding: 0.42rem 0.5rem;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #334155;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.todo-project-menu-item:hover,
.todo-project-menu-item:focus-visible,
.todo-project-menu-item--active {
  background: var(--chip-tint, rgba(148, 163, 184, 0.14));
  color: #0f172a;
  outline: none;
}

.todo-project-menu-item:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.6);
}

.todo-project-menu-item .fa-icon {
  color: #10b981;
}

.todo-project-menu-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-project-menu-item--new {
  margin-top: 0.3rem;
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0 0 7px 7px;
  color: #047857;
}

.todo-project-menu-create {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.4rem;
  padding: 0.5rem 0.3rem 0.2rem;
  border-top: 1px solid rgba(148, 163, 184, 0.25);
}

html[data-dashboard-theme='flower'] .todo-project-edit-row,
html[data-dashboard-theme='flower'] .todo-plan-filter-chip:not(.todo-plan-filter-chip--active) {
  background: rgba(255, 253, 245, 0.82);
}

html[data-dashboard-theme='flower'] .todo-project-menu {
  border-color: rgba(167, 103, 127, 0.3);
  background: rgba(255, 253, 249, 0.98);
  box-shadow: 0 18px 40px rgba(103, 61, 78, 0.2);
}

html[data-dashboard-theme='contrast'] .todo-project-edit-row,
html[data-dashboard-theme='contrast'] .todo-plan-filter-chip,
html[data-dashboard-theme='contrast'] .todo-project-menu {
  border-color: rgba(148, 163, 184, 0.42);
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
}

html[data-dashboard-theme='contrast'] .todo-plan-filter-chip--active {
  background: var(--chip-tint, rgba(52, 211, 153, 0.16));
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .todo-plan-filter-chip--idle,
html[data-dashboard-theme='contrast'] .todo-plan-filter-label,
html[data-dashboard-theme='contrast'] .todo-plan-hidden,
html[data-dashboard-theme='contrast'] .todo-project-edit-count,
html[data-dashboard-theme='contrast'] .todo-project-menu-title,
html[data-dashboard-theme='contrast'] .todo-project-tag--empty {
  color: #94a3b8;
}

html[data-dashboard-theme='contrast'] .todo-project-menu-title strong,
html[data-dashboard-theme='contrast'] .todo-project-menu-item {
  color: #e2e8f0;
}

html[data-dashboard-theme='contrast'] .todo-project-menu-item:hover,
html[data-dashboard-theme='contrast'] .todo-project-menu-item:focus-visible,
html[data-dashboard-theme='contrast'] .todo-project-menu-item--active {
  background: var(--chip-tint, rgba(148, 163, 184, 0.18));
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .todo-project-tag--button:hover,
html[data-dashboard-theme='contrast'] .todo-project-tag--button:focus-visible {
  background: rgba(30, 41, 59, 0.95);
  color: #f8fafc;
}

html[data-dashboard-theme='contrast'] .todo-project-tag--empty {
  background: transparent;
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

.todo-frog-card--can-wake {
  border-style: dashed;
}

.todo-frog-card--can-wake:hover {
  border-color: rgba(236, 72, 153, 0.72);
  box-shadow: 0 14px 30px rgba(236, 72, 153, 0.14);
}

.todo-frog-card--waking {
  animation: frog-card-wake 900ms ease-out both;
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

.todo-frog-card--drop-over .todo-frog-illustration {
  border-color: rgba(236, 72, 153, 0.72);
  transform: scale(1.02);
}

.todo-frog-card--waking .todo-frog-photo {
  animation: frog-wake-up 900ms cubic-bezier(0.2, 0.82, 0.3, 1) both;
}

.todo-frog-wake-glow {
  position: absolute;
  inset: 8% 5%;
  z-index: 0;
  border: 0.18rem solid rgba(236, 72, 153, 0.5);
  border-radius: 50%;
  box-shadow: 0 0 1.4rem rgba(16, 185, 129, 0.52), inset 0 0 1rem rgba(236, 72, 153, 0.28);
  pointer-events: none;
  animation: frog-wake-glow 820ms ease-out both;
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

.todo-frog-wake-hint {
  display: flex;
  align-items: center;
  margin: 0.55rem 0 0;
  color: #9d174d;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.35;
}

.todo-frog-card--drop-over .todo-frog-wake-hint {
  color: #047857;
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

.todo-frog-pill--wake::after {
  margin-left: 0.05rem;
  color: #ec4899;
  content: '↗';
  font-size: 0.76rem;
  line-height: 1;
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

.todo-plan-choice-group + .todo-plan-choice-group {
  margin-top: 0.9rem;
}

.todo-plan-choice-group-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.35rem 0 0.45rem;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.todo-plan-choice-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  font-size: 0.66rem;
  letter-spacing: 0;
}

html[data-dashboard-theme='contrast'] .todo-plan-choice-group-header {
  color: #cbd5e1;
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
  position: relative;
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
  overflow: hidden;
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

.todo-plan-card--done {
  border-color: rgba(219, 39, 119, 0.42);
  background: linear-gradient(135deg, rgba(253, 242, 248, 0.92), rgba(255, 255, 255, 0.96));
  cursor: default;
}

.todo-plan-card--done .todo-card-main,
.todo-plan-card--done .todo-card-meta,
.todo-plan-card--done .todo-card-notes {
  color: #64748b;
}

.todo-plan-card--done .todo-plan-index {
  background: #db2777;
}

.todo-plan-title {
  position: relative;
  z-index: 0;
}

.todo-plan-card--done .todo-plan-title::after {
  position: absolute;
  right: -0.18rem;
  left: -0.18rem;
  top: 52%;
  z-index: 1;
  height: 0.28rem;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(219, 39, 119, 0.2), #db2777, #ec4899);
  box-shadow: 0 2px 9px rgba(219, 39, 119, 0.22);
  content: '';
  transform-origin: left center;
  animation: todo-plan-strike-sweep 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.todo-plan-card--dragging,
.todo-plan-choice--dragging {
  opacity: 0.52;
  transform: scale(0.98);
}

.todo-plan-card--drop-before::before,
.todo-plan-card--drop-after::after {
  position: absolute;
  right: 0.65rem;
  left: 0.65rem;
  z-index: 3;
  height: 0.22rem;
  border-radius: 999px;
  background: linear-gradient(90deg, #10b981, #ec4899);
  box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.12);
  content: '';
}

.todo-plan-card--drop-before::before {
  top: 0.24rem;
}

.todo-plan-card--drop-after::after {
  bottom: 0.24rem;
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

  .todo-project-browser-header {
    align-items: stretch;
    flex-direction: column;
  }

  .todo-project-composer {
    grid-template-columns: 1fr;
  }

  .todo-project-edit-row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }

  .todo-project-edit-row .todo-project-color-picker {
    grid-column: 1 / -1;
    grid-row: 2;
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

.todo-add-icon {
  margin-right: 0.25rem;
}

/* The phone: compact rows, so a screen shows many todos instead of a few. Only the
   phone build sets html.ff-cloud; the Mac keeps its layout at every width. */
@media (max-width: 700px) {
  html.ff-cloud .todos-header {
    gap: 0.55rem;
  }

  html.ff-cloud .todos-header h3 {
    margin-bottom: 0.15rem !important;
    font-size: 1.45rem;
  }

  html.ff-cloud .todos-header-actions {
    width: 100%;
    gap: 0.35rem;
  }

  html.ff-cloud .todos-header-actions .btn-group {
    flex: 1 1 auto;
  }

  html.ff-cloud .todos-header-actions .btn {
    padding: 0.28rem 0.4rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  html.ff-cloud .todos-header-actions .btn-group .fa-icon {
    display: none;
  }

  /* Projects: one row that scrolls sideways. */
  html.ff-cloud .todo-project-browser {
    padding: 0.55rem 0.7rem;
  }

  html.ff-cloud .todo-project-browser-header {
    flex-direction: row;
    align-items: center;
  }

  html.ff-cloud .todo-project-help {
    display: none;
  }

  html.ff-cloud .todo-project-browser-actions .btn {
    padding: 0.2rem 0.45rem;
    font-size: 0.78rem;
  }

  html.ff-cloud .todo-project-list,
  html.ff-cloud .todo-plan-filter,
  html.ff-cloud .todo-frog-picker {
    flex-wrap: nowrap;
    margin-top: 0.5rem;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  html.ff-cloud .todo-project-list::-webkit-scrollbar,
  html.ff-cloud .todo-plan-filter::-webkit-scrollbar,
  html.ff-cloud .todo-frog-picker::-webkit-scrollbar {
    display: none;
  }

  html.ff-cloud .todo-project-pill,
  html.ff-cloud .todo-plan-filter-chip,
  html.ff-cloud .todo-frog-pill {
    flex: 0 0 auto;
    min-height: 1.85rem;
    padding: 0.22rem 0.6rem;
    white-space: nowrap;
  }

  html.ff-cloud .todo-plan-filter-label {
    flex: 0 0 auto;
  }

  /* Day plan: header in one row, a smaller frog and progress card. */
  html.ff-cloud .todo-plan-header {
    flex-direction: row;
    align-items: center;
    margin-bottom: 0.6rem;
    padding-bottom: 0.6rem;
  }

  html.ff-cloud .todo-plan-toolbar .btn {
    padding: 0.2rem 0.45rem;
    font-size: 0.78rem;
  }

  html.ff-cloud .todo-progress-card {
    padding: 0.6rem 0.7rem;
  }

  html.ff-cloud .todo-progress-ring {
    width: 3.6rem;
    height: 3.6rem;
  }

  html.ff-cloud .todo-plan-panel {
    padding: 0.65rem;
  }

  html.ff-cloud .todo-frog-card {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.7rem;
    margin-top: 0.7rem;
    padding: 0.65rem;
  }

  html.ff-cloud .todo-frog-illustration {
    width: 5.2rem;
    height: 4rem;
    justify-self: auto;
  }

  html.ff-cloud .todo-frog-content h5 {
    font-size: 1rem;
  }

  html.ff-cloud .todo-frog-copy {
    font-size: 0.9rem;
  }

  /* Todos: one compact row each (title, then one line of details). */
  html.ff-cloud .todo-plan-list {
    gap: 0.35rem;
    margin-top: 0.55rem;
  }

  html.ff-cloud .todo-plan-card,
  html.ff-cloud .todo-plan-choice {
    align-items: center;
    gap: 0.5rem;
    padding: 0.42rem 0.5rem;
    border-left-width: 4px;
  }

  html.ff-cloud .todo-plan-card {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  html.ff-cloud .todo-plan-choice {
    grid-template-columns: minmax(0, 1fr) auto;
    margin-top: 0.35rem;
  }

  html.ff-cloud .todo-plan-index {
    width: 1.45rem;
    height: 1.45rem;
    font-size: 0.75rem;
  }

  html.ff-cloud .todo-card-title-row {
    gap: 0.35rem;
    font-size: 0.92rem;
    line-height: 1.25;
  }

  /* A long title wraps once instead of being cut short. */
  html.ff-cloud .todo-card-title-row strong {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  html.ff-cloud .todo-card-meta {
    flex-wrap: nowrap;
    gap: 0.35rem;
    margin-top: 0.1rem;
    overflow: hidden;
    font-size: 0.72rem;
    white-space: nowrap;
  }

  html.ff-cloud .todo-card-meta > * {
    flex: 0 0 auto;
  }

  html.ff-cloud .todo-card-meta .todo-project-tag {
    flex: 0 1 auto;
    min-width: 0;
    padding-top: 0;
    padding-bottom: 0;
    overflow: hidden;
  }

  html.ff-cloud .todo-card-meta .todo-project-tag span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  html.ff-cloud .todo-add-label {
    display: none;
  }

  html.ff-cloud .todo-add-icon {
    margin-right: 0;
  }

  html.ff-cloud .todo-card-notes {
    margin-top: 0.1rem;
    overflow: hidden;
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  html.ff-cloud .todo-drag-handle {
    display: none;
  }

  html.ff-cloud .todo-plan-actions,
  html.ff-cloud .todo-card-actions {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.3rem;
  }

  html.ff-cloud .todo-plan-actions .btn,
  html.ff-cloud .todo-card-actions .btn {
    padding: 0.2rem 0.45rem;
    font-size: 0.78rem;
  }

  html.ff-cloud .todo-plan-choice-group-header {
    margin: 0.55rem 0 0.1rem;
  }

  /* The list view's cards: the same compact row. */
  html.ff-cloud .todo-card {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.35rem;
    padding: 0.42rem 0.5rem;
    border-left-width: 4px;
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
  .todo-frog-card,
  .todo-project-pill,
  .todo-project-color,
  .todo-project-tag--button,
  .todo-plan-filter-chip,
  .todo-progress-card,
  .todo-cheer-enter-active,
  .todo-cheer-leave-active {
    transition: none;
  }

  .todo-progress-card--complete .todo-progress-ring-value,
  .todo-progress-ring-check,
  .todo-progress-tile,
  .todo-progress-tile::before,
  .todo-progress-tile-check,
  .todo-progress-card--complete .todo-progress-tile--done::before,
  .todo-progress-tiles--intro .todo-progress-tile--done::before,
  .todo-progress-tiles--intro .todo-progress-tile-check,
  .todo-progress-tile--fresh .todo-progress-tile-check,
  .todo-achievement-chip--new {
    animation: none;
  }

  .todo-progress-tile--fresh::after,
  .todo-progress-burst,
  .todo-progress-confetti {
    display: none;
  }

  .todo-frog-illustration--ready .todo-frog-photo,
  .todo-frog-illustration--ready::after,
  .todo-frog-card--eaten .todo-frog-photo,
  .todo-frog-card--waking,
  .todo-frog-card--waking .todo-frog-photo,
  .todo-frog-wake-glow {
    animation: none;
  }

  .todo-confetti {
    display: none;
  }

  .todo-check-button--complete,
  .todo-check-button--done {
    animation: none;
  }

  .todo-plan-card--done .todo-plan-title::after {
    animation: none;
  }
}

@keyframes todo-ring-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.45));
  }

  50% {
    filter: drop-shadow(0 0 12px rgba(52, 211, 153, 0.95));
  }
}

@keyframes todo-check-draw {
  from {
    stroke-dashoffset: 22;
  }

  to {
    stroke-dashoffset: 0;
  }
}

@keyframes todo-tile-fill {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }

  60% {
    opacity: 1;
    transform: scale(1.12);
  }

  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes todo-tile-check-draw {
  from {
    stroke-dashoffset: 15;
  }

  to {
    stroke-dashoffset: 0;
  }
}

@keyframes todo-tile-bounce {
  0% {
    transform: scale(1);
  }

  35% {
    transform: scale(1.22, 1.3);
  }

  65% {
    transform: scale(0.94);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes todo-tile-shockwave {
  0% {
    background: rgba(255, 255, 255, 0.75);
    box-shadow: 0 0 0 0 var(--tile-glow);
  }

  100% {
    background: rgba(255, 255, 255, 0);
    box-shadow: 0 0 0 14px rgba(255, 255, 255, 0);
  }
}

@keyframes todo-tile-shimmer {
  0%,
  78%,
  100% {
    filter: brightness(1);
  }

  86% {
    filter: brightness(1.35) saturate(1.15);
  }
}

@keyframes todo-spark {
  0% {
    opacity: 1;
    transform: rotate(var(--angle)) translateY(0) scale(1);
  }

  70% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(calc(var(--distance) * -1)) scale(0.3);
  }
}

@keyframes todo-plus-float {
  0% {
    opacity: 0;
    transform: translate(-50%, 8px) scale(0.6);
  }

  25% {
    opacity: 1;
    transform: translate(-50%, -4px) scale(1.2);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -26px) scale(1);
  }
}

@keyframes todo-confetti-fall {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg);
  }

  85% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(var(--drift), 260px) rotate(var(--spin));
  }
}

@keyframes todo-achievement-in {
  0% {
    opacity: 0;
    transform: translateY(4px) scale(0.85);
  }

  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes todo-plan-strike-sweep {
  0% {
    opacity: 0;
    transform: scaleX(0) translateY(-50%);
  }

  42% {
    opacity: 1;
  }

  100% {
    opacity: 1;
    transform: scaleX(1) translateY(-50%);
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

@keyframes frog-card-wake {
  0% {
    box-shadow: 0 12px 28px rgba(16, 185, 129, 0.11);
  }

  38% {
    border-color: #ec4899;
    box-shadow: 0 0 0 0.4rem rgba(236, 72, 153, 0.13), 0 18px 34px rgba(16, 185, 129, 0.24);
  }

  100% {
    box-shadow: 0 12px 28px rgba(16, 185, 129, 0.11);
  }
}

@keyframes frog-wake-up {
  0% {
    opacity: 0.35;
    transform: translate3d(0, 0.7rem, 0) rotate(0deg) scale(0.78);
  }

  38% {
    opacity: 1;
    transform: translate3d(-0.08rem, -0.9rem, 0) rotate(-7deg) scale(1.1);
  }

  64% {
    transform: translate3d(0.1rem, -0.32rem, 0) rotate(4deg) scale(0.98);
  }

  82% {
    transform: translate3d(-0.04rem, -0.55rem, 0) rotate(-2deg) scale(1.035);
  }

  100% {
    opacity: 1;
    transform: translate3d(0, -0.24rem, 0) rotate(-1.2deg) scale(1.01);
  }
}

@keyframes frog-wake-glow {
  0% {
    opacity: 0;
    transform: scale(0.42);
  }

  42% {
    opacity: 0.88;
  }

  100% {
    opacity: 0;
    transform: scale(1.18);
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

html[data-dashboard-theme='contrast'] .todo-frog-illustration {
  border-color: rgba(16, 185, 129, 0.62);
  background: #16202e;
  box-shadow: 0 16px 28px rgba(0, 0, 0, 0.36);
}

html[data-dashboard-theme='contrast'] .todo-frog-illustration::after {
  background: rgba(0, 0, 0, 0.55);
}
</style>
