// A page that is narrow by default (like Hours) can ask for the full window width while it
// shows more: the Todos page does while its available todos are open. App.vue reads it.
import Vue from 'vue';

export const pageLayout = Vue.observable({ wide: false });
