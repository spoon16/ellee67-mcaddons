// Test double for @minecraft/server-ui. Forms record what they would show; tests queue the responses.

export enum FormCancelationReason {
  UserBusy = "UserBusy",
  UserClosed = "UserClosed",
}

export interface QueuedResponse {
  canceled?: boolean;
  cancelationReason?: FormCancelationReason;
  selection?: number;
  formValues?: Array<boolean | number | string | undefined>;
}

type Responder = QueuedResponse | ((form: unknown, player: unknown) => QueuedResponse | Promise<QueuedResponse>);

export const ui = {
  /** Responses consumed in order by `show()`. A function receives the form and player. */
  responses: [] as Responder[],
  shown: 0,
  forms: [] as unknown[],
  reset(): void {
    ui.responses = [];
    ui.shown = 0;
    ui.forms = [];
  },
};

async function answer(form: unknown, player: unknown): Promise<QueuedResponse> {
  ui.shown++;
  ui.forms.push(form);
  const next = ui.responses.shift();
  if (next === undefined) return { canceled: true, cancelationReason: FormCancelationReason.UserClosed };
  return typeof next === "function" ? await next(form, player) : next;
}

export class ActionFormData {
  titleText = "";
  bodyText = "";
  buttons: Array<{ label: unknown; icon?: string }> = [];
  title(text: unknown): this {
    this.titleText = String(text);
    return this;
  }
  body(text: unknown): this {
    this.bodyText = String(text);
    return this;
  }
  button(label: unknown, icon?: string): this {
    this.buttons.push({ label, icon });
    return this;
  }
  divider(): this {
    return this;
  }
  header(): this {
    return this;
  }
  label(): this {
    return this;
  }
  show(player: unknown): Promise<QueuedResponse> {
    return answer(this, player);
  }
}

export class ModalFormData {
  titleText = "";
  submitText = "";
  controls: Array<{ kind: string; label: string; defaultValue?: unknown }> = [];
  title(text: unknown): this {
    this.titleText = String(text);
    return this;
  }
  toggle(label: unknown, options?: { defaultValue?: boolean }): this {
    this.controls.push({ kind: "toggle", label: String(label), defaultValue: options?.defaultValue ?? false });
    return this;
  }
  slider(label: unknown, _min: number, _max: number, options?: { defaultValue?: number }): this {
    this.controls.push({ kind: "slider", label: String(label), defaultValue: options?.defaultValue });
    return this;
  }
  textField(label: unknown, _placeholder: unknown, options?: { defaultValue?: string }): this {
    this.controls.push({ kind: "textField", label: String(label), defaultValue: options?.defaultValue });
    return this;
  }
  dropdown(label: unknown, _items: unknown[], options?: { defaultValueIndex?: number }): this {
    this.controls.push({ kind: "dropdown", label: String(label), defaultValue: options?.defaultValueIndex });
    return this;
  }
  submitButton(text: unknown): this {
    this.submitText = String(text);
    return this;
  }
  divider(): this {
    return this;
  }
  header(): this {
    return this;
  }
  label(): this {
    return this;
  }
  show(player: unknown): Promise<QueuedResponse> {
    return answer(this, player);
  }
}

export class MessageFormData {
  titleText = "";
  bodyText = "";
  buttons: string[] = [];
  title(text: unknown): this {
    this.titleText = String(text);
    return this;
  }
  body(text: unknown): this {
    this.bodyText = String(text);
    return this;
  }
  button1(text: unknown): this {
    this.buttons[0] = String(text);
    return this;
  }
  button2(text: unknown): this {
    this.buttons[1] = String(text);
    return this;
  }
  show(player: unknown): Promise<QueuedResponse> {
    return answer(this, player);
  }
}
