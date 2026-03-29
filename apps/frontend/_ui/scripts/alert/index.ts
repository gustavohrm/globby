import { DEFAULT_DURATION, MAX_ALERTS } from "./constants";
import { getOrCreateContainer, createAlertElement } from "./dom";
import { animateIn, animateOut } from "./animations";

type AlertType = "success" | "error" | "warning" | "info";
interface AlertOptions {
  message: string;
  type?: AlertType;
  duration?: number;
  isDismissable?: boolean;
  /** Defaults to true. When `isDismissable` is false, auto-dismiss is always active. */
  autoDismiss?: boolean;
  hasIcon?: boolean;
}

const dismissing = new WeakSet<HTMLDivElement>();

function removeAlert(alertElement: HTMLDivElement): void {
  const container = getOrCreateContainer();

  if (!container.contains(alertElement) || dismissing.has(alertElement)) return;

  dismissing.add(alertElement);

  animateOut(alertElement, () => {
    if (container.contains(alertElement)) {
      container.removeChild(alertElement);
    }
  });
}

export function showAlert(options: AlertOptions): void {
  const container = getOrCreateContainer();

  const activeAlerts = Array.from(container.children).filter(
    (child) => !dismissing.has(child as HTMLDivElement),
  ) as HTMLDivElement[];

  while (activeAlerts.length >= MAX_ALERTS) {
    removeAlert(activeAlerts[0]);
    activeAlerts.shift();
  }

  const alertElement = createAlertElement(options, () => removeAlert(alertElement));

  container.appendChild(alertElement);
  animateIn(alertElement);

  const shouldAutoDismiss = !options.isDismissable || (options.autoDismiss ?? true);

  if (shouldAutoDismiss) {
    const duration = options.duration ?? DEFAULT_DURATION;
    setTimeout(() => removeAlert(alertElement), duration);
  }
}

export type { AlertType, AlertOptions };
export { DEFAULT_TYPE, DEFAULT_DURATION, MAX_ALERTS } from "./constants";
