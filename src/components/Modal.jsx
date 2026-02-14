import { useEffect, useRef } from 'react';

let modalIdSeed = 0;
const modalStack = [];

const pushModal = (id) => {
  modalStack.push(id);
};

const removeModal = (id) => {
  const index = modalStack.lastIndexOf(id);
  if (index >= 0) modalStack.splice(index, 1);
};

const isTopModal = (id) => modalStack.length > 0 && modalStack[modalStack.length - 1] === id;

const getFocusable = (root) => {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll(
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled])',
    ),
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return !el.hasAttribute('disabled') && style.visibility !== 'hidden' && style.display !== 'none';
  });
};

function Modal({
  isOpen,
  onClose,
  ariaLabel = 'Dialog',
  panelClassName = '',
  children,
  closeOnOverlay = true,
}) {
  const panelRef = useRef(null);
  const lastActiveRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(0);

  if (!modalIdRef.current) {
    modalIdRef.current = ++modalIdSeed;
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const modalId = modalIdRef.current;
    pushModal(modalId);

    lastActiveRef.current = document.activeElement;
    const panel = panelRef.current;

    const focusFirst = () => {
      if (!isTopModal(modalId)) return;
      const preferred = panel?.querySelector('[data-modal-autofocus="true"], [autofocus]');
      if (preferred && typeof preferred.focus === 'function' && !preferred.hasAttribute('disabled')) {
        preferred.focus();
        return;
      }
      const focusable = getFocusable(panel);
      const target = focusable[0] || panel;
      if (target && typeof target.focus === 'function') target.focus();
    };

    const handleKeyDown = (e) => {
      if (!isTopModal(modalId)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;
      const focusable = getFocusable(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => focusFirst());

    return () => {
      removeModal(modalId);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      const lastActive = lastActiveRef.current;
      if (lastActive && typeof lastActive.focus === 'function') lastActive.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-slate-900/35"
        onClick={closeOnOverlay ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative z-10 ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
