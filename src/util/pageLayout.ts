// How wide a page that is normally as wide as Hours wants the window right now: 'wide' is the
// full window, 'narrow' leaves more room left and right. The Todos page is narrow while its
// day plan shows alone and wide while the available todos are open beside it. App.vue reads it.
import Vue from 'vue';

export type PageWidth = 'normal' | 'wide' | 'narrow';

export const pageLayout = Vue.observable({ width: 'normal' as PageWidth });
