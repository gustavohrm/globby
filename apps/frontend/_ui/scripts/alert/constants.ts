import type { AlertType } from "./index";

export const MAX_ALERTS = 5;
export const DEFAULT_DURATION = 4000;
export const DEFAULT_TYPE: AlertType = "success";

export const ALERT_COLORS: Record<AlertType, string> = {
  success: "bg-success-light text-success-dark border border-success",
  error: "bg-error-light text-error-dark border border-error",
  warning: "bg-warning-light text-warning-dark border border-warning",
  info: "bg-info-light text-info-dark border border-info",
};

export const ALERT_ICON_SVGS: Record<AlertType, string> = {
  success:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>',
  error:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

export const CLOSE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export const ALERT_BASE_CLASSES =
  "px-3 py-2 rounded-lg font-medium font-default pointer-events-auto min-w-40 flex items-center gap-2";

export const CONTAINER_ID = "global-alert-container";
export const CONTAINER_CLASSES =
  "fixed top-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none";
