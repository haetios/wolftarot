<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'fr' },
})

useSeoMeta({
  title: 'Wolftarot',
  description: 'Jouez au Tarot en ligne.',
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
