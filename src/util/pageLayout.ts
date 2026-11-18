// How wide a page that is normally as wide as Hours wants the window right now: 'wide' is the
// full window. The Todos page is as wide as Hours while its day plan shows alone and wide while
// the available todos are open beside it. App.vue reads it.
import Vue from 'vue';

export type PageWidth = 'normal' | 'wide';

export const pageLayout = Vue.observable({ width: 'normal' as PageWidth });
