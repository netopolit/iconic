/**
 * Icon pack registry and SVG processing utilities.
 */

/**
 * Metadata for an available icon pack.
 */
export interface IconPackMeta {
	id: string;
	name: string;
	prefix: string;
	version: string;
	downloadUrl: string;
	path: string;
	count: number;
}

/**
 * Metadata for an installed icon pack, stored as meta.json.
 */
export interface InstalledIconPack extends IconPackMeta {
	installedAt: number;
	iconNames: string[];
}

/**
 * Static registry of available icon packs.
 */
export const ICON_PACK_REGISTRY: IconPackMeta[] = [
	{
		id: 'font-awesome-solid',
		name: 'Font Awesome Solid',
		prefix: 'fas-',
		version: '6.7.2',
		downloadUrl: 'https://github.com/FortAwesome/Font-Awesome/archive/refs/tags/6.7.2.zip',
		path: 'Font-Awesome-6.7.2/svgs/solid',
		count: 1400,
	},
	{
		id: 'font-awesome-regular',
		name: 'Font Awesome Regular',
		prefix: 'far-',
		version: '6.7.2',
		downloadUrl: 'https://github.com/FortAwesome/Font-Awesome/archive/refs/tags/6.7.2.zip',
		path: 'Font-Awesome-6.7.2/svgs/regular',
		count: 163,
	},
	{
		id: 'font-awesome-brands',
		name: 'Font Awesome Brands',
		prefix: 'fab-',
		version: '6.7.2',
		downloadUrl: 'https://github.com/FortAwesome/Font-Awesome/archive/refs/tags/6.7.2.zip',
		path: 'Font-Awesome-6.7.2/svgs/brands',
		count: 500,
	},
	{
		id: 'simple-icons',
		name: 'Simple Icons',
		prefix: 'si-',
		version: '14.8.0',
		downloadUrl: 'https://github.com/simple-icons/simple-icons/archive/refs/tags/14.8.0.zip',
		path: 'simple-icons-14.8.0/icons',
		count: 3200,
	},
	{
		id: 'remix-icons',
		name: 'Remix Icons',
		prefix: 'ri-',
		version: '4.6.0',
		downloadUrl: 'https://github.com/Remix-Design/RemixIcon/archive/refs/tags/v4.6.0.zip',
		path: 'RemixIcon-4.6.0/icons',
		count: 2800,
	},
	{
		id: 'boxicons',
		name: 'Boxicons',
		prefix: 'bx-',
		version: '2.1.4',
		downloadUrl: 'https://github.com/atisawd/boxicons/archive/refs/tags/v2.1.4.zip',
		path: 'boxicons-2.1.4/svg',
		count: 1600,
	},
];

/**
 * Process an SVG string for use with Obsidian's addIcon() API.
 * Extracts inner content, normalizes viewBox to 100x100, and ensures currentColor usage.
 */
export function processPackSvg(svgString: string): string | null {
	// Extract viewBox dimensions
	const viewBoxMatch = svgString.match(/viewBox=["']([^"']+)["']/);
	if (!viewBoxMatch) return null;

	const [, , vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
	if (!vbWidth || !vbHeight) return null;

	// Extract inner SVG content (everything between <svg> tags)
	const innerMatch = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
	if (!innerMatch) return null;

	let innerSvg = innerMatch[1].trim();
	if (!innerSvg) return null;

	// Replace hard-coded fills/strokes with currentColor for theme compatibility
	innerSvg = innerSvg.replace(/fill="(?!none|currentColor)[^"]*"/g, 'fill="currentColor"');
	innerSvg = innerSvg.replace(/stroke="(?!none|currentColor)[^"]*"/g, 'stroke="currentColor"');

	// Scale content to fit 100x100 viewBox
	if (vbWidth !== 100 || vbHeight !== 100) {
		const scaleX = 100 / vbWidth;
		const scaleY = 100 / vbHeight;
		innerSvg = `<g transform="scale(${scaleX}, ${scaleY})">${innerSvg}</g>`;
	}

	return innerSvg;
}
