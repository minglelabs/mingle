// A real Next.js route change (e.g. add-members -> conversations) unmounts
// and remounts the destination page's whole component tree in one React
// commit — but the browser doesn't guarantee that commit is painted until
// its next frame. Whatever was already correctly resolved (the room open,
// not the list) still has to cross that one-frame boundary, and on-device
// that boundary was visible. `RouteTransitionCurtain` (rendered once in the
// root layout, so it survives the navigation) covers the screen the instant
// a caller shows it and lifts only after the destination has actually
// painted, so nothing in between is ever exposed.
export const ROUTE_TRANSITION_CURTAIN_EVENT = "mingle:route-transition-curtain";

export function showRouteTransitionCurtain(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ROUTE_TRANSITION_CURTAIN_EVENT));
}
