<template>
  <Teleport to="body">
    <div class="toasts-container" role="alert" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast-${toast.type}`"
        @click="dismiss(toast.id)"
      >
        <span class="toast-icon">{{ icons[toast.type] }}</span>
        <span class="toast-msg">{{ toast.message }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const { toasts, dismiss } = useToast();

const icons: Record<string, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};
</script>

<style scoped>
.toasts-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(12px);
  animation: slide-up 0.25s ease;
  pointer-events: all;
  cursor: pointer;
  max-width: min(340px, calc(100vw - 48px));
}

.toast-success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #4ade80;
}

.toast-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.toast-info {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}

.toast-icon {
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 600px) {
  .toasts-container {
    bottom: 60px;
    left: 24px;
    right: 24px;
    align-items: stretch;
  }

  .toast {
    max-width: 100%;
  }
}
</style>
