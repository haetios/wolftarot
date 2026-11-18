<template>
  <div class="flex min-h-dvh flex-col">
    <UHeader
      title="Wolftarot"
      to="/"
    >
      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
