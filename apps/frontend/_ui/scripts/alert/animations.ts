const ANIMATION_DURATION = 400;
const ANIMATION_EASING = "ease-in-out";

const BASE_ANIMATION_KEYFRAMES: Keyframe[] = [
  { transform: "translateX(100%)", opacity: 0 },
  { transform: "translateX(0)", opacity: 1 },
];

const BASE_ANIMATION_OPTIONS: KeyframeAnimationOptions = {
  duration: ANIMATION_DURATION,
  easing: ANIMATION_EASING,
  fill: "both",
};

export function animateIn(element: HTMLDivElement): void {
  element.animate(BASE_ANIMATION_KEYFRAMES, BASE_ANIMATION_OPTIONS);
}

export function animateOut(element: HTMLDivElement, onComplete: () => void): void {
  const keyframes = [...BASE_ANIMATION_KEYFRAMES].reverse();
  const animation = element.animate(keyframes, BASE_ANIMATION_OPTIONS);

  animation.onfinish = onComplete;
  animation.oncancel = onComplete;
}
