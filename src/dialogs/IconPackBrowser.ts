import { ButtonComponent, Modal, Setting } from 'obsidian';
import IconicPlugin, { ICONS, STRINGS } from 'src/IconicPlugin';
import { ICON_PACK_REGISTRY } from 'src/IconPacks';

/**
 * Modal for browsing, installing, and removing icon packs.
 */
export default class IconPackBrowser extends Modal {
	private readonly plugin: IconicPlugin;

	private constructor(plugin: IconicPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	/**
	 * Open the icon pack browser modal.
	 */
	static open(plugin: IconicPlugin): void {
		new IconPackBrowser(plugin).open();
	}

	/**
	 * @override
	 */
	onOpen(): void {
		this.containerEl.addClass('mod-confirmation');
		this.modalEl.addClass('iconic-pack-browser');
		this.setTitle(STRINGS.iconPacks.browserTitle);
		this.renderPacks();
	}

	/**
	 * Render the list of available icon packs.
	 */
	private renderPacks(): void {
		this.contentEl.empty();

		for (const pack of ICON_PACK_REGISTRY) {
			const isInstalled = this.plugin.iconPackManager.isInstalled(pack.id);
			const installedVersion = this.plugin.iconPackManager.getInstalledVersion(pack.id);
			const hasUpdate = isInstalled && installedVersion !== pack.version;

			const setting = new Setting(this.contentEl)
				.setName(pack.name)
				.setDesc(
					isInstalled
						? STRINGS.iconPacks.installedDesc
							.replace('{#}', this.plugin.iconPackManager.getPackIcons(pack.id).length.toString())
							.replace('{text}', installedVersion ?? pack.version)
						: STRINGS.iconPacks.availableDesc
							.replace('{#}', pack.count.toString())
							.replace('{text}', pack.version)
				);

			if (isInstalled) {
				if (hasUpdate) {
					setting.addButton(button => button
						.setButtonText(STRINGS.iconPacks.update)
						.setCta()
						.onClick(async () => {
							button.setDisabled(true);
							await this.plugin.iconPackManager.uninstallPack(pack.id);
							await this.plugin.iconPackManager.installPack(pack);
							this.rebuildIconsMap();
							this.renderPacks();
						})
					);
				}

				setting.addButton(button => button
					.setButtonText(STRINGS.iconPacks.remove)
					.setWarning()
					.onClick(async () => {
						button.setDisabled(true);
						await this.plugin.iconPackManager.uninstallPack(pack.id);
						this.rebuildIconsMap();
						this.renderPacks();
					})
				);
			} else {
				setting.addButton(button => button
					.setButtonText(STRINGS.iconPacks.install)
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText(STRINGS.iconPacks.installing.replace('{text}', ''));
						await this.plugin.iconPackManager.installPack(pack);
						this.rebuildIconsMap();
						this.renderPacks();
					})
				);
			}
		}

		// Close button
		const buttonContainerEl = this.contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttonContainerEl)
			.setButtonText(STRINGS.iconPicker.cancel)
			.onClick(() => this.close());
	}

	/**
	 * Rebuild the ICONS map to include/exclude icon pack icons.
	 */
	private rebuildIconsMap(): void {
		// Remove all pack icons from the map
		for (const iconId of ICONS.keys()) {
			if (!iconId.startsWith('lucide-')) {
				ICONS.delete(iconId);
			}
		}

		// Re-add icons from all installed packs
		for (const pack of this.plugin.iconPackManager.getInstalledPacks()) {
			for (const iconName of pack.iconNames) {
				const iconId = pack.prefix + iconName;
				const tidyName = iconName.replaceAll('-', ' ');
				const capitalizedName = pack.name + ': ' + (tidyName[0]?.toUpperCase() + tidyName.slice(1));
				ICONS.set(iconId, capitalizedName);
			}
		}
	}

	/**
	 * @override
	 */
	onClose(): void {
		this.contentEl.empty();
	}
}
