/**
 * Where to portal a floating layer (tooltip, menu, popover) opened from `anchor`. A modal `<dialog>` lives in
 * the browser's top layer, which paints over everything outside it, so a layer opened from inside a drawer
 * has to live inside that drawer to be seen and clicked. Anywhere else it goes to the end of `<body>`.
 */
export function portalRoot(anchor: Element | null): HTMLElement {
  return anchor?.closest<HTMLElement>('dialog') ?? document.body;
}
