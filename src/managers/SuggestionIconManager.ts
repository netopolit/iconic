import { AbstractInputSuggest, EditorSuggest, TFile } from 'obsidian';
import IconicPlugin from 'src/IconicPlugin';
import IconManager from 'src/managers/IconManager';

const FILE_SUGGESTION = 'file';
const TAG_SUGGESTION = 'tag';
const PROPERTY_SUGGESTION = 'property';
const UNKNOWN_SUGGESTION = null;

/**
 * Intercepts suggestion popovers to add custom icons.
 */
export default class SuggestionIconManager extends IconManager {
	// @ts-expect-error (Private API)
	private showAbstractSuggestionsOriginal: typeof AbstractInputSuggest.prototype.showSuggestions;
	// @ts-expect-error (Private API)
	private showAbstractSuggestionsProxy: typeof AbstractInputSuggest.prototype.showSuggestions;
	private renderAbstractSuggestionProxy: typeof AbstractInputSuggest.prototype.renderSuggestion;

	// @ts-expect-error (Private API)
	private showEditorSuggestionsOriginal: typeof AbstractInputSuggest.prototype.showSuggestions;
	// @ts-expect-error (Private API)
	private showEditorSuggestionsProxy: typeof AbstractInputSuggest.prototype.showSuggestions;
	private renderEditorSuggestionProxy: typeof AbstractInputSuggest.prototype.renderSuggestion;

	constructor(plugin: IconicPlugin) {
		super(plugin);
		this.setupAbstractSuggestionProxies();
		this.setupEditorSuggestionProxies();
	}

	/**
	 * Intercept property key/value suggestion popovers.
	 */
	private setupAbstractSuggestionProxies(): void {
		// Store original method
		// @ts-expect-error (Private API)
		this.showAbstractSuggestionsOriginal = AbstractInputSuggest.prototype.showSuggestions;

		// Catch popovers before they open
		// @ts-expect-error (Private API)
		this.showAbstractSuggestionsProxy = new Proxy(AbstractInputSuggest.prototype.showSuggestions, {
			apply: (showSuggestions, popover: AbstractInputSuggest<unknown>, args) => {
				if (this.isDisabled()) {
					return showSuggestions.call(popover, ...args);
				}

				// Proxy renderSuggestion() for each instance
				if (popover.renderSuggestion !== this.renderAbstractSuggestionProxy) {
					this.renderAbstractSuggestionProxy = new Proxy(popover.renderSuggestion, {
						apply: (renderSuggestion, popover: AbstractInputSuggest<unknown>, args: [unknown, HTMLElement]) => {
							// Call base method first to pre-populate elements
							const returnValue = renderSuggestion.call(popover, ...args);
							if (this.isDisabled()) return returnValue;

							const [value, el] = args;
							if (!value || !(el instanceof HTMLElement)) return;

							switch (this.getSuggestionType(value)) {
								case FILE_SUGGESTION: this.refreshFileIcon(value, el); break;
								case TAG_SUGGESTION: this.refreshTagIcon(value, el); break;
								case PROPERTY_SUGGESTION: this.refreshPropertyIcon(value, el); break;
							}

							return returnValue;
						}
					});

					// Replace original method
					popover.renderSuggestion = this.renderAbstractSuggestionProxy;
				}

				return showSuggestions.call(popover, ...args);
			}
		});

		// @ts-expect-error (Private API)
		// Replace original method
		AbstractInputSuggest.prototype.showSuggestions = this.showAbstractSuggestionsProxy;
	}

	/**
	 * Intercept editor suggestion popovers.
	 */
	private setupEditorSuggestionProxies(): void {
		// Store original method
		// @ts-expect-error (Private API)
		this.showEditorSuggestionsOriginal = EditorSuggest.prototype.showSuggestions;

		// Catch popovers before they open
		// @ts-expect-error (Private API)
		this.showEditorSuggestionsProxy = new Proxy(EditorSuggest.prototype.showSuggestions, {
			apply: (showSuggestions, popover: EditorSuggest<unknown>, args) => {
				if (this.isDisabled()) {
					return showSuggestions.call(popover, ...args);
				}

				// Proxy renderSuggestion() for each instance
				if (popover.renderSuggestion !== this.renderEditorSuggestionProxy) {
					this.renderEditorSuggestionProxy = new Proxy(popover.renderSuggestion, {
						apply: (renderSuggestion, popover: EditorSuggest<unknown>, args: [unknown, HTMLElement]) => {
							// Call base method first to pre-populate elements
							const returnValue = renderSuggestion.call(popover, ...args);
							if (this.isDisabled()) return returnValue;

							const [value, el] = args;
							if (!value || !(el instanceof HTMLElement)) return;

							switch (this.getSuggestionType(value)) {
								case FILE_SUGGESTION: this.refreshFileIcon(value, el); break;
								case TAG_SUGGESTION: this.refreshTagIcon(value, el); break;
								case PROPERTY_SUGGESTION: this.refreshPropertyIcon(value, el); break;
							}

							return returnValue;
						}
					});

					// Replace original method
					popover.renderSuggestion = this.renderEditorSuggestionProxy;
				}

				return showSuggestions.call(popover, ...args);
			}
		});

		// @ts-expect-error (Private API)
		// Replace original method
		EditorSuggest.prototype.showSuggestions = this.showEditorSuggestionsProxy;
	}

	/**
	 * Determine which type of suggestion this is.
	 */
	private getSuggestionType(value: unknown): string | null {
		if (!value || typeof value !== 'object') {
			return UNKNOWN_SUGGESTION;
		}
		const v = value as Record<string, unknown>;
		if (v.type === 'file' && v.file instanceof TFile) {
			return FILE_SUGGESTION;
		} else if (v.type === 'alias' && v.file instanceof TFile) {
			return FILE_SUGGESTION;
		} else if (v.tag) {
			return TAG_SUGGESTION;
		} else if (v.widget) {
			return PROPERTY_SUGGESTION;
		} else {
			return UNKNOWN_SUGGESTION;
		}
	}

	/**
	 * Refresh a file suggestion icon.
	 */
	private refreshFileIcon(value: unknown, el: HTMLElement): void {
		const fileId: string = ((value as Record<string, unknown>)?.file as TFile)?.path;
		if (!fileId) return;
		const file = this.plugin.getFileItem(fileId);
		if (!file) return;
		const rule = this.plugin.ruleManager.checkRuling('file', fileId) ?? file;

		el.addClass('iconic-item');
		const iconContainerEl = el.find(':scope > .suggestion-icon')
			?? createDiv({ cls: 'suggestion-icon' });
		const iconEl = iconContainerEl.find(':scope > .suggestion-flair')
			?? iconContainerEl.createSpan({ cls: 'suggestion-flair' });
		el.prepend(iconContainerEl);
		if (rule) {
			if (!rule.icon && !rule.color) iconEl.addClass('iconic-invisible');
			this.refreshIcon(rule, iconEl);
		}
	}

	/**
	 * Refresh a property suggestion icon.
	 */
	private refreshPropertyIcon(value: unknown, el: HTMLElement): void {
		const v = value as Record<string, unknown>;
		switch (v?.type) {
			// Property suggestions
			case 'text': {
				const propId = v?.text as string;
				if (propId) {
					const prop = this.plugin.getPropertyItem(propId);
					const iconEl = el.find(':scope > .suggestion-icon > .suggestion-flair');
					if (iconEl) this.refreshIcon(prop, iconEl);
				}
				break;
			}
			// BASES: File attribute suggestions
			case 'file': break;
			// BASES: Formula suggestions
			case 'formula': break;
			// BASES: Property suggestions
			case 'note': {
				const propId = v?.name as string;
				if (propId) {
					const prop = this.plugin.getPropertyItem(propId);
					const iconEl = el.find(':scope > .suggestion-icon > .suggestion-flair');
					if (iconEl) this.refreshIcon(prop, iconEl);
				}
				break;
			}
		}
	}

	/**
	 * Refresh a tag suggestion icon.
	 */
	private refreshTagIcon(value: unknown, el: HTMLElement): void {
		const tagId = (value as Record<string, unknown>)?.tag as string;
		if (tagId) {
			el.addClass('mod-complex', 'iconic-item');
			const tag = this.plugin.getTagItem(tagId);
			const iconContainerEl = el.find(':scope > .suggestion-icon')
				?? createDiv({ cls: 'suggestion-icon' });
			const iconEl = iconContainerEl.find(':scope > .suggestion-flair')
				?? iconContainerEl.createSpan({ cls: 'suggestion-flair' });
			el.prepend(iconContainerEl);
			if (tag) {
				tag.iconDefault = 'lucide-tag';
				if (!tag.icon && !tag.color) iconEl.addClass('iconic-invisible');
				this.refreshIcon(tag, iconEl);
			}
		}
	}

	/**
	 * Check whether user has disabled suggestion icons.
	 */
	private isDisabled(): boolean {
		return !this.plugin.settings.showSuggestionIcons;
	}

	/**
	 * @override
	 */
	unload(): void {
		super.unload();

		// @ts-expect-error (Private API)
		if (AbstractInputSuggest.prototype.showSuggestions === this.showAbstractSuggestionsProxy) {
			// @ts-expect-error (Private API)
			AbstractInputSuggest.prototype.showSuggestions = this.showAbstractSuggestionsOriginal;
		}

		// @ts-expect-error (Private API)
		if (EditorSuggest.prototype.showSuggestions === this.showEditorSuggestionsProxy) {
			// @ts-expect-error (Private API)
			EditorSuggest.prototype.showSuggestions = this.showEditorSuggestionsOriginal;
		}
	}
}
