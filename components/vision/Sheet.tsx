// A bottom sheet on a native <dialog>: modal, focus-trapped, Escape and a tap
// on the scrim close it. It slides up with --ease-out and back down on close.
import { useEffect, useRef, type ReactNode } from "react";
import { reducedMotion } from "./motion";
import styles from "./sheet.module.css";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.removeAttribute("data-closing");
      d.showModal();
    } else if (!open && d.open) {
      d.setAttribute("data-closing", "");
      const t = setTimeout(() => {
        d.close();
        d.removeAttribute("data-closing");
      }, reducedMotion() ? 0 : 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      // A click on the dialog element itself (not its content) is a click on the scrim.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.body}>
        <div className={styles.grabber} aria-hidden />
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
