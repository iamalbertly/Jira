// Shared modal behavior primitive
export function createModalBehavior(modalSelector, opts = {}) {
  const modal = document.querySelector(modalSelector);
  if (!modal) return { close: () => {} };

  const onClose = () => {
    modal.classList.remove('is-open');
    if (opts.onClose) opts.onClose();
  };

  const onOpen = () => {
    modal.classList.add('is-open');
    if (opts.onOpen) opts.onOpen();
  };

  // overlay click
  const clickHandler = (e) => {
    if (e.target === modal || e.target.matches('[data-modal-close]') || e.target.matches('.modal-close-btn')) onClose();
  };

  // escape key
  const keyHandler = (e) => {
    if (e.key === 'Escape') onClose();
  };

  modal.addEventListener('click', clickHandler);
  document.addEventListener('keydown', keyHandler);

  return {
    open: onOpen,
    close: onClose,
    destroy: () => {
      modal.removeEventListener('click', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    },
  };
}
