import { DropdownComponent, ExtraButtonComponent, Platform, Setting, TextComponent } from 'obsidian';
import { STRINGS } from 'src/IconicPlugin';
import { ConditionItem } from 'src/managers/RuleManager';

/**
 * Setting for displaying a condition item.
 */
export default class ConditionSetting extends Setting {
	condition: ConditionItem;

	// Components
	readonly srcDropdown: DropdownComponent;
	readonly opDropdown: DropdownComponent;
	readonly valInput: TextComponent;
	readonly valDropdown: DropdownComponent;
	readonly ctrlContainerEl: HTMLElement;
	readonly dropContainerEl: HTMLElement;

	// Elements
	readonly gripEl: HTMLElement;
	ghostEl: HTMLElement | null = null;

	// Callbacks
	private sourceChangeCallback: ((source: string) => void) | null = null;
	private operatorChangeCallback: ((operator: string) => void) | null = null;
	private valueChangeCallback: ((value: string) => void) | null = null;
	private dragStartCallback: ((x: number, y: number) => void) | null = null;
	private dragCallback: ((x: number, y: number) => void) | null = null;
	private dragEndCallback: (() => void) | null = null;
	private removeCallback: (() => void) | null = null;

	constructor(containerEl: HTMLElement, condition: ConditionItem,) {
		super(containerEl);
		this.condition = condition;

		this.settingEl.addClass('iconic-condition');
		this.infoEl.remove();

		// BUTTON: Grip
		this.gripEl = new ExtraButtonComponent(this.controlEl)
			.setIcon('lucide-grip-vertical')
			.extraSettingsEl;
		this.gripEl.addClass('iconic-grip');

		this.ctrlContainerEl = Platform.isPhone
			? this.controlEl.createDiv({ cls: 'iconic-control-column' })
			: this.controlEl;
		this.dropContainerEl = Platform.isPhone
			? this.ctrlContainerEl.createDiv({ cls: 'iconic-dropdown-row' })
			: this.controlEl;

		// DROPDOWN: Source
		this.srcDropdown = new DropdownComponent(this.dropContainerEl)
			.onChange(value => this.sourceChangeCallback?.(value));

		// DROPDOWN: Operator
		this.opDropdown = new DropdownComponent(this.dropContainerEl)
			.onChange(value => this.operatorChangeCallback?.(value));

		// FIELD: Value
		this.valInput = new TextComponent(this.ctrlContainerEl)
			.onChange(value => this.valueChangeCallback?.(value));

		// DROPDOWN: Value
		this.valDropdown = new DropdownComponent(this.ctrlContainerEl)
			.onChange(value => this.valueChangeCallback?.(value));

		// BUTTON: Remove condition
		this.addExtraButton(button => button
			.setIcon('lucide-trash-2')
			.setTooltip(STRINGS.ruleEditor.removeCondition)
			.onClick(() => this.removeCallback?.())
		);

		// Drag & drop (mouse)
		this.gripEl.addEventListener('pointerdown', (event: PointerEvent) => {
			if (event.pointerType === 'touch') return; // Handled by touch events below
			event.preventDefault();
			const doc = this.settingEl.doc;
			const onPointerMove = (e: PointerEvent) => {
				this.dragCallback?.(e.clientX, e.clientY);
			};
			const onPointerUp = () => {
				doc.removeEventListener('pointermove', onPointerMove);
				doc.removeEventListener('pointerup', onPointerUp);
				this.dragEndCallback?.();
			};
			doc.addEventListener('pointermove', onPointerMove);
			doc.addEventListener('pointerup', onPointerUp);
			this.dragStartCallback?.(event.clientX, event.clientY);
		});

		// Drag & drop (multi-touch)
		this.gripEl.addEventListener('touchstart', event => {
			event.preventDefault(); // Prevent dragstart
			const touch = event.targetTouches[0];
			this.dragStartCallback?.(touch.clientX, touch.clientY);
		});
		this.gripEl.addEventListener('touchmove', event => {
			event.preventDefault(); // Prevent scrolling
			const touch = event.targetTouches[0];
			this.dragCallback?.(touch.clientX, touch.clientY);
		});
		this.gripEl.addEventListener('touchend', () => this.dragEndCallback?.());
		this.gripEl.addEventListener('touchcancel', () => this.dragEndCallback?.());
	}

	onSourceChange(callback: (source: string) => void): this {
		this.sourceChangeCallback = callback;
		return this;
	}

	onOperatorChange(callback: (operator: string) => void): this {
		this.operatorChangeCallback = callback;
		return this;
	}

	onValueChange(callback: (value: string) => void): this {
		this.valueChangeCallback = callback;
		return this;
	}

	onRemove(callback: () => void): this {
		this.removeCallback = callback;
		return this;
	}

	onDragStart(callback: (x: number, y: number) => void): this {
		this.dragStartCallback = callback;
		return this;
	}

	onDrag(callback: (x: number, y: number) => void): this {
		this.dragCallback = callback;
		return this;
	}

	onDragEnd(callback: () => void): this {
		this.dragEndCallback = callback;
		return this;
	}
}
