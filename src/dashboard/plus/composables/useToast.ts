export function useToast() {
  const toasts = useState<
    Array<{ id: number; message: string; type: "success" | "error" | "info" }>
  >("toasts", () => []);
  let nextId = 0;

  function show(
    message: string,
    type: "success" | "error" | "info" = "info",
    duration = 3500,
  ) {
    const id = ++nextId;
    toasts.value.push({ id: id, message: message, type: type });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, duration);
  }

  function success(message: string) {
    show(message, "success");
  }

  function error(message: string) {
    show(message, "error", 5000);
  }

  function info(message: string) {
    show(message, "info");
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts: readonly(toasts), success, error, info, dismiss };
}
