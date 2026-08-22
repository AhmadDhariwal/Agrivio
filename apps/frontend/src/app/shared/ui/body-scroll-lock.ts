/**
 * Reference-counted body scroll lock utility.
 * Prevents multiple overlapping modals / drawers from desynchronizing document body overflow.
 */
let bodyScrollLockCount = 0;
let previousBodyOverflow = '';
let previousBodyPaddingRight = '';

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;

    // Check if a scrollbar is present to prevent layout shift on desktop
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || bodyScrollLockCount === 0) {
    return;
  }
  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
}

export function isBodyScrollLocked(): boolean {
  return bodyScrollLockCount > 0;
}
