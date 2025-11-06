<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  isVisible: boolean
}

defineProps<Props>()

const skeletonItems = computed(() => {
  return Array.from({ length: 8 }, (_, i) => i)
})
</script>

<template>
  <Transition name="skeleton">
    <div v-if="isVisible" class="fixed inset-0 z-[10000] bg-base-100 overflow-hidden">
      <div class="h-full flex flex-col">
        <!-- Header Skeleton -->
        <div class="sticky top-0 z-10 border-b border-base-300 bg-base-100 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div class="flex gap-3">
              <div class="skeleton h-10 w-32"></div>
              <div class="skeleton h-10 w-20"></div>
              <div class="skeleton h-10 w-24"></div>
            </div>
            <div class="flex gap-3">
              <div class="skeleton h-6 w-40"></div>
              <div class="skeleton h-6 w-48"></div>
            </div>
          </div>
        </div>

        <div class="flex flex-1 min-h-0 gap-4 p-6">
          <!-- Left Sidebar Skeleton -->
          <aside class="w-64 flex flex-col gap-3">
            <div class="skeleton h-10 w-full"></div>
            <div class="space-y-2 flex-1">
              <div v-for="i in 12" :key="`left-${i}`" class="skeleton h-8 w-full"></div>
            </div>
          </aside>

          <!-- Main Content Skeleton -->
          <div class="flex-1 flex flex-col gap-4">
            <!-- Section Header -->
            <div class="space-y-2">
              <div class="skeleton h-8 w-48"></div>
              <div class="skeleton h-4 w-96"></div>
            </div>

            <!-- Top Toolbar -->
            <div class="skeleton h-10 w-80"></div>

            <!-- Content Grid -->
            <div class="flex-1 overflow-hidden">
              <div class="grid grid-cols-4 gap-4">
                <div v-for="i in skeletonItems" :key="`card-${i}`" class="space-y-3 p-4 border border-base-300 rounded-lg">
                  <div class="skeleton h-6 w-24"></div>
                  <div class="space-y-2">
                    <div class="skeleton h-8 w-full"></div>
                    <div class="skeleton h-6 w-3/4"></div>
                  </div>
                  <div class="pt-2 flex gap-2">
                    <div class="skeleton h-8 w-16"></div>
                    <div class="skeleton h-8 w-16"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.skeleton-enter-active,
.skeleton-leave-active {
  transition: opacity 0.3s ease;
}

.skeleton-enter-from,
.skeleton-leave-to {
  opacity: 0;
}
</style>
