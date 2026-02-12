import { addIcon, normalizePath, Notice, removeIcon, requestUrl } from 'obsidian';
import { unzipSync } from 'fflate';
import IconicPlugin, { STRINGS } from 'src/IconicPlugin';
import { IconPackMeta, InstalledIconPack, processPackSvg } from 'src/IconPacks';

/**
 * Manages downloading, installing, loading, and uninstalling icon packs.
 */
export default class IconPackManager {
	private readonly plugin: IconicPlugin;
	private readonly installedPacks = new Map<string, InstalledIconPack>();
	private readonly iconBasePath: string;

	constructor(plugin: IconicPlugin) {
		this.plugin = plugin;
		this.iconBasePath = normalizePath(
			this.plugin.app.vault.configDir + '/plugins/iconic/icons'
		);
	}

	/**
	 * Load all installed icon packs from disk and register their icons.
	 */
	async loadInstalledPacks(): Promise<void> {
		const { adapter } = this.plugin.app.vault;

		if (!await adapter.exists(this.iconBasePath)) return;

		const listing = await adapter.list(this.iconBasePath);
		for (const dir of listing.folders) {
			const metaPath = normalizePath(dir + '/meta.json');
			if (!await adapter.exists(metaPath)) continue;

			try {
				const metaJson = await adapter.read(metaPath);
				const pack: InstalledIconPack = JSON.parse(metaJson);
				this.installedPacks.set(pack.id, pack);

				// Register each icon with Obsidian
				for (const iconName of pack.iconNames) {
					const svgPath = normalizePath(dir + '/' + iconName + '.svg');
					if (await adapter.exists(svgPath)) {
						const svgContent = await adapter.read(svgPath);
						addIcon(pack.prefix + iconName, svgContent);
					}
				}
			} catch (e) {
				console.error(`Iconic: Failed to load icon pack from ${dir}`, e);
			}
		}
	}

	/**
	 * Install an icon pack: download ZIP, extract SVGs, process, and save.
	 */
	async installPack(packMeta: IconPackMeta): Promise<void> {
		const { adapter } = this.plugin.app.vault;
		const packDir = normalizePath(this.iconBasePath + '/' + packMeta.id);
		const notice = new Notice(
			STRINGS.iconPacks.installing.replace('{text}', packMeta.name),
			0,
		);

		try {
			// Download ZIP
			const response = await requestUrl({ url: packMeta.downloadUrl });
			const zipData = new Uint8Array(response.arrayBuffer);

			// Extract ZIP
			const files = unzipSync(zipData);

			// Ensure icons directory exists
			if (!await adapter.exists(this.iconBasePath)) {
				await adapter.mkdir(this.iconBasePath);
			}
			if (await adapter.exists(packDir)) {
				await adapter.rmdir(packDir, true);
			}
			await adapter.mkdir(packDir);

			// Process and save each SVG
			const iconNames: string[] = [];
			const prefix = packMeta.path + '/';
			const isRemixPack = packMeta.id === 'remix-icons';
			const isBoxiconsPack = packMeta.id === 'boxicons';

			for (const [filePath, fileData] of Object.entries(files)) {
				if (!filePath.endsWith('.svg')) continue;

				// For Remix Icons, recurse into subdirectories
				// For Boxicons, recurse into subdirectories (regular/solid/logos)
				let matchesPath = false;
				if (isRemixPack || isBoxiconsPack) {
					matchesPath = filePath.startsWith(prefix);
				} else {
					// Must be directly in the target directory
					const fileDir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
					matchesPath = fileDir === prefix;
				}
				if (!matchesPath) continue;

				const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
				const iconName = fileName.replace('.svg', '');
				const svgString = new TextDecoder().decode(fileData);
				const processed = processPackSvg(svgString);

				if (processed) {
					const savePath = normalizePath(packDir + '/' + iconName + '.svg');
					await adapter.write(savePath, processed);
					iconNames.push(iconName);
					addIcon(packMeta.prefix + iconName, processed);
				}
			}

			// Save meta.json
			const installedPack: InstalledIconPack = {
				...packMeta,
				installedAt: Date.now(),
				iconNames,
			};
			await adapter.write(
				normalizePath(packDir + '/meta.json'),
				JSON.stringify(installedPack, null, '\t'),
			);

			this.installedPacks.set(packMeta.id, installedPack);

			// Update plugin settings
			this.plugin.settings.installedPacks[packMeta.id] = {
				version: packMeta.version,
				prefix: packMeta.prefix,
				name: packMeta.name,
			};
			await this.plugin.saveSettings();

			notice.hide();
			new Notice(
				STRINGS.iconPacks.installed
					.replace('{text}', packMeta.name)
					.replace('{#}', iconNames.length.toString()),
			);
		} catch (e) {
			notice.hide();
			new Notice(STRINGS.iconPacks.installError.replace('{text}', packMeta.name));
			console.error(`Iconic: Failed to install icon pack ${packMeta.id}`, e);

			// Clean up partial install
			if (await adapter.exists(packDir)) {
				await adapter.rmdir(packDir, true);
			}
		}
	}

	/**
	 * Uninstall an icon pack: remove files, unregister icons, update settings.
	 */
	async uninstallPack(packId: string): Promise<void> {
		const { adapter } = this.plugin.app.vault;
		const pack = this.installedPacks.get(packId);
		if (!pack) return;

		// Unregister all icons
		for (const iconName of pack.iconNames) {
			removeIcon(pack.prefix + iconName);
		}

		// Remove directory
		const packDir = normalizePath(this.iconBasePath + '/' + packId);
		if (await adapter.exists(packDir)) {
			await adapter.rmdir(packDir, true);
		}

		// Update state
		this.installedPacks.delete(packId);
		delete this.plugin.settings.installedPacks[packId];
		await this.plugin.saveSettings();

		new Notice(STRINGS.iconPacks.removed.replace('{text}', pack.name));
	}

	/**
	 * Get all installed packs.
	 */
	getInstalledPacks(): InstalledIconPack[] {
		return [...this.installedPacks.values()];
	}

	/**
	 * Check if a pack is installed.
	 */
	isInstalled(packId: string): boolean {
		return this.installedPacks.has(packId);
	}

	/**
	 * Get the installed version of a pack, or null if not installed.
	 */
	getInstalledVersion(packId: string): string | null {
		return this.installedPacks.get(packId)?.version ?? null;
	}

	/**
	 * Get all icon names (with prefix) from an installed pack.
	 */
	getPackIcons(packId: string): string[] {
		const pack = this.installedPacks.get(packId);
		if (!pack) return [];
		return pack.iconNames.map(name => pack.prefix + name);
	}

	/**
	 * Cleanup on plugin unload.
	 */
	unload(): void {
		// Remove all registered icons
		for (const pack of this.installedPacks.values()) {
			for (const iconName of pack.iconNames) {
				removeIcon(pack.prefix + iconName);
			}
		}
		this.installedPacks.clear();
	}
}
