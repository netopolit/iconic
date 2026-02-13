import { ButtonComponent, ColorComponent, ExtraButtonComponent, Menu, Modal, Platform, Setting, TextComponent, displayTooltip, prepareFuzzySearch, setTooltip } from 'obsidian';
import IconicPlugin, { Category, Item, ICONS, EMOJIS, STRINGS } from 'src/IconicPlugin';
import ColorUtils, { COLORS } from 'src/ColorUtils';
import { RuleItem } from 'src/managers/RuleManager';
import { DialogIconManager } from 'src/managers/IconManager';
import RuleEditor from 'src/dialogs/RuleEditor';

const COLOR_KEYS = [...COLORS.keys()];
const COLOR_KEY_SET = new Set(COLOR_KEYS);

/**
 * Callback for setting icon & color of a single item.
 */
export interface IconPickerCallback {
	(icon: string | null, color: string | null): void;
}

/**
 * Callback for setting icons & colors of multiple items at once.
 */
export interface MultiIconPickerCallback {
	(icon: string | null | undefined, color: string | null | undefined): void;
}

/**
 * Dialog for changing icons & colors of single/multiple items.
 */
export default class IconPicker extends Modal {
	private readonly plugin: IconicPlugin;
	private readonly iconManager: DialogIconManager;

	// Item
	private readonly items: Item[];
	private readonly icon: string | null | undefined;
	private color: string | null | undefined;
	private readonly callback: IconPickerCallback | null;
	private readonly multiCallback: MultiIconPickerCallback | null;

	// Components
	private overruleEl: HTMLElement;
	private searchSetting: Setting;
	private searchResultsSetting: Setting;
	private colorResetButton: ExtraButtonComponent;
	private colorPicker: ColorComponent;
	private searchField: TextComponent;
	private iconModeButton: ExtraButtonComponent;
	private emojiModeButton: ExtraButtonComponent;
	private mobileModeButton: ButtonComponent;
	private packFilterEl: HTMLSelectElement | null = null;
	private colorPickerEl: HTMLElement;

	// State
	private colorPickerPaused = false;
	private colorPickerHovered = false;
	private browseRenderTimer: number | null = null;
	private readonly searchResults: [icon: string, iconName: string][] = [];
	private cachedPackFilter: string | null | undefined;
	private cachedFilteredIcons: [string, string][] = [];
	private cachedItemsPerRow: number | null = null;

	private constructor(
		plugin: IconicPlugin,
		items: Item[],
		callback: IconPickerCallback | null,
		multiCallback: MultiIconPickerCallback | null,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.iconManager = new DialogIconManager(plugin);
		this.items = items;
		this.icon = this.items.every(item => item.icon === this.items[0].icon) ? this.items[0].icon : undefined;
		this.color = this.items.every(item => item.color === this.items[0].color) ? this.items[0].color : undefined;
		this.callback = callback;
		this.multiCallback = multiCallback;

		// Allow hotkeys in dialog
		this.plugin.registerDialogHotkeys(this.scope);

		// Navigation hotkeys
		this.scope.register(null, 'ArrowUp', event => this.nudgeFocus(event));
		this.scope.register(null, 'ArrowDown', event => this.nudgeFocus(event));
		this.scope.register(null, 'ArrowLeft', event => this.nudgeFocus(event));
		this.scope.register(null, 'ArrowRight', event => this.nudgeFocus(event));
		this.scope.register(null, 'Enter', event => this.confirmFocus(event));
		this.scope.register(null, ' ', event => this.confirmFocus(event));
		this.scope.register(null, 'Delete', event => this.deleteFocus(event));
		this.scope.register(null, 'Backspace', event => this.deleteFocus(event));
	}

	/**
	 * Nudge the focused element.
	 */
	private nudgeFocus(event: KeyboardEvent): void {
		if (!(event.target instanceof HTMLElement)) return;
		let focusEl: Element | null = null;
		const inResults = this.searchResultsSetting.settingEl.contains(event.target);
		const isBrowseMode = this.searchResultsSetting.settingEl.hasClass('iconic-browse-mode');

		switch (event.key) {
			case 'ArrowUp': {
				if (isBrowseMode && inResults && event.target !== this.searchResultsSetting.settingEl) {
					const index = this.searchResultsSetting.controlEl.indexOf(event.target);
					const itemsPerRow = this.getItemsPerRow();
					if (index >= itemsPerRow) {
						focusEl = this.searchResultsSetting.controlEl.children[index - itemsPerRow];
					}
				} else {
					this.previousColor();
					return;
				}
				break;
			}
			case 'ArrowDown': {
				if (isBrowseMode && inResults && event.target !== this.searchResultsSetting.settingEl) {
					const index = this.searchResultsSetting.controlEl.indexOf(event.target);
					const itemsPerRow = this.getItemsPerRow();
					const targetIndex = index + itemsPerRow;
					if (targetIndex < this.searchResultsSetting.controlEl.childElementCount) {
						focusEl = this.searchResultsSetting.controlEl.children[targetIndex];
					}
				} else {
					this.nextColor();
					return;
				}
				break;
			}
			case 'ArrowLeft': {
				// Search results
				if (inResults) {
					if (event.target !== this.searchResultsSetting.settingEl && event.target.previousElementSibling) {
						focusEl = event.target.previousElementSibling;
					} else if (!event.repeat) {
						focusEl = this.searchResultsSetting.controlEl.lastElementChild;
					}
				}
				break;
			}
			case 'ArrowRight': {
				// Search results
				if (inResults) {
					if (event.target !== this.searchResultsSetting.settingEl && event.target.nextElementSibling) {
						focusEl = event.target.nextElementSibling;
					} else if (!event.repeat) {
						focusEl = this.searchResultsSetting.controlEl.firstElementChild;
					}
				}
			}
		}

		if (focusEl instanceof HTMLElement) {
			event.preventDefault();
			focusEl.focus();
			if (isBrowseMode) focusEl.scrollIntoView({ block: 'nearest' });
		}
	}

	/**
	 * Calculate how many items fit in one row of the browse grid.
	 * Result is cached and invalidated when search results change.
	 */
	private getItemsPerRow(): number {
		if (this.cachedItemsPerRow !== null) return this.cachedItemsPerRow;
		const children = this.searchResultsSetting.controlEl.children;
		if (children.length < 2) return 1;
		const firstTop = (children[0] as HTMLElement).offsetTop;
		for (let i = 1; i < children.length; i++) {
			if ((children[i] as HTMLElement).offsetTop !== firstTop) {
				this.cachedItemsPerRow = i;
				return i;
			}
		}
		this.cachedItemsPerRow = children.length;
		return children.length;
	}

	/**
	 * Confirm the focused element.
	 */
	private confirmFocus(event: KeyboardEvent): void {
		if (!(event.target instanceof HTMLElement)) return;

		// Extra setting buttons
		if (event.target.hasClass('extra-setting-button')) {
			event.preventDefault();
			event.target.click();
		}
		// Color picker
		else if (event.target === this.colorPickerEl) {
			event.preventDefault();
			const rect = this.colorPickerEl.getBoundingClientRect();
			const x = rect.x + rect.width / 4;
			const y = rect.y + rect.height / 4;
			this.openColorMenu(x, y);
		}
		// Search field
		else if (event.target === this.searchField.inputEl) {
			if (event.key === 'Enter' && this.searchResults.length > 0) {
				event.preventDefault();
				this.closeAndSave(this.searchResults[0][0], this.color);
			}
		}
	}

	/**
	 * Delete the focused element.
	 */
	private deleteFocus(event: KeyboardEvent): void {
		if (!(event.target instanceof HTMLElement)) return;

		// Anywhere except the search field
		if (event.target !== this.searchField.inputEl ) {
			if (event.target === this.colorResetButton.extraSettingsEl) this.colorPickerEl.focus();
			this.resetColor();
		}
	}

	/**
	 * Open a dialog to change a single icon.
	 */
	static openSingle(plugin: IconicPlugin, item: Item, callback: IconPickerCallback): void {
		new IconPicker(plugin, [item], callback, null).open();
	}

	/**
	 * Open a dialog to change multiple icons at once.
	 */
	static openMulti(plugin: IconicPlugin, items: Item[], multiCallback: MultiIconPickerCallback): void {
		new IconPicker(plugin, items, null, multiCallback).open();
	}

	/**
	 * @override
	 */
	onOpen(): void {
		const { dialogState } = this.plugin.settings;
		this.containerEl.addClass('mod-confirmation');
		this.modalEl.addClass('iconic-icon-picker');
		this.setTitle(this.items.length === 1
			? STRINGS.iconPicker.changeIcon
			: STRINGS.iconPicker.changeIcons.replace('{#}', this.items.length.toString())
		);
		this.updateOverruleReminder();

		// Item name
		const showItemName = this.plugin.settings.showItemName === 'on'
			|| Platform.isDesktop && this.plugin.settings.showItemName === 'desktop'
			|| Platform.isMobile && this.plugin.settings.showItemName === 'mobile';
		if (showItemName) {
			const setting = new Setting(this.contentEl)
				.addText(itemNameField => itemNameField.setValue(this.items.map(item => item.name).join(', ')))
				.setDisabled(true);
			const category = this.items.every(item => item.category === this.items[0].category)
				? this.items[0].category
				: null;
			if (this.items.length === 1) switch (category) {
				default: setting.setName(STRINGS.categories.item); break;
				case 'app': setting.setName(STRINGS.categories.appItem); break;
				case 'tab': setting.setName(STRINGS.categories.tab); break;
				case 'file': setting.setName(STRINGS.categories.file); break;
				case 'folder': setting.setName(STRINGS.categories.folder); break;
				case 'group': setting.setName(STRINGS.categories.group); break;
				case 'search': setting.setName(STRINGS.categories.search); break;
				case 'graph': setting.setName(STRINGS.categories.graph); break;
				case 'url': setting.setName(STRINGS.categories.url); break;
				case 'tag': setting.setName(STRINGS.categories.tag); break;
				case 'property': setting.setName(STRINGS.categories.property); break;
				case 'ribbon': setting.setName(STRINGS.categories.ribbonItem); break;
				case 'rule': setting.setName(STRINGS.categories.rule); break;
			} else switch (category) {
				default: setting.setName(STRINGS.categories.items); break;
				case 'app': setting.setName(STRINGS.categories.appItems); break;
				case 'tab': setting.setName(STRINGS.categories.tabs); break;
				case 'file': setting.setName(STRINGS.categories.files); break;
				case 'folder': setting.setName(STRINGS.categories.folders); break;
				case 'group': setting.setName(STRINGS.categories.groups); break;
				case 'search': setting.setName(STRINGS.categories.searches); break;
				case 'graph': setting.setName(STRINGS.categories.graphs); break;
				case 'url': setting.setName(STRINGS.categories.urls); break;
				case 'tag': setting.setName(STRINGS.categories.tags); break;
				case 'property': setting.setName(STRINGS.categories.properties); break;
				case 'ribbon': setting.setName(STRINGS.categories.ribbonItems); break;
				case 'rule': setting.setName(STRINGS.categories.rules); break;
			}
		}

		// Search
		this.searchSetting = new Setting(this.contentEl)
			.addExtraButton(colorResetButton => { colorResetButton
				.setIcon('lucide-rotate-ccw')
				.setTooltip(STRINGS.iconPicker.resetColor, { delay: 300 })
				.onClick(() => this.resetColor());
				colorResetButton.extraSettingsEl.addClass('iconic-reset-color');
				colorResetButton.extraSettingsEl.toggleClass('iconic-invisible', this.color === null);
				colorResetButton.extraSettingsEl.tabIndex = this.color === null ? -1 : 0;
				this.iconManager.setEventListener(colorResetButton.extraSettingsEl, 'pointerdown', event => {
					event.preventDefault();
				});
				this.colorResetButton = colorResetButton;
			})
			.addColorPicker(colorPicker => { colorPicker
				.setValueRgb(ColorUtils.toRgbObject(this.color))
				.onChange(value => {
					if (this.colorPickerPaused) return;
					this.color = value;
					this.colorResetButton.extraSettingsEl.removeClass('iconic-invisible');
					this.colorResetButton.extraSettingsEl.tabIndex = 0;
					this.updateColorTooltip();
					this.updateSearchResultColors();
				});
				this.colorPicker = colorPicker;
			})
			.addSearch(searchField => { searchField
				.setPlaceholder(STRINGS.iconPicker.searchIcons)
				.onChange(() => this.updateSearchResults());
				searchField.inputEl.enterKeyHint = 'go';
				this.searchField = searchField;
			});
		if (!Platform.isPhone) this.searchSetting.setName(STRINGS.iconPicker.search);

		// Pack filter dropdown (only if icon packs are installed)
		const installedPacks = this.plugin.iconPackManager.getInstalledPacks();
		if (installedPacks.length > 0) {
			this.searchSetting.addDropdown(dropdown => {
				dropdown
					.addOption('', STRINGS.iconPacks.packFilter)
					.addOption('lucide', STRINGS.iconPacks.packFilterLucide);
				for (const pack of installedPacks) {
					dropdown.addOption(pack.id, pack.name);
				}
				dropdown.setValue(dialogState.packFilter ?? '');
				dropdown.onChange(value => {
					dialogState.packFilter = value || null;
					this.updateSearchResults();
				});
				this.packFilterEl = dropdown.selectEl;
			});
		}

		// Color picker
		let openRgbPicker = false;
		this.colorPickerEl = this.searchSetting.controlEl.find('input[type="color"]');
		// Reset tooltip delay when cursor starts hovering
		this.iconManager.setEventListener(this.colorPickerEl, 'pointerenter', () => {
			this.updateColorTooltip();
			this.colorPickerHovered = true;
		});
		this.iconManager.setEventListener(this.colorPickerEl, 'pointerleave', () => {
			this.colorPickerHovered = false;
			this.updateColorTooltip();
		});
		// Primary color picker
		this.iconManager.setEventListener(this.colorPickerEl, 'click', event => {
			if (openRgbPicker === true) {
				openRgbPicker = false;
			} else if (this.plugin.settings.colorPicker1 === 'list') {
				this.openColorMenu(event.x, event.y);
				event.preventDefault();
			}
		});
		// Secondary color picker
		this.iconManager.setEventListener(this.colorPickerEl, 'contextmenu', event => {
			navigator.vibrate?.(100); // Not supported on iOS
			if (this.plugin.settings.colorPicker2 === 'rgb') {
				openRgbPicker = true;
				this.colorPickerEl.click();
			} else if (this.plugin.settings.colorPicker2 === 'list') {
				this.openColorMenu(event.x, event.y);
				event.preventDefault();
			}
		});
		this.iconManager.setEventListener(this.colorPickerEl, 'wheel', event => {
			event.deltaY + event.deltaX < 0 ? this.previousColor() : this.nextColor();
		}, { passive: true });
		this.updateColorPicker();

		// Search results
		this.searchResultsSetting = new Setting(this.contentEl);
		this.searchResultsSetting.settingEl.addClass('iconic-search-results');
		this.searchResultsSetting.settingEl.tabIndex = 0;
		// Allow vertical scrolling to work horizontally (skip in browse mode for native vertical scroll)
		this.iconManager.setEventListener(this.searchResultsSetting.settingEl, 'wheel', event => {
			if (this.searchResultsSetting.settingEl.hasClass('iconic-browse-mode')) return;
			if (this.modalEl.doc.body.hasClass('mod-rtl')) {
				this.searchResultsSetting.settingEl.scrollLeft -= event.deltaY;
			} else {
				this.searchResultsSetting.settingEl.scrollLeft += event.deltaY;
			}
		}, { passive: true });

		// Event delegation for browse mode icons (click, tooltip, contextmenu)
		this.iconManager.setEventListener(this.searchResultsSetting.controlEl, 'click', event => {
			const target = (event.target as HTMLElement).closest('.iconic-search-result') as HTMLElement | null;
			if (target?.dataset.icon) {
				this.closeAndSave(target.dataset.icon, this.color);
			}
		}, { capture: true });
		this.iconManager.setEventListener(this.searchResultsSetting.controlEl, 'mouseover', event => {
			if (!this.searchResultsSetting.settingEl.hasClass('iconic-browse-mode')) return;
			const target = (event.target as HTMLElement).closest('.iconic-search-result') as HTMLElement | null;
			if (target?.ariaLabel) {
				displayTooltip(target, target.ariaLabel, {
					delay: 300,
					placement: Platform.isPhone ? 'top' : 'bottom',
				});
			}
		});
		if (Platform.isPhone) {
			this.iconManager.setEventListener(this.searchResultsSetting.controlEl, 'contextmenu', event => {
				if (!this.searchResultsSetting.settingEl.hasClass('iconic-browse-mode')) return;
				const target = (event.target as HTMLElement).closest('.iconic-search-result') as HTMLElement | null;
				if (target?.ariaLabel) {
					navigator.vibrate?.(100);
					displayTooltip(target, target.ariaLabel, { placement: 'top' });
				}
			});
		}

		// Match styling of bookmark edit dialog
		const buttonContainerEl = this.modalEl.createDiv({ cls: 'modal-button-container' });
		const buttonRowEl = Platform.isMobile ? buttonContainerEl.createDiv({ cls: 'iconic-button-row' }) : null;

		// [Remove]
		if (this.icon !== null || this.color !== null) {
			new ButtonComponent(buttonRowEl ?? buttonContainerEl)
				.setButtonText(this.items.length === 1
					? STRINGS.menu.removeIcon
					: STRINGS.menu.removeIcons.replace('{#}', this.items.length.toString())
				)
				.onClick(() => this.closeAndSave(null, null))
				.buttonEl.addClasses(Platform.isPhone
					? ['mod-warning']
					: ['mod-secondary', 'mod-destructive']
				);
		}

		// Auto-select the most useful mode
		if (this.icon) {
			if (ICONS.has(this.icon)) {
				dialogState.iconMode = true;
				this.searchField.setValue(ICONS.get(this.icon) ?? '');
			} else if (EMOJIS.has(this.icon)) {
				dialogState.emojiMode = true;
				this.searchField.setValue(EMOJIS.get(this.icon) ?? '');
			} else {
				this.searchField.setValue(this.icon);
			}
		} else if (!dialogState.iconMode && !dialogState.emojiMode) {
			dialogState.iconMode = true;
		}

		// BUTTONS: Toggle icons & emojis
		if (Platform.isMobile && buttonRowEl) {
			this.mobileModeButton = new ButtonComponent(buttonRowEl)
				.onClick(() => this.toggleMobileSearchMode());
			this.iconManager.setEventListener(this.mobileModeButton.buttonEl, 'pointerdown', event => {
				event.preventDefault(); // Prevent focus theft
			});
			this.updateMobileSearchMode();
		} else {
			this.iconModeButton = new ExtraButtonComponent(buttonContainerEl)
				.setTooltip(STRINGS.iconPicker.toggleIcons, { placement: 'top', delay: 300 })
				.onClick(() => {
					dialogState.iconMode = !dialogState.iconMode;
					this.updateDesktopSearchMode();
				});
			this.iconModeButton.extraSettingsEl.tabIndex = 0;
			this.emojiModeButton = new ExtraButtonComponent(buttonContainerEl)
				.setTooltip(STRINGS.iconPicker.toggleEmojis, { placement: 'top', delay: 300 })
				.onClick(() => {
					dialogState.emojiMode = !dialogState.emojiMode;
					this.updateDesktopSearchMode();
				});
			this.emojiModeButton.extraSettingsEl.tabIndex = 0;
			this.iconManager.setEventListener(this.iconModeButton.extraSettingsEl, 'pointerdown', event => {
				event.preventDefault(); // Prevent focus theft
			});
			this.iconManager.setEventListener(this.emojiModeButton.extraSettingsEl, 'pointerdown', event => {
				event.preventDefault(); // Prevent focus theft
			});
			this.updateDesktopSearchMode();
		}

		// [Cancel]
		new ButtonComponent(Platform.isPhone ? this.modalEl : buttonContainerEl)
			.setButtonText(STRINGS.iconPicker.cancel)
			.onClick(() => this.close())
			.buttonEl.addClasses(Platform.isPhone
				? ['modal-nav-action', 'mod-secondary']
				: ['mod-cancel']
			);

		// [Save]
		new ButtonComponent(Platform.isPhone ? this.modalEl : buttonContainerEl)
			.setButtonText(STRINGS.iconPicker.save)
			.onClick(() => this.closeAndSave(this.icon, this.color))
			.buttonEl.addClasses(Platform.isPhone
				? ['modal-nav-action', 'mod-cta']
				: ['mod-cta']
			);

		// Hack to guarantee initial focus
		activeWindow.requestAnimationFrame(() => this.searchField.inputEl.select());

		this.updateSearchResults();
	}

	/**
	 * Open color menu at the given coordinates.
	 */
	private openColorMenu(x: number, y: number): void {
		const menu = new Menu();
		for (const color of COLOR_KEYS) {
			menu.addItem(menuItem => { menuItem
				.setTitle(STRINGS.iconPicker.colors[color as keyof typeof STRINGS.iconPicker.colors])
				.setChecked(color === this.color)
				.setSection('color')
				.onClick(() => {
					if (this.color === color) {
						this.color = null;
						this.colorResetButton.extraSettingsEl.addClass('iconic-invisible');
						this.colorResetButton.extraSettingsEl.tabIndex = -1;
					} else {
						this.color = color;
						this.colorResetButton.extraSettingsEl.removeClass('iconic-invisible');
						this.colorResetButton.extraSettingsEl.tabIndex = 0;
					}
					this.updateColorPicker();
					this.updateSearchResultColors();
				});
				// @ts-expect-error (Private API)
				this.iconManager.refreshIcon({ icon: 'lucide-paint-bucket', color }, menuItem.iconEl);
			});
		}
		menu.showAtPosition({ x, y });
	}

	/**
	 * Select previous color in list. Used by keyboard and scrollwheel events.
	 */
	private previousColor(): void {
		let index = COLOR_KEYS.length - 1;
		if (this.color && COLOR_KEY_SET.has(this.color) && this.color !== COLOR_KEYS.first()) {
			index = COLOR_KEYS.indexOf(this.color) - 1;
		}
		this.color = COLOR_KEYS[index];
		this.colorResetButton.extraSettingsEl.removeClass('iconic-invisible');
		this.colorResetButton.extraSettingsEl.tabIndex = 0;
		this.updateColorPicker();
		this.updateSearchResultColors();
	}

	/**
	 * Select next color in list. Used by keyboard and scrollwheel events.
	 */
	private nextColor(): void {
		let index = 0;
		if (this.color && COLOR_KEY_SET.has(this.color) && this.color !== COLOR_KEYS.last()) {
			index = COLOR_KEYS.indexOf(this.color) + 1;
		}
		this.color = COLOR_KEYS[index];
		this.colorResetButton.extraSettingsEl.removeClass('iconic-invisible');
		this.colorResetButton.extraSettingsEl.tabIndex = 0;
		this.updateColorPicker();
		this.updateSearchResultColors();
	}

	/**
	 * Reset icon to the default color.
	 */
	private resetColor(): void {
		this.color = null;
		this.colorResetButton.extraSettingsEl.addClass('iconic-invisible');
		this.colorResetButton.extraSettingsEl.tabIndex = -1;
		this.updateColorPicker();
		this.updateSearchResultColors();
	}

	private toggleMobileSearchMode(): void {
		const { dialogState } = this.plugin.settings;
		if (dialogState.iconMode && dialogState.emojiMode) {
			dialogState.iconMode = true;
			dialogState.emojiMode = false;
		} else if (dialogState.iconMode) {
			dialogState.iconMode = false;
			dialogState.emojiMode = true;
		} else {
			dialogState.iconMode = true;
			dialogState.emojiMode = true;
		}

		this.updateMobileSearchMode();
	}

	private updateMobileSearchMode(): void {
		const { dialogState } = this.plugin.settings;
		if (dialogState.iconMode && dialogState.emojiMode) {
			this.setTitle(this.items.length === 1
				? STRINGS.iconPicker.changeMix
				: STRINGS.iconPicker.changeMixes.replace('{#}', this.items.length.toString())
			);
			this.searchField.setPlaceholder(STRINGS.iconPicker.searchMix);
			this.mobileModeButton?.setButtonText(STRINGS.iconPicker.icons);
		} else if (dialogState.iconMode) {
			this.setTitle(this.items.length === 1
				? STRINGS.iconPicker.changeIcon
				: STRINGS.iconPicker.changeIcons.replace('{#}', this.items.length.toString())
			);
			this.searchField.setPlaceholder(STRINGS.iconPicker.searchIcons);
			this.mobileModeButton?.setButtonText(STRINGS.iconPicker.emojis);
		} else {
			this.setTitle(this.items.length === 1
				? STRINGS.iconPicker.changeEmoji
				: STRINGS.iconPicker.changeEmojis.replace('{#}', this.items.length.toString())
			);
			this.searchField.setPlaceholder(STRINGS.iconPicker.searchEmojis);
			this.mobileModeButton?.setButtonText(STRINGS.iconPicker.mixed);
		}

		this.updateSearchResults();
	}

	private updateDesktopSearchMode(): void {
		const { dialogState } = this.plugin.settings;
		this.iconModeButton.setIcon(dialogState.iconMode ? 'lucide-image' : 'lucide-square');
		this.emojiModeButton.setIcon(dialogState.emojiMode ? 'lucide-smile' : 'lucide-circle');
		this.iconModeButton.extraSettingsEl.toggleClass('iconic-mode-selected', dialogState.iconMode);
		this.emojiModeButton.extraSettingsEl.toggleClass('iconic-mode-selected', dialogState.emojiMode);

		if (dialogState.iconMode && dialogState.emojiMode) {
			this.setTitle(this.items.length === 1
				? STRINGS.iconPicker.changeMix
				: STRINGS.iconPicker.changeMixes.replace('{#}', this.items.length.toString())
			);
			this.searchField.setPlaceholder(STRINGS.iconPicker.searchMix);
		} else if (dialogState.emojiMode) {
			this.setTitle(this.items.length === 1
				? STRINGS.iconPicker.changeEmoji
				: STRINGS.iconPicker.changeEmojis.replace('{#}', this.items.length.toString())
			);
			this.searchField.setPlaceholder(STRINGS.iconPicker.searchEmojis);
		} else {
			this.setTitle(this.items.length === 1
				? STRINGS.iconPicker.changeIcon
				: STRINGS.iconPicker.changeIcons.replace('{#}', this.items.length.toString())
			);
			this.searchField.setPlaceholder(STRINGS.iconPicker.searchIcons);
		}

		this.updateSearchResults();
	}

	/**
	 * Update color of color picker without triggering its onChange() logic.
	 */
	private updateColorPicker(): void {
		this.colorPickerPaused = true;
		this.colorPicker.setValueRgb(ColorUtils.toRgbObject(this.color));
		this.colorPickerPaused = false;
		this.updateColorTooltip();
	}

	/**
	 * Update just the color picker tooltip.
	 */
	private updateColorTooltip(): void {
		// Set tooltip message
		let tooltip = STRINGS.iconPicker.changeColor;
		if (this.color) {
			if (COLOR_KEY_SET.has(this.color)) {
				tooltip = STRINGS.iconPicker.colors[this.color as keyof typeof STRINGS.iconPicker.colors];
			} else {
				tooltip = this.color;
			}
		}

		// Update tooltip instantly if cursor is hovering over color picker
		if (this.colorPickerHovered) {
			displayTooltip(this.colorPickerEl, tooltip, { delay: 1 });
		} else {
			setTooltip(this.colorPickerEl, tooltip, { delay: 300 });
		}
	}

	/**
	 * Update only the colors of existing search result icons, without rebuilding the DOM.
	 */
	private updateSearchResultColors(): void {
		const rgb = this.color ? ColorUtils.toRgb(this.color) : null;
		const hsl = this.color ? ColorUtils.toHslArray(this.color) : null;
		const children = this.searchResultsSetting.controlEl.children;
		for (let i = 0; i < children.length; i++) {
			const el = children[i] as HTMLElement;
			const svgEl = el.find('.svg-icon');
			if (svgEl) {
				if (rgb) {
					svgEl.style.setProperty('color', rgb);
				} else {
					svgEl.style.removeProperty('color');
				}
			}
			const emojiEl = el.find('.iconic-emoji');
			if (emojiEl) {
				if (hsl) {
					(emojiEl as HTMLElement).style.filter = `grayscale() sepia() hue-rotate(${hsl[0] - 50}deg) saturate(${hsl[1] * 5}%)`;
				} else {
					(emojiEl as HTMLElement).style.filter = '';
				}
			}
		}
	}

	/**
	 * Update search results based on current query.
	 */
	private updateSearchResults(): void {
		// Invalidate cached items-per-row (layout may change)
		this.cachedItemsPerRow = null;

		// Cancel any pending chunked render
		if (this.browseRenderTimer !== null) {
			cancelAnimationFrame(this.browseRenderTimer);
			this.browseRenderTimer = null;
		}

		const query = this.searchField.getValue();
		const packFilter = this.plugin.settings.dialogState.packFilter;

		// Cache filtered icons — only recompute when pack filter changes
		if (packFilter !== this.cachedPackFilter) {
			this.cachedPackFilter = packFilter;
			this.cachedFilteredIcons = [];
			if (packFilter === 'lucide') {
				for (const [id, name] of ICONS) {
					if (id.startsWith('lucide-')) this.cachedFilteredIcons.push([id, name]);
				}
			} else if (packFilter) {
				const pack = this.plugin.iconPackManager.getInstalledPack(packFilter);
				if (pack) {
					for (const [id, name] of ICONS) {
						if (id.startsWith(pack.prefix)) this.cachedFilteredIcons.push([id, name]);
					}
				}
			} else {
				for (const entry of ICONS) {
					this.cachedFilteredIcons.push(entry);
				}
			}
			this.cachedFilteredIcons.sort(([, a], [, b]) => a.localeCompare(b));
		}

		// Browse mode: show all pack icons when a specific pack is selected
		const isBrowseMode = !!packFilter;
		this.searchResultsSetting.settingEl.toggleClass('iconic-browse-mode', isBrowseMode);

		this.searchResults.length = 0;

		if (isBrowseMode && !query) {
			// Show all pack icons — no fuzzy search or sorting needed
			if (this.plugin.settings.dialogState.iconMode) {
				for (const entry of this.cachedFilteredIcons) {
					this.searchResults.push(entry);
				}
			}
		} else if (query) {
			// Build entries to search
			const iconEntries: Iterable<[string, string]>[] = [];
			if (this.plugin.settings.dialogState.iconMode) iconEntries.push(this.cachedFilteredIcons);
			if (!isBrowseMode && this.plugin.settings.dialogState.emojiMode) iconEntries.push(EMOJIS);

			// Search all icon names
			const fuzzySearch = prepareFuzzySearch(query);
			const matches: [score: number, iconEntry: [string, string]][] = [];
			for (const source of iconEntries) {
				for (const [icon, iconName] of source) {
					if (query === icon) { // Recognize emoji input
						matches.push([0, [icon, iconName]]);
					} else {
						const fuzzyMatch = fuzzySearch(iconName);
						if (fuzzyMatch) matches.push([fuzzyMatch.score, [icon, iconName]]);
					}
				}
			}
			matches.sort(([scoreA,], [scoreB,]) => scoreA > scoreB ? -1 : +1);
			const maxResults = isBrowseMode ? Infinity : this.plugin.settings.maxSearchResults;
			for (const [, iconEntry] of matches) {
				this.searchResults.push(iconEntry);
				if (this.searchResults.length === maxResults) break;
			}
		}

		// Preserve UI state
		const { controlEl, settingEl } = this.searchResultsSetting;
		const focusedEl = this.modalEl.doc.activeElement;
		const focusedIndex = focusedEl ? controlEl.indexOf(focusedEl) : -1;
		const scrollLeft = settingEl.scrollLeft;
		const scrollTop = settingEl.scrollTop;

		// Populate icon buttons
		this.searchResultsSetting.clear();
		const deferredIcons: [HTMLElement, string][] = [];

		if (isBrowseMode && this.searchResults.length > 0) {
			// Browse mode: raw divs via DocumentFragment (no ExtraButtonComponent overhead)
			const fragment = document.createDocumentFragment();
			for (const [icon, iconName] of this.searchResults) {
				const div = document.createElement('div');
				div.className = 'clickable-icon extra-setting-button iconic-search-result';
				div.dataset.icon = icon;
				div.ariaLabel = iconName;
				div.tabIndex = -1;
				fragment.appendChild(div);
				deferredIcons.push([div, icon]);
			}
			controlEl.appendChild(fragment);
		} else {
			// Standard mode: use addExtraButton for ≤maxSearchResults items
			for (const [icon, iconName] of this.searchResults) {
				this.searchResultsSetting.addExtraButton(iconButton => {
					iconButton.setTooltip(iconName, {
						delay: 300,
						placement: Platform.isPhone ? 'top' : 'bottom',
					});
					const iconEl = iconButton.extraSettingsEl;
					iconEl.addClass('iconic-search-result');
					iconEl.tabIndex = -1;
					deferredIcons.push([iconEl, icon]);

					if (Platform.isPhone) this.iconManager.setEventListener(iconEl, 'contextmenu', () => {
						navigator.vibrate?.(100); // Not supported on iOS
						displayTooltip(iconEl, iconName, { placement: 'top' });
					});
				});
			}
		}

		// Render icons (chunked in browse mode for large packs)
		const BROWSE_BATCH_SIZE = 200;
		const initialCount = isBrowseMode
			? Math.min(BROWSE_BATCH_SIZE, deferredIcons.length)
			: deferredIcons.length;
		for (let i = 0; i < initialCount; i++) {
			const [iconEl, icon] = deferredIcons[i];
			if (isBrowseMode) {
				// No per-element click handler — event delegation handles it
				this.iconManager.refreshIcon({ icon, color: this.color ?? null }, iconEl);
			} else {
				this.iconManager.refreshIcon({ icon, color: this.color ?? null }, iconEl, () => {
					this.closeAndSave(icon, this.color);
				});
			}
		}

		// Restore UI state
		if (focusedIndex > -1) {
			const iconEl = controlEl.children[focusedIndex];
			if (iconEl instanceof HTMLElement) iconEl.focus();
		}
		settingEl.scrollLeft = scrollLeft;
		settingEl.scrollTop = scrollTop;

		// Use an invisible button to preserve height
		if (this.searchResults.length === 0) {
			this.searchResultsSetting.addExtraButton(button => {
				button.extraSettingsEl.addClasses(['iconic-invisible', 'iconic-search-result']);
			});
		}

		// Schedule remaining icon renders in chunks
		if (deferredIcons.length > initialCount) {
			this.scheduleBrowseRender(deferredIcons, initialCount, BROWSE_BATCH_SIZE, isBrowseMode);
		}
	}

	/**
	 * Progressively render deferred browse icons in chunks via requestAnimationFrame.
	 */
	private scheduleBrowseRender(deferredIcons: [HTMLElement, string][], startIndex: number, batchSize: number, isBrowseMode: boolean): void {
		this.browseRenderTimer = requestAnimationFrame(() => {
			this.browseRenderTimer = null;
			const endIndex = Math.min(startIndex + batchSize, deferredIcons.length);
			for (let i = startIndex; i < endIndex; i++) {
				const [iconEl, icon] = deferredIcons[i];
				if (isBrowseMode) {
					this.iconManager.refreshIcon({ icon, color: this.color ?? null }, iconEl);
				} else {
					this.iconManager.refreshIcon({ icon, color: this.color ?? null }, iconEl, () => {
						this.closeAndSave(icon, this.color);
					});
				}
			}
			if (endIndex < deferredIcons.length) {
				this.scheduleBrowseRender(deferredIcons, endIndex, batchSize, isBrowseMode);
			}
		});
	}

	/**
	 * Display a reminder if this icon is currently overruled.
	 */
	private updateOverruleReminder(): void {
		this.overruleEl?.remove();
		let page: Category;
		let rule: RuleItem | null = null;
		let isOverride = false;

		// Determine which rule to display
		if (this.items.length > 1) {
			let hasOverride = false;
			let hasOverrule = false;
			for (const item of this.items) {
				const itemRule = this.plugin.ruleManager.checkRuling(item.category, item.id);
				if (itemRule) {
					if (item.icon || item.color) {
						hasOverride = true;
					} else {
						hasOverrule = true;
					}
					if (!rule) {
						rule = itemRule;
						page = item.category;
					}
				}
			}
			// If there are both overrides and overrules, prefer the overrule message
			isOverride = hasOverride && !hasOverrule;
		} else {
			const item = this.items[0];
			rule = this.plugin.ruleManager.checkRuling(item.category, item.id);
			page = item.category;
			isOverride = !!(rule && (item.icon || item.color));
		}

		if (rule) {
			const rgb = ColorUtils.toRgbObject(this.items.length === 1 ? rule.color : 'gray');
			const cssColor = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

			// Create callout elements
			this.overruleEl = createDiv({
				cls: 'callout',
				attr: { style: '--callout-color: ' + cssColor },
			});
			const titleEl = this.overruleEl.createDiv({ cls: 'callout-title' });
			const iconEl = titleEl.createDiv({ cls: 'callout-icon' });
			const innerEl = titleEl.createDiv({ cls: 'callout-title-inner' });

			const openRuleEditor = (linkEl: HTMLElement) => {
				this.iconManager.setEventListener(linkEl, 'click', () => {
					if (page && rule) RuleEditor.open(this.plugin, page, rule, newRule => {
						if (!rule) return;
						const isRulingChanged = newRule
							? this.plugin.ruleManager.saveRule(page, newRule)
							: this.plugin.ruleManager.deleteRule(page, rule.id);
						if (isRulingChanged) {
							this.plugin.refreshManagers(page);
						}
						this.updateOverruleReminder();
					});
				});
			};

			// Populate callout message
			if (this.items.length > 1) {
				this.iconManager.refreshIcon({ icon: 'lucide-book-image', color: 'gray' }, iconEl);
				innerEl.setText(isOverride ? STRINGS.iconPicker.overrides : STRINGS.iconPicker.overrules);
			} else if (isOverride) {
				this.iconManager.refreshIcon(rule, iconEl);
				innerEl.setText(STRINGS.iconPicker.overridePrefix);
				const linkEl = innerEl.createEl('a', { text: rule.name });
				innerEl.appendText(STRINGS.iconPicker.overrideSuffix);
				openRuleEditor(linkEl);
			} else {
				this.iconManager.refreshIcon(rule, iconEl);
				innerEl.setText(STRINGS.iconPicker.overrulePrefix);
				const linkEl = innerEl.createEl('a', { text: rule.name });
				innerEl.appendText(STRINGS.iconPicker.overruleSuffix);
				openRuleEditor(linkEl);
			}
			this.contentEl.prepend(this.overruleEl);
		}
	}

	/**
	 * Close dialog while passing icon & color to original callback.
	 */
	private closeAndSave(icon: string | null | undefined, color: string | null | undefined): void {
		if (this.callback) {
			this.callback(icon ?? null, color ?? null);
		} else if (this.multiCallback) {
			this.multiCallback(icon, color);
		}
		this.close();
	}

	/**
	 * @override
	 */
	onClose(): void {
		if (this.browseRenderTimer !== null) {
			cancelAnimationFrame(this.browseRenderTimer);
			this.browseRenderTimer = null;
		}
		this.contentEl.empty();
		this.iconManager.stopEventListeners();
		this.iconManager.stopMutationObservers();
		this.plugin.saveSettings(); // Save any changes to dialogState
	}
}
