import type { AlertOptions } from "./index";
import {
  ALERT_COLORS,
  ALERT_ICON_SVGS,
  ALERT_BASE_CLASSES,
  CLOSE_ICON_SVG,
  CONTAINER_CLASSES,
  CONTAINER_ID,
  DEFAULT_TYPE,
} from "./constants";

function createSvgElement(svgMarkup: string): SVGElement {
  const template = document.createElement("template");
  template.innerHTML = svgMarkup.trim();

  return template.content.firstElementChild as SVGElement;
}

function createIconElement(svgMarkup: string): SVGElement {
  const icon = createSvgElement(svgMarkup);
  icon.classList.add("w-5", "h-5", "shrink-0");
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function createDismissButton(onDismiss: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "ml-auto inline-flex items-center justify-center cursor-pointer shrink-0";
  button.setAttribute("aria-label", "Dismiss alert");
  const closeIcon = createSvgElement(CLOSE_ICON_SVG);
  closeIcon.classList.add("w-3", "h-3", "shrink-0");
  closeIcon.setAttribute("aria-hidden", "true");
  button.appendChild(closeIcon);
  button.addEventListener("click", onDismiss);
  return button;
}

export function createAlertElement(
  options: AlertOptions,
  onDismiss: () => void,
): HTMLDivElement {
  const type = options.type ?? DEFAULT_TYPE;

  const alert = document.createElement("div");
  alert.className = `${ALERT_COLORS[type]} ${ALERT_BASE_CLASSES}`;
  alert.setAttribute("role", "alert");
  alert.setAttribute("aria-atomic", "true");

  const hasIcon = options.hasIcon ?? true;
  if (hasIcon) {
    alert.appendChild(createIconElement(ALERT_ICON_SVGS[type]));
  }

  const messageSpan = document.createElement("span");
  messageSpan.textContent = options.message;
  alert.appendChild(messageSpan);

  if (options.isDismissable) {
    alert.appendChild(createDismissButton(onDismiss));
  }

  return alert;
}

export function getOrCreateContainer(): HTMLDivElement {
  let container = document.getElementById(
    CONTAINER_ID,
  ) as HTMLDivElement | null;

  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = CONTAINER_CLASSES;

    const target = document.body ?? document.documentElement;
    target.appendChild(container);
  }

  return container;
}
