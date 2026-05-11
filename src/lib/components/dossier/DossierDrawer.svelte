<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children?: Snippet;
  };
  let { open, title = '', onClose, children }: Props = $props();

  let panelEl: HTMLElement | null = $state(null);
  let previousFocus: HTMLElement | null = null;

  /**
   * Escape to close, focus management on open/close. Side panel rather than a
   * strict modal (`aria-modal="false"`), so we don't trap focus — only
   * redirect it on open so keyboard users land somewhere useful, and restore
   * it on close so they resume where they were.
   *
   * Escape is scoped: we only act when the user's focus is somewhere inside
   * the drawer. A page-wide window listener would swallow Escape from any
   * unrelated future popover. Auto-focus uses `tick()` so we wait for the
   * `bind:this={panelEl}` write rather than relying on `queueMicrotask`
   * timing. Focus restore checks `isConnected` so we don't silently no-op
   * when the previously-focused element was unmounted between open and close.
   */
  $effect(() => {
    if (!open) {
      if (previousFocus) {
        const prev = previousFocus;
        previousFocus = null;
        if (prev.isConnected) {
          prev.focus();
        } else {
          // Fallback: land somewhere sensible so keyboard users aren't
          // dumped at the top of the document. `<main>` is the operational
          // anchor (it carries `tabindex="-1"` at the op route layout), and
          // `<html>` is the last-resort always-focusable target — calling
          // `.focus()` on `<body>` without a tabindex is a silent no-op.
          const fallback =
            document.querySelector<HTMLElement>('main[tabindex]') ?? document.documentElement;
          fallback.focus({ preventScroll: true });
        }
      }
      return;
    }
    previousFocus = (document.activeElement as HTMLElement | null) ?? null;
    void tick().then(() => {
      if (!panelEl) return;
      // Filter out disabled / hidden / aria-hidden controls so a disabled
      // first input doesn't silently swallow focus (which then evaporates).
      // `input[type="hidden"]` is excluded by `:not([type="hidden"])`.
      const target = panelEl.querySelector<HTMLElement>(
        [
          'input:not([disabled]):not([hidden]):not([aria-hidden="true"]):not([type="hidden"])',
          'textarea:not([disabled]):not([hidden]):not([aria-hidden="true"])',
          'select:not([disabled]):not([hidden]):not([aria-hidden="true"])',
          'button:not([disabled]):not([hidden]):not([aria-hidden="true"]):not([aria-label="Close"])'
        ].join(', ')
      );
      target?.focus();
    });
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return;
      // Only act when the keystroke originated inside the drawer; otherwise
      // we'd hijack Escape from unrelated UI (future popovers, browser
      // dialogs, etc.).
      const active = document.activeElement as HTMLElement | null;
      if (!panelEl || !active || !panelEl.contains(active)) return;
      ev.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <!-- `<div role="dialog">` rather than `<aside>` because dialog is an
       interactive role and `<aside>` carries an implicit non-interactive
       complementary role. -->
  <div
    bind:this={panelEl}
    role="dialog"
    aria-modal="false"
    aria-label={title || 'Dossier'}
    class="flex w-96 flex-col border-l border-neutral-800 bg-neutral-900/80 text-sm"
  >
    <header class="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
      <button
        type="button"
        onclick={onClose}
        class="text-neutral-400 hover:text-neutral-200"
        aria-label="Close"
      >
        <span aria-hidden="true">×</span>
      </button>
    </header>
    <div class="flex-1 overflow-y-auto p-3">
      {@render children?.()}
    </div>
  </div>
{/if}
