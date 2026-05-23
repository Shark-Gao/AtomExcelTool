<script setup lang="ts">
import { computed } from 'vue'

export type PrimitiveType = 'string' | 'number' | 'boolean'

const props = withDefaults(
  defineProps<{
    type: PrimitiveType
    modelValue: string | number | boolean
    disabled?: boolean
    size?: 'xs' | 'sm'
  }>(),
  {
    disabled: false,
    size: 'xs'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number | boolean]
}>()

const inputClass = computed(() => {
  const sizeClass = props.size === 'xs' ? 'input-xs h-6' : 'input-sm'
  return `input input-bordered ${sizeClass} w-full`
})

const toggleClass = computed(() => {
  return props.size === 'xs' ? 'toggle toggle-primary toggle-xs' : 'toggle toggle-primary toggle-sm'
})

const checkboxClass = computed(() => {
  return props.size === 'xs' ? 'checkbox checkbox-xs' : 'checkbox checkbox-sm'
})

function handleStringInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function handleNumberInput(event: Event) {
  emit('update:modelValue', Number((event.target as HTMLInputElement).value))
}

function handleBooleanChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <input
    v-if="type === 'string'"
    :value="modelValue as string"
    type="text"
    :class="inputClass"
    :disabled="disabled"
    @input="handleStringInput"
  />
  <input
    v-else-if="type === 'number'"
    :value="modelValue as number"
    type="number"
    :class="inputClass"
    :disabled="disabled"
    @input="handleNumberInput"
  />
  <input
    v-else-if="type === 'boolean'"
    :checked="modelValue as boolean"
    type="checkbox"
    :class="toggleClass"
    :disabled="disabled"
    @change="handleBooleanChange"
  />
</template>
