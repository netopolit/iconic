import { WorkspaceLeaf } from 'obsidian';
import IconicPlugin, { PropertyItem } from 'src/IconicPlugin';
import IconManager from 'src/managers/IconManager';

/**
 * Handles icons in the All Properties and File Properties panes.
 */
export default class PropertyIconManager extends IconManager {
	private allPropsContainerEl: HTMLElement | null = null;
	private filePropsContainerEl: HTMLElement | null = null;

	constructor(plugin: IconicPlugin) {
		super(plugin);
		this.plugin.registerEvent(this.app.workspace.on('layout-change', () => {
			if (activeDocument.contains(this.allPropsContainerEl)
				|| activeDocument.contains(this.filePropsContainerEl)) return;
			this.app.workspace.iterateAllLeaves(leaf => this.manageLeaf(leaf));
		}));
		this.app.workspace.iterateAllLeaves(leaf => this.manageLeaf(leaf));
	}

	/**
	 * Start managing this leaf if has a matching type.
	 */
	private manageLeaf(leaf: WorkspaceLeaf): void {
		if (leaf.getViewState().type === 'all-properties') {
			this.stopMutationObserver(this.allPropsContainerEl);
			this.allPropsContainerEl = leaf.view.containerEl.find('.view-content > div');
			this.setMutationObserver(this.allPropsContainerEl, {
				subtree: true,
				childList: true,
			}, mutation => {
				for (const addedNode of mutation.addedNodes) {
					if (addedNode instanceof HTMLElement && addedNode.hasClass('tree-item')) {
						this.refreshIcons();
						return;
					}
				}
			});
			this.refreshIcons();
		}

		if (leaf.getViewState().type === 'file-properties') {
			this.stopMutationObserver(this.filePropsContainerEl);
			this.filePropsContainerEl = leaf.view.containerEl.find('.metadata-properties');
			this.setMutationObserver(this.filePropsContainerEl, {
				subtree: true,
				childList: true,
			}, mutation => {
				for (const addedNode of mutation.addedNodes) {
					if (addedNode instanceof HTMLElement && addedNode.hasClass('metadata-property')) {
						this.refreshIcons();
						return;
					}
				}
			});
			this.refreshIcons();
		}
	}

	/**
	 * @override
	 * Refresh all property icons.
	 */
	refreshIcons(unloading?: boolean): void {
		const props = this.plugin.getPropertyItems(unloading);

		// Stop observers while DOM icons are refreshed
		this.stopMutationObserver(this.allPropsContainerEl);
		this.stopMutationObserver(this.filePropsContainerEl);

		// All Properties pane
		const propMap = new Map<string, PropertyItem>();
		for (const prop of props) propMap.set(prop.id, prop);

		const itemEls = this.allPropsContainerEl?.findAll(':scope > .tree-item') ?? [];
		for (const itemEl of itemEls) {
			itemEl.addClass('iconic-item');

			const textEl = itemEl.find('.tree-item-self > .tree-item-inner > .tree-item-inner-text');
			const prop = textEl ? propMap.get(textEl.getText()) : undefined;
			if (!prop) continue;

			const iconEl = itemEl.find('.tree-item-self > .tree-item-icon');
			if (!iconEl) continue;

			// Refresh icon
			if (this.plugin.isSettingEnabled('clickableIcons')) {
				this.refreshIcon(prop, iconEl, event => {
					this.plugin.openIconPicker([prop],
						(icon, color) => this.plugin.savePropertyIcon(prop, icon, color),
						null, 'property');
					event.stopPropagation();
				});
			} else {
				this.refreshIcon(prop, iconEl);
			}

			// Add menu items
			this.setContextMenu(itemEl, () => {
				this.onContextMenu(prop.id);
			}, { capture: true });
		}

		// File Properties pane
		const propEls = this.filePropsContainerEl?.findAll('.metadata-property') ?? [];
		for (const propEl of propEls) {
			const propInputEl = propEl.find('.metadata-property-key-input');
			if (!(propInputEl instanceof HTMLInputElement)) continue;

			const propId = propInputEl.value;
			if (!propId) continue;

			const prop = this.plugin.getPropertyItem(propId);
			if (!prop) continue;
			const iconEl = propEl.find('.metadata-property-icon');
			if (!iconEl) continue;

			// Refresh icon
			if (this.plugin.isSettingEnabled('clickableIcons')) {
				this.refreshIcon(prop, iconEl, event => {
					this.plugin.openIconPicker([prop],
						(icon, color) => this.plugin.savePropertyIcon(prop, icon, color),
						null, 'property');
					event.stopPropagation();
				});
			} else {
				this.refreshIcon(prop, iconEl);
			}

			// Add menu items
			this.setContextMenu(propEl, () => {
				this.onContextMenu(prop.id);
			}, { capture: true });
		}

		// Restart observers
		this.setMutationsObserver(this.allPropsContainerEl, {
			subtree: true,
			childList: true,
		}, () => this.refreshIcons());
		this.setMutationsObserver(this.filePropsContainerEl, {
			subtree: true,
			childList: true,
		}, () => this.refreshIcons());
	}

	/**
	 * When user context-clicks a property, add custom items to the menu.
	 */
	private onContextMenu(clickedPropId: string): void {
		navigator.vibrate?.(100); // Not supported on iOS
		this.plugin.menuManager.closeAndFlush();
		const clickedProp: PropertyItem = this.plugin.getPropertyItem(clickedPropId);
		const selectedProps: PropertyItem[] = [];

		for (const selfEl of this.allPropsContainerEl?.findAll('.tree-item-self.is-selected') ?? []) {
			const textEl = selfEl.find(':scope > .tree-item-inner > .tree-item-inner-text');
			if (textEl?.textContent) {
				selectedProps.push(this.plugin.getPropertyItem(textEl.textContent));
			}
		}

		// If clicked property is not selected, ignore selected items
		if (!selectedProps.some(selectedProp => selectedProp.id === clickedProp.id)) {
			selectedProps.length = 0;
		}

		// Determine effective items list for menu title/action
		const items = selectedProps.length < 2 ? [clickedProp] : selectedProps;

		// Change icon(s)
		this.plugin.menuManager.addItemAfter(['action.changeType', 'action'], this.changeIconItem(items, () => {
			this.plugin.openIconPicker(items,
				(icon, color) => this.plugin.savePropertyIcon(clickedProp, icon, color),
				(icon, color) => this.plugin.savePropertyIcons(selectedProps, icon, color),
				'property');
		}));

		// Remove icon(s) / Reset color(s)
		if (items.some(prop => prop.icon || prop.color)) {
			this.plugin.menuManager.addItem(this.removeIconItem(items, () => {
				if (selectedProps.length < 2) {
					this.plugin.savePropertyIcon(clickedProp, null, null);
				} else {
					this.plugin.savePropertyIcons(selectedProps, null, null);
				}
				this.plugin.refreshManagers('property');
			}));
		}
	}

	/**
	 * @override
	 */
	unload(): void {
		this.refreshIcons(true);
		super.unload();
	}
}
