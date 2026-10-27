import { useEffect, useState } from 'react';

/** Minimal toast bus: any module can fire `frethub:toast` window events. */
export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent('frethub:toast', { detail: message }));
}

export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: number;
    const handler = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 2200);
    };
    window.addEventListener('frethub:toast', handler);
    return () => {
      window.removeEventListener('frethub:toast', handler);
      window.clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return <div className="toast" role="status" aria-live="polite">{message}</div>;
}
