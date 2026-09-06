export function shouldShowStartupWindow(isPackaged: boolean): boolean {
  return !isPackaged;
}
