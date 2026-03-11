import { useCallback, useRef, useState } from 'react';

export default function useAsyncDialog() {
  const resolverRef = useRef(null);
  const [dialog, setDialog] = useState(() => ({
    isOpen: false,
    mode: 'confirm',
    title: '확인',
    message: '',
    confirmText: '확인',
    cancelText: '취소',
  }));

  const closeDialog = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog((current) => (current.isOpen ? { ...current, isOpen: false } : current));
    resolve?.(!!value);
  }, []);

  const openDialog = useCallback((mode, message, options = {}) => {
    if (resolverRef.current) {
      try {
        resolverRef.current(false);
      } catch {
        // ignore
      }
      resolverRef.current = null;
    }

    setDialog({
      isOpen: true,
      mode,
      title: String(options.title || (mode === 'alert' ? '알림' : '확인')),
      message: String(message ?? ''),
      confirmText: String(options.confirmText || '확인'),
      cancelText: mode === 'alert' ? '' : String(options.cancelText || '취소'),
    });

    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirmAsync = useCallback((message, options = {}) => openDialog('confirm', message, options), [openDialog]);
  const alertAsync = useCallback((message, options = {}) => openDialog('alert', message, options), [openDialog]);

  return {
    dialog,
    closeDialog,
    confirmAsync,
    alertAsync,
  };
}
