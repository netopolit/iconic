import { App, MenuItem, setIcon } from 'obsidian';
import IconicPlugin, { Item, Icon, ICONS, EMOJIS, STRINGS } from 'src/IconicPlugin';
import ColorUtils from 'src/ColorUtils';

/**
 * Base class for all icon managers.
 */
export default abstract class IconManager {
	protected readonly app: App;
	protected readonly plugin: IconicPlugin;
	private readonly eventListeners = new Map<string, Map<HTMLElement, {
		listener: EventListener, options?: boolean | AddEventListenerOptions
	}>>();
	private readonly mutationObservers = new Map<HTMLElement, MutationObserver>();

	constructor(plugin: IconicPlugin) {
		this.app = plugin.app;
		this.plugin = plugin;
	}

	/**
	 * Refresh all icons controlled by this icon manager. Should be overridden.
	 */
	refreshIcons(unloading?: boolean): void {
		return;
	}

	/**
	 * Refresh icon inside a given element.
	 */
	protected refreshIcon(item: Item | Icon, iconEl: HTMLElement, onClick?: (event: MouseEvent) => void): void {
		// Determine the effective icon ID to render
		let effectiveIcon: string | null = null;
		if (item.icon) {
			effectiveIcon = item.icon;
		} else if (iconEl.hasClass('collapse-icon')) {
			if (this.plugin.settings.showAllFolderIcons && 'iconDefault' in item && item.iconDefault) {
				effectiveIcon = item.iconDefault;
			} else {
				effectiveIcon = 'right-triangle';
			}
		} else if ('iconDefault' in item && item.iconDefault) {
			effectiveIcon = item.iconDefault;
		}

		const effectiveColor = item.color ?? '';
		const prevIcon = iconEl.dataset.iconicId ?? '';
		const prevColor = iconEl.dataset.iconicColor ?? '';

		// Skip DOM work when nothing changed
		if (effectiveIcon === prevIcon && effectiveColor === prevColor) {
			if (onClick) {
				this.setEventListener(iconEl, 'click', onClick, { capture: true });
			} else {
				this.stopEventListener(iconEl, 'click');
			}
			return;
		}

		iconEl.addClass('iconic-icon');

		if (item.icon) {
			if (ICONS.has(item.icon)) {
				setIcon(iconEl, item.icon);
			} else if (EMOJIS.has(item.icon)) {
				iconEl.empty();
				const emojiEl = iconEl.createDiv({ cls: 'iconic-emoji', text: item.icon });
				if (item.color) IconManager.colorFilter(emojiEl, item.color);
			}
			iconEl.show();
		} else if (iconEl.hasClass('collapse-icon')) {
			if (this.plugin.settings.showAllFolderIcons && 'iconDefault' in item && item.iconDefault) {
				setIcon(iconEl, item.iconDefault);
			} else {
				setIcon(iconEl, 'right-triangle');
				iconEl.removeClass('iconic-icon');
			}
			iconEl.show();
		} else if ('iconDefault' in item && item.iconDefault) {
			setIcon(iconEl, item.iconDefault);
			iconEl.show();
		} else {
			iconEl.removeClass('iconic-icon');
			iconEl.hide();
		}

		const svgEl = iconEl.find('.svg-icon');
		if (svgEl) {
			if (item.color) {
				svgEl.style.setProperty('color', ColorUtils.toRgb(item.color));
			} else {
				svgEl.style.removeProperty('color');
			}
		}

		// Track rendered state for future early-exit
		if (effectiveIcon) {
			iconEl.dataset.iconicId = effectiveIcon;
		} else {
			delete iconEl.dataset.iconicId;
		}
		if (effectiveColor) {
			iconEl.dataset.iconicColor = effectiveColor;
		} else {
			delete iconEl.dataset.iconicColor;
		}

		if (onClick) {
			this.setEventListener(iconEl, 'click', onClick, { capture: true });
		} else {
			this.stopEventListener(iconEl, 'click');
		}
	}

	/**
	 * Set an inline color filter on an element.
	 */
	private static colorFilter(element: HTMLElement, color: string): void {
		const [h, s] = ColorUtils.toHslArray(color);
		element.style.filter = `grayscale() sepia() hue-rotate(${h - 50}deg) saturate(${s * 5}%)`;
	}

	/**
	 * Set an event listener which will be removed when plugin unloads.
	 * Replaces any listener (of the same element & type) set by this {@link IconManager}.
	 */
	protected setEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void {
		let map = this.eventListeners.get(type);
		if (!map) {
			map = new Map();
			this.eventListeners.set(type, map);
		}
		const existing = map.get(element);
		if (existing) {
			element.removeEventListener(type, existing.listener, existing.options);
		}
		this.plugin.registerDomEvent(element, type, listener, options);
		map.set(element, { listener, options });
	}

	/**
	 * Stop an event listener (of the given element & type) set by this {@link IconManager}.
	 */
	protected stopEventListener(element: HTMLElement | null, type: keyof HTMLElementEventMap): void {
		if (!element) return;
		const listenerMap = this.eventListeners.get(type);
		if (listenerMap?.has(element)) {
			const { listener, options } = listenerMap.get(element)!;
			element.removeEventListener(type, listener, options);
			listenerMap.delete(element);
		}
	}

	/**
	 * Stop all event listeners set by this {@link IconManager}.
	 */
	protected stopEventListeners(): void {
		for (const [type, listenerMap] of this.eventListeners) {
			for (const [element, { listener, options }] of listenerMap) {
				element.removeEventListener(type, listener, options);
				listenerMap.delete(element);
			}
		}
	}

	/**
	 * Set a mutation observer which will be removed when plugin unloads.
	 * Replaces any observer (of the same element) set by this {@link IconManager}.
	 * 
	 * Callback runs once per mutation.
	 */
	protected setMutationObserver(element: HTMLElement | null, options: MutationObserverInit, callback: (mutation: MutationRecord) => void): void {
		this.setMutationsObserver(element, options, mutations => {
			for (const mutation of mutations) callback(mutation);
		});
	}

	/**
	 * Set a mutation observer which will be removed when plugin unloads.
	 * Replaces any observer (of the same element) set by this {@link IconManager}.
	 * 
	 * Callback runs once per batch of mutations.
	 */
	protected setMutationsObserver(element: HTMLElement | null, options: MutationObserverInit, callback: MutationCallback): void {
		if (!element) return;
		const observer = new MutationObserver(callback);
		if (this.mutationObservers.has(element)) {
			this.mutationObservers.get(element)?.disconnect();
		}
		observer.observe(element, options);
		this.mutationObservers.set(element, observer);
	}

	/**
	 * Stop a mutation observer (of the given element) set by this {@link IconManager}.
	 */
	protected stopMutationObserver(element: HTMLElement | null): void {
		if (!element) return;
		this.mutationObservers.get(element)?.disconnect();
		this.mutationObservers.delete(element);
	}

	/**
	 * Stop all mutation observers set by this {@link IconManager}.
	 */
	protected stopMutationObservers(): void {
		for (const [element, observer] of this.mutationObservers) {
			observer.disconnect();
			this.mutationObservers.delete(element);
		}
	}

	/**
	 * Returns a menu item callback for "Change icon" / "Change icons".
	 */
	protected changeIconItem(items: Item[], onClick: () => void): (menuItem: MenuItem) => void {
		const title = items.length <= 1
			? STRINGS.menu.changeIcon
			: STRINGS.menu.changeIcons.replace('{#}', items.length.toString());
		return menuItem => menuItem
			.setTitle(title).setIcon('lucide-image-plus').setSection('icon').onClick(onClick);
	}

	/**
	 * Returns a menu item callback for "Remove icon" / "Reset color".
	 */
	protected removeIconItem(items: Item[], onClick: () => void): (menuItem: MenuItem) => void {
		const anyIcons = items.some(i => i.icon);
		const title = items.length <= 1
			? (anyIcons ? STRINGS.menu.removeIcon : STRINGS.menu.resetColor)
			: (anyIcons
				? STRINGS.menu.removeIcons.replace('{#}', items.length.toString())
				: STRINGS.menu.resetColors.replace('{#}', items.length.toString()));
		return menuItem => menuItem
			.setTitle(title)
			.setIcon(anyIcons ? 'lucide-image-minus' : 'lucide-rotate-ccw')
			.setSection('icon').onClick(onClick);
	}

	/**
	 * Returns a menu item callback for "Edit rule...".
	 */
	protected editRuleItem(onClick: () => void): (menuItem: MenuItem) => void {
		return menuItem => { menuItem
			.setTitle(STRINGS.menu.editRule).setIcon('lucide-image-play').setSection('icon').onClick(onClick);
		};
	}

	/**
	 * Set or remove a contextmenu listener based on the showMenuActions setting.
	 */
	protected setContextMenu(
		el: HTMLElement, callback: (event: MouseEvent) => void, options?: AddEventListenerOptions
	): void {
		if (this.plugin.settings.showMenuActions) {
			this.setEventListener(el, 'contextmenu', callback, options);
		} else {
			this.stopEventListener(el, 'contextmenu');
		}
	}

	/**
	 * Manage the sidekick icon for folders. Returns the effective iconEl to use for subsequent refreshIcon calls.
	 */
	protected refreshFolderSidekick(
		item: Item, rule: Item | Icon, selfEl: HTMLElement, iconEl: HTMLElement
	): HTMLElement {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((item as any).items && item.iconDefault) {
			item.iconDefault = iconEl.hasClass('is-collapsed')
				? 'lucide-folder-closed' : 'lucide-folder-open';
		}
		let folderIconEl = selfEl.find(':scope > .iconic-sidekick:not(.tree-item-icon)');
		if (this.plugin.settings.minimalFolderIcons
			|| !this.plugin.settings.showAllFolderIcons
				&& !rule.icon && !('iconDefault' in rule && rule.iconDefault)) {
			folderIconEl?.remove();
		} else {
			const arrowColor = rule.icon || ('iconDefault' in rule && rule.iconDefault) ? null : rule.color;
			this.refreshIcon({ icon: null, color: arrowColor }, iconEl);
			folderIconEl = folderIconEl ?? selfEl.createDiv({ cls: 'iconic-sidekick' });
			if (iconEl.nextElementSibling !== folderIconEl) {
				iconEl.insertAdjacentElement('afterend', folderIconEl);
			}
			return folderIconEl;
		}
		return iconEl;
	}

	/**
	 * Revert all DOM changes when plugin unloads.
	 */
	unload(): void {
		this.stopEventListeners();
		this.stopMutationObservers();
	}
}

/**
 * Exposes protected {@link IconManager} methods as public for use by dialogs.
 */
export class DialogIconManager extends IconManager {
	constructor(plugin: IconicPlugin) {
		super(plugin);
	}

	/**
	 * @override
	 */
	refreshIcon(item: Item | Icon, iconEl: HTMLElement, onClick?: ((event: MouseEvent) => void)): void {
		super.refreshIcon(item, iconEl, onClick);
	}

	/**
	 * @override
	 */
	setEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, listener: (this: HTMLElement, event: HTMLElementEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void {
		super.setEventListener(element, type, listener, options);
	}

	/**
	 * @override
	 */
	stopEventListeners(): void {
		super.stopEventListeners();
	}

	/**
	 * @override
	 */
	setMutationObserver(element: HTMLElement | null, options: MutationObserverInit, callback: (mutation: MutationRecord) => void): void {
		super.setMutationObserver(element, options, callback);
	}

	/**
	 * @override
	 */
	stopMutationObservers(): void {
		super.stopMutationObservers();
	}
}
