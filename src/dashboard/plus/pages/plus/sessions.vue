<template>
  <div class="page-wrapper">
    <div class="page-header">
      <div class="page-title">◎ Session Manager</div>
      <div class="page-subtitle">Redirecting to Sessions…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
router.replace('/Sessions');
</script>
