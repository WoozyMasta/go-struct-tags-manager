export function debounced<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => fn(...args), wait)
  }) as T
}
