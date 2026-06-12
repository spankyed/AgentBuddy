<template>
  <media-player
    class="w-full h-full video-player"
    :title="fileName"
    :src="source"
    playsinline
    load="eager"
  >
    <media-provider />
    <media-video-layout color-scheme="dark" />
  </media-player>
</template>

<script setup lang="ts">
import 'vidstack/player/styles/default/theme.css'
import 'vidstack/player/styles/default/layouts/video.css'
import 'vidstack/player'
import 'vidstack/player/layouts/default'
import 'vidstack/player/ui'
import { computed } from 'vue'

const props = defineProps<{ filePath: string }>()

// Mirrors MIME_TYPES in packages/main/src/modules/media-protocol/MediaProtocol.ts.
// The local-file:// URL carries the path in a query param, so Vidstack cannot
// infer the media type from the URL extension — it must be set explicitly.
const MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
}

const fileName = computed(() => props.filePath.split('/').pop() ?? '')

const source = computed(() => ({
  src: `local-file://file?path=${encodeURIComponent(props.filePath)}`,
  type: MIME_TYPES[props.filePath.split('.').pop()?.toLowerCase() ?? ''] ?? 'video/mp4',
}))
</script>

<style scoped>
.video-player {
  --media-brand: #f5f5f5;
  background: #0a0a0a;
  border-radius: 0;
}
</style>
