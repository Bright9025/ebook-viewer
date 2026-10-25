<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number | string
    stroke?: number
  }>(),
  { size: 18, stroke: 1.7 }
)

const icons: Record<string, string[]> = {
  book: [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'
  ],
  'book-open': [
    'M12 7v14',
    'M3 5.5A2.5 2.5 0 0 1 5.5 3H9a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H3z',
    'M21 5.5A2.5 2.5 0 0 0 18.5 3H15a3 3 0 0 0-3 3v15a3 3 0 0 1 3-3h6z'
  ],
  search: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M21 21l-4.2-4.2'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2',
    'M12 20v2',
    'M4.9 4.9l1.4 1.4',
    'M17.7 17.7l1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'M4.9 19.1l1.4-1.4',
    'M17.7 6.3l1.4-1.4'
  ],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  monitor: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 15h10l1-15', 'M10 11v6', 'M14 11v6'],
  'arrow-left': ['M19 12H5', 'M11 18l-6-6 6-6'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  bookmark: ['M6 3h12v18l-6-4.2L6 21z'],
  'bookmark-plus': ['M6 3h12v18l-6-4.2L6 21z', 'M12 8v6', 'M9 11h6'],
  type: ['M4 7V5h16v2', 'M9 19h6', 'M12 5v14'],
  ghost: [
    'M5 20V11a7 7 0 0 1 14 0v9l-2.4-1.6L14 20l-2-1.6L10 20l-2.6-1.6z',
    'M9.5 11h.01',
    'M14.5 11h.01'
  ],
  expand: ['M8 3H3v5', 'M16 3h5v5', 'M3 16v5h5', 'M21 16v5h-5'],
  shrink: ['M3 8h5V3', 'M21 8h-5V3', 'M3 16h5v5', 'M21 16h-5v5'],
  maximize: ['M4 4h16v16H4z'],
  restore: ['M8 8h12v12H8z', 'M4 16V4h12'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  settings: ['M4 6h16', 'M4 12h16', 'M4 18h16', 'M8 4v4', 'M16 10v4', 'M10 16v4'],
  check: ['M5 12l5 5L20 7'],
  eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  'eye-off': ['M3 3l18 18', 'M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6', 'M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.5-.6'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
  coffee: ['M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z', 'M17 9h1.5a2.5 2.5 0 0 1 0 5H17', 'M7 3v2', 'M11 3v2']
}

const paths = computed(() => icons[props.name] ?? icons.book)
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(path, index) in paths" :key="index" :d="path" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: none;
  overflow: visible;
}
</style>
