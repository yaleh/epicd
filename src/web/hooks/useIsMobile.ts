import { useEffect, useState } from "react";

// Matches the Tailwind `md:` breakpoint (768px) already used across the web UI
// (Statistics.tsx, TaskDetailsModal.tsx) so mobile/desktop branches switch at
// the same boundary as those existing responsive grids.
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * Tracks whether the viewport is currently below the `md:` breakpoint.
 *
 * Used to drive a JS-level conditional render fork (mobile branch vs desktop
 * branch) rather than CSS-only hide/show, so the desktop DOM/JSX path stays
 * byte-for-byte unchanged (BACK-693 AC#4).
 */
export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState<boolean>(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return false;
		}
		return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
	});

	useEffect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return;
		}
		const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
		const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

		setIsMobile(mediaQueryList.matches);
		mediaQueryList.addEventListener("change", handleChange);
		return () => mediaQueryList.removeEventListener("change", handleChange);
	}, []);

	return isMobile;
}
